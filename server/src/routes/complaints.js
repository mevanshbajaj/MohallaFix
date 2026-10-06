import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db.js';
import { wrap, HttpError } from '../middleware/error.js';
import { auth, requireRole } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { saveImage } from '../services/storage.js';
import { addEvent, changeStatus, nearestAreaId, getComplaintDetail, LIST_SQL, DIST_SQL, lockComplaint } from '../services/complaintService.js';

const r = Router();

const createSchema = z.object({
  category_id: z.coerce.number().int().positive(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  location_source: z.enum(['gps', 'manual']).default('gps'),
  description: z.string().trim().max(500).optional(),
});

// Public: minimal status lookup by complaint ID (e.g. MH10293). No names, rounded coordinates.
r.get('/track/:publicId', wrap(async (req, res) => {
  res.json(await getComplaintDetail('c.public_id = upper($1)', req.params.publicId, { publicView: true }));
}));

r.use(auth);

// Create a complaint (citizens)
r.post('/', requireRole('citizen'), upload.single('photo'), wrap(async (req, res) => {
  const b = createSchema.parse(req.body);
  if (!req.file) throw new HttpError(422, 'PHOTO_REQUIRED', 'Please add a photo of the problem');

  // Abuse guard: 10 reports per citizen per day
  const { rows: [{ n }] } = await q(`SELECT count(*)::int AS n FROM complaints WHERE citizen_id = $1 AND created_at > now() - interval '1 day'`, [req.user.id]);
  if (n >= 10) throw new HttpError(429, 'DAILY_LIMIT', 'Daily report limit reached. Please try again tomorrow');

  // Double-tap guard: same category, ~20 m, within 2 minutes by the same user
  const dup = await q(`SELECT c.public_id FROM complaints c WHERE c.citizen_id = $3 AND c.category_id = $4
      AND c.created_at > now() - interval '2 minutes' AND ${DIST_SQL} < 20 LIMIT 1`, [b.lat, b.lng, req.user.id, b.category_id]);
  if (dup.rows[0]) throw new HttpError(409, 'JUST_REPORTED', `You already reported this as #${dup.rows[0].public_id}`);

  const { rows: [cat] } = await q('SELECT id, sla_hours, department_id FROM categories WHERE id = $1', [b.category_id]);
  if (!cat) throw new HttpError(422, 'BAD_CATEGORY', 'Unknown category');

  const img = await saveImage(req.file.buffer); // upload first; a failed upload creates no complaint

  const created = await tx(async (db) => {
    const areaId = await nearestAreaId(db, b.lat, b.lng);
    const { rows } = await db.query(
      `INSERT INTO complaints (citizen_id, category_id, area_id, department_id, description, lat, lng, location_source, sla_due_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() + make_interval(hours => $9))
       RETURNING id, public_id, status, sla_due_at`,
      [req.user.id, cat.id, areaId, cat.department_id, b.description || null, b.lat, b.lng, b.location_source, cat.sla_hours]);
    const c = rows[0];
    await db.query(`INSERT INTO complaint_media (complaint_id, uploaded_by, kind, url, public_id) VALUES ($1,$2,'before',$3,$4)`, [c.id, req.user.id, img.url, img.publicId]);
    await addEvent(db, c.id, req.user.id, null, 'submitted', 'Complaint submitted');
    return c;
  });

  // Similar open reports within 50 m: lets the client suggest "me too" next time
  const near = await q(`SELECT c.id, c.public_id, c.upvotes FROM complaints c WHERE c.category_id = $3 AND c.id <> $4
      AND c.status NOT IN ('resolved','verified') AND ${DIST_SQL} < 50 LIMIT 5`, [b.lat, b.lng, cat.id, created.id]);
  res.status(201).json({ ...created, nearby_duplicates: near.rows });
}));

r.get('/mine', requireRole('citizen'), wrap(async (req, res) => {
  const { rows } = await q(`${LIST_SQL} WHERE c.citizen_id = $1 ORDER BY c.created_at DESC LIMIT 100`, [req.user.id]);
  res.json(rows);
}));

// Open complaints around a point (public-safe fields only)
r.get('/nearby', wrap(async (req, res) => {
  const p = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180), radius: z.coerce.number().min(100).max(5000).default(1500) }).parse(req.query);
  const { rows } = await q(
    `SELECT c.id, c.public_id, c.status, c.lat, c.lng, c.upvotes, c.created_at, cat.label AS category_label, cat.icon AS category_icon,
            ${DIST_SQL} AS distance_m
     FROM complaints c JOIN categories cat ON cat.id = c.category_id
     WHERE c.status NOT IN ('resolved','verified') AND ${DIST_SQL} < $3
     ORDER BY distance_m LIMIT 200`, [p.lat, p.lng, p.radius]);
  res.json(rows);
}));

// Detail: owner, admin, or the assigned worker
r.get('/:id', wrap(async (req, res) => {
  const staff = req.user.role !== 'citizen';
  const c = await getComplaintDetail('c.id = $1', z.string().uuid().parse(req.params.id), { staff });
  const ok = req.user.role === 'admin' || c.citizen_id === req.user.id || c.assigned_worker_id === req.user.id;
  if (!ok) throw new HttpError(403, 'FORBIDDEN', 'You do not have access to this complaint');
  res.json(c);
}));

// "Me too" instead of duplicate reports
r.post('/:id/upvote', requireRole('citizen'), wrap(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const out = await tx(async (db) => {
    await db.query('INSERT INTO complaint_upvotes (complaint_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, req.user.id]);
    const { rows } = await db.query('UPDATE complaints SET upvotes = (SELECT count(*) FROM complaint_upvotes WHERE complaint_id = $1) WHERE id = $1 RETURNING upvotes', [id]);
    return rows[0];
  });
  if (!out) throw new HttpError(404, 'NOT_FOUND', 'Complaint not found');
  res.json(out);
}));

// Citizen verifies the fix: yes -> verified, no -> reopened
r.post('/:id/verify', requireRole('citizen'), upload.single('photo'), wrap(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const b = z.object({ is_resolved: z.union([z.boolean(), z.enum(['true', 'false'])]), comment: z.string().trim().max(500).optional() }).parse(req.body);
  const yes = b.is_resolved === true || b.is_resolved === 'true';
  const img = req.file ? await saveImage(req.file.buffer) : null;
  const status = await tx(async (db) => {
    const c = await lockComplaint(db, id);
    if (c.citizen_id !== req.user.id) throw new HttpError(403, 'FORBIDDEN', 'Only the reporter can verify');
    if (c.status !== 'resolved') throw new HttpError(409, 'BAD_TRANSITION', 'This complaint is not waiting for verification');
    // Replace any earlier verdict (a reopened complaint can be verified again later)
    await db.query('DELETE FROM verifications WHERE complaint_id = $1', [id]);
    await db.query('INSERT INTO verifications (complaint_id, citizen_id, is_resolved, comment) VALUES ($1,$2,$3,$4)', [id, req.user.id, yes, b.comment || null]);
    if (img) await db.query(`INSERT INTO complaint_media (complaint_id, uploaded_by, kind, url, public_id) VALUES ($1,$2,'verification',$3,$4)`, [id, req.user.id, img.url, img.publicId]);
    await changeStatus(db, id, yes ? 'verified' : 'reopened', req.user.id, b.comment);
    return yes ? 'verified' : 'reopened';
  });
  res.json({ status });
}));

export default r;
