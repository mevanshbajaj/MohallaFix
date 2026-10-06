// Resets the database, applies schema.sql + migrations, and loads demo data.
//   npm run db:seed            (refuses to run when NODE_ENV=production unless --force)
import 'dotenv/config';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';
import { migrate } from './migrate.js';

if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('Refusing to wipe a production database. Re-run with --force if you are sure.');
  process.exit(1);
}

let s = 42;
const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const H = 3600e3;
const CENTER = [30.4846, 76.5944];
const AREAS = ['Model Town', 'Shivalik Colony', 'Mandi Road', 'College Area'];
const NOTES = ['Near the park gate', 'Has been like this for a week', 'Dangerous for two-wheelers at night', 'Smell is unbearable', 'Children walk here to school', ''];
const PRI = ['low', 'medium', 'high', 'critical'];

const hash = await bcrypt.hash('Demo@1234', 10);

// 1) fresh schema
const c0 = await pool.connect();
try {
  await c0.query('BEGIN');
  await c0.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await c0.query(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  await c0.query('COMMIT');
} finally { c0.release(); }

// 2) migrations (creates departments + category tree)
await migrate(pool, () => {});

// 3) demo data
const c = await pool.connect();
try {
  await c.query('BEGIN');
  const dept = Object.fromEntries((await c.query('SELECT id, name FROM departments')).rows.map((d) => [d.name, d.id]));
  const deptIds = Object.values(dept);
  const cats = (await c.query(`SELECT id, sla_hours, department_id, default_priority FROM categories
                               WHERE id NOT IN (SELECT parent_id FROM categories WHERE parent_id IS NOT NULL)`)).rows;
  const areas = [];
  for (const [i, n] of AREAS.entries()) {
    const lat = CENTER[0] + (i % 2) * 0.012 - 0.006, lng = CENTER[1] + Math.floor(i / 2) * 0.014 - 0.007;
    areas.push({ id: (await c.query('INSERT INTO areas (name,center_lat,center_lng) VALUES ($1,$2,$3) RETURNING id', [n, lat, lng])).rows[0].id, lat, lng });
  }
  const user = async (name, email, role, d = null) =>
    (await c.query('INSERT INTO users (name,email,password_hash,role,department_id) VALUES ($1,$2,$3,$4,$5) RETURNING id', [name, email, hash, role, d])).rows[0].id;
  const admin = await user('Admin Officer', 'admin@demo.in', 'admin');
  const workers = [await user('Ramesh Kumar', 'worker1@demo.in', 'worker', dept['Roads & Civil']), await user('Sunita Devi', 'worker2@demo.in', 'worker', dept['Sanitation']),
    await user('Imran Khan', 'worker3@demo.in', 'worker', dept['Electrical']), await user('Gurpreet Singh', 'worker4@demo.in', 'worker', dept['Water & Sewerage'])];
  const citizens = [];
  for (let i = 1; i <= 5; i++) citizens.push(await user(`Citizen ${i}`, `citizen${i}@demo.in`, 'citizen'));

  const hotspot = { lat: areas[0].lat + 0.002, lng: areas[0].lng - 0.001 };
  const chain = ['submitted', 'under_review', 'assigned', 'worker_notified', 'in_progress', 'resolved', 'verified'];
  for (let i = 0; i < 70; i++) {
    const cat = i % 9 === 0 ? cats[0] : pick(cats);
    const a = i % 9 === 0 ? areas[0] : pick(areas);
    const lat = i % 9 === 0 ? hotspot.lat + (rnd() - 0.5) * 0.0004 : a.lat + (rnd() - 0.5) * 0.012;
    const lng = i % 9 === 0 ? hotspot.lng + (rnd() - 0.5) * 0.0004 : a.lng + (rnd() - 0.5) * 0.014;
    const ageH = rnd() * 60 * 24, roll = rnd();
    const target = ageH < 12 ? 'submitted' : roll < 0.08 ? 'submitted' : roll < 0.14 ? 'under_review' : roll < 0.22 ? 'worker_notified' : roll < 0.38 ? 'in_progress'
      : roll < 0.45 ? 'resolved' : roll < 0.48 ? 'reopened' : roll < 0.52 ? 'rejected' : 'verified';
    const created = Date.now() - ageH * H;
    const w = ['submitted', 'under_review', 'rejected'].includes(target) ? null : pick(workers);
    const resolveAfter = cat.sla_hours * (0.4 + rnd() * 1.2) * H; // some finish late -> SLA violations
    const resolvedAt = ['resolved', 'verified'].includes(target) ? created + resolveAfter : null;
    let pri = cat.default_priority;
    if (rnd() < 0.15 && pri !== 'critical') pri = PRI[PRI.indexOf(pri) + 1];
    if (rnd() < 0.04) pri = 'critical';
    const { rows: [row] } = await c.query(
      `INSERT INTO complaints (citizen_id,category_id,area_id,department_id,description,lat,lng,location_source,status,assigned_worker_id,priority,priority_source,sla_due_at,created_at,resolved_at,verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'gps',$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [pick(citizens), cat.id, a.id, cat.department_id || pick(deptIds), pick(NOTES) || null, lat, lng, target, w, pri, pri === cat.default_priority ? 'rule' : 'admin',
       new Date(created + cat.sla_hours * H), new Date(created), resolvedAt && new Date(resolvedAt), target === 'verified' ? new Date(resolvedAt + 6 * H) : null]);
    // history rows (skipping under_review for older complaints, as the original flow allowed)
    const path = target === 'rejected' ? ['submitted', 'under_review', 'rejected'] : target === 'reopened' ? [...chain.slice(0, 6), 'reopened'] : chain.slice(0, chain.indexOf(target) + 1);
    const steps = path.filter((st, j) => st !== 'under_review' || j === 1 && (target === 'rejected' || target === 'under_review' || rnd() < 0.4));
    for (const [j, st] of steps.entries()) {
      await c.query('INSERT INTO complaint_events (complaint_id,actor_id,from_status,to_status,note,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [row.id, j ? admin : null, j ? steps[j - 1] : null, st, st === 'rejected' ? 'Duplicate of an earlier report' : st === 'reopened' ? 'Still not fixed' : null,
         new Date(created + j * Math.min(resolveAfter, 6 * H) / 5)]);
    }
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
