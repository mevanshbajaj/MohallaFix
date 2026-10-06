// Resets the database, applies schema.sql and loads demo data.
//   npm run db:seed            (refuses to run when NODE_ENV=production unless --force)
import 'dotenv/config';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('Refusing to wipe a production database. Re-run with --force if you are sure.');
  process.exit(1);
}

let s = 42;
const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const H = 3600e3;
const CENTER = [30.4846, 76.5944];

const DEPTS = ['Roads & Civil', 'Sanitation', 'Electrical', 'Water & Sewerage'];
const CATS = [ // slug, label, icon, dept index, SLA hours
  ['pothole', 'Pothole', '🕳️', 0, 72], ['garbage', 'Garbage pile', '🗑️', 1, 24], ['streetlight', 'Broken streetlight', '💡', 2, 48],
  ['water_leak', 'Water leakage', '💧', 3, 24], ['sewer', 'Overflowing sewer', '🚰', 3, 24], ['road_damage', 'Damaged road', '🛣️', 0, 96],
  ['stray_animals', 'Stray animals', '🐕', 1, 48], ['illegal_dumping', 'Illegal dumping', '🚯', 1, 48], ['drainage', 'Drainage blockage', '🌊', 3, 48],
];
const AREAS = ['Model Town', 'Shivalik Colony', 'Mandi Road', 'College Area'];
const NOTES = ['Near the park gate', 'Has been like this for a week', 'Dangerous for two-wheelers at night', 'Smell is unbearable', 'Children walk here to school', ''];

const hash = await bcrypt.hash('Demo@1234', 10);
const c = await pool.connect();
try {
  await c.query('BEGIN');
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await c.query(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

  const dept = [];
  for (const d of DEPTS) dept.push((await c.query('INSERT INTO departments (name) VALUES ($1) RETURNING id', [d])).rows[0].id);
  const cat = [];
  for (const [slug, label, icon, d, sla] of CATS)
    cat.push({ id: (await c.query('INSERT INTO categories (slug,label,icon,department_id,sla_hours) VALUES ($1,$2,$3,$4,$5) RETURNING id', [slug, label, icon, dept[d], sla])).rows[0].id, sla });
  const areas = [];
  for (const [i, n] of AREAS.entries())
    areas.push({ id: (await c.query('INSERT INTO areas (name,center_lat,center_lng) VALUES ($1,$2,$3) RETURNING id', [n, CENTER[0] + (i % 2) * 0.012 - 0.006, CENTER[1] + Math.floor(i / 2) * 0.014 - 0.007])).rows[0].id, lat: CENTER[0] + (i % 2) * 0.012 - 0.006, lng: CENTER[1] + Math.floor(i / 2) * 0.014 - 0.007 });

  const user = async (name, email, role, d = null) =>
    (await c.query('INSERT INTO users (name,email,password_hash,role,department_id) VALUES ($1,$2,$3,$4,$5) RETURNING id', [name, email, hash, role, d])).rows[0].id;
  await user('Admin Officer', 'admin@demo.in', 'admin');
  const workers = [await user('Ramesh Kumar', 'worker1@demo.in', 'worker', dept[0]), await user('Sunita Devi', 'worker2@demo.in', 'worker', dept[1]), await user('Imran Khan', 'worker3@demo.in', 'worker', dept[2]), await user('Gurpreet Singh', 'worker4@demo.in', 'worker', dept[3])];
  const citizens = [];
  for (let i = 1; i <= 5; i++) citizens.push(await user(`Citizen ${i}`, `citizen${i}@demo.in`, 'citizen'));

  // ~70 complaints over 60 days with a realistic mix of states and a few repeat hotspots
  const hotspot = { lat: areas[0].lat + 0.002, lng: areas[0].lng - 0.001 };
  for (let i = 0; i < 70; i++) {
    const k = i % 9 === 0 ? 0 : Math.floor(rnd() * cat.length);
    const a = i % 9 === 0 ? areas[0] : pick(areas);
    const lat = i % 9 === 0 ? hotspot.lat + (rnd() - 0.5) * 0.0004 : a.lat + (rnd() - 0.5) * 0.012;
    const lng = i % 9 === 0 ? hotspot.lng + (rnd() - 0.5) * 0.0004 : a.lng + (rnd() - 0.5) * 0.014;
    const ageH = rnd() * 60 * 24;
    const roll = rnd();
    const target = ageH < 12 ? 'submitted' : roll < 0.12 ? 'submitted' : roll < 0.22 ? 'worker_notified' : roll < 0.38 ? 'in_progress' : roll < 0.45 ? 'resolved' : roll < 0.48 ? 'reopened' : 'verified';
    const chain = ['submitted', 'assigned', 'worker_notified', 'in_progress', 'resolved', 'verified'];
    const created = Date.now() - ageH * H;
    const sla = created + cat[k].sla * H;
    const w = target === 'submitted' ? null : pick(workers);
    const resolveAfter = cat[k].sla * (0.4 + rnd() * 1.2) * H; // some finish late -> SLA violations
    const resolvedAt = ['resolved', 'verified'].includes(target) ? created + resolveAfter : null;
    const { rows: [row] } = await c.query(
      `INSERT INTO complaints (citizen_id,category_id,area_id,department_id,description,lat,lng,location_source,status,assigned_worker_id,sla_due_at,created_at,resolved_at,verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'gps',$8,$9,$10,$11,$12,$13) RETURNING id`,
      [pick(citizens), cat[k].id, a.id, dept[CATS[k][3]], pick(NOTES) || null, lat, lng, target === 'reopened' ? 'reopened' : target, w, new Date(sla), new Date(created), resolvedAt && new Date(resolvedAt), target === 'verified' ? new Date(resolvedAt + 6 * H) : null]);
    const upto = target === 'reopened' ? 4 : chain.indexOf(target);
    for (let j = 0; j <= upto; j++)
      await c.query('INSERT INTO complaint_events (complaint_id,from_status,to_status,created_at) VALUES ($1,$2,$3,$4)', [row.id, j ? chain[j - 1] : null, chain[j], new Date(created + j * Math.min(resolveAfter, 6 * H) / 5)]);
    if (target === 'reopened') await c.query(`INSERT INTO complaint_events (complaint_id,from_status,to_status,note) VALUES ($1,'resolved','reopened','Still leaking')`, [row.id]);
  }
  await c.query('COMMIT');
  console.log('Seeded. Logins (password Demo@1234): admin@demo.in, worker1@demo.in, citizen1@demo.in');
} catch (e) {
  await c.query('ROLLBACK');
  console.error(e);
  process.exitCode = 1;
} finally {
  c.release();
  await pool.end();
}
