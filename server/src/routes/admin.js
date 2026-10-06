import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { q, tx } from '../db.js';
import { wrap } from '../middleware/error.js';
import { auth, requireRole } from '../middleware/auth.js';
import { assignWorker, changeStatus, lockComplaint, addEvent, LIST_SQL } from '../services/complaintService.js';
import { audit } from '../services/audit.js';
import { deleteImages } from '../services/storage.js';
import { HttpError } from '../middleware/error.js';

const r = Router();
r.use(auth, requireRole('admin'));
const uuid = z.string().uuid();

// Overview cards
r.get('/stats', wrap(async (_req, res) => {
  const { rows } = await q(`SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE status IN ('submitted','under_review','assigned','worker_notified','reopened'))::int AS pending,
    count(*) FILTER (WHERE priority = 'critical' AND status NOT IN ('resolved','verified','rejected'))::int AS critical,
    count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
    count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
    count(*) FILTER (WHERE status IN ('resolved','verified'))::int AS resolved,
    count(*) FILTER (WHERE status NOT IN ('resolved','verified','rejected') AND now() > sla_due_at)::int AS sla_open_breached
    FROM complaints`);
  res.json(rows[0]);
}));

// Filterable, paginated list
r.get('/complaints', wrap(async (req, res) => {
  const f = z.object({
    status: z.enum(['pending', 'in_progress', 'resolved', 'rejected']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    category: z.coerce.number().int().optional(), area: z.coerce.number().int().optional(),
    overdue: z.enum(['true']).optional(), q: z.string().trim().max(50).optional(),
    page: z.coerce.number().int().min(1).default(1),
  }).parse(req.query);
  const w = [], p = [];
  const add = (sql, v) => { p.push(v); w.push(sql.replace('?', '$' + p.length)); };
  if (f.status === 'pending') w.push(`c.status IN ('submitted','under_review','assigned','worker_notified','reopened')`);
  if (f.status === 'rejected') w.push(`c.status = 'rejected'`);
  if (f.priority) add('c.priority = ?', f.priority);
  if (f.status === 'in_progress') w.push(`c.status = 'in_progress'`);
  if (f.status === 'resolved') w.push(`c.status IN ('resolved','verified')`);
  if (f.category) add('(c.category_id = ? OR cat.parent_id = ?)'.replace('?', '$' + (p.length + 1)).replace('?', '$' + (p.length + 1)), f.category);
  if (f.area) add('c.area_id = ?', f.area);
  if (f.overdue) w.push(`c.status NOT IN ('resolved','verified','rejected') AND now() > c.sla_due_at`);
  if (f.q) { const n = p.length + 1; p.push(`%${f.q}%`); w.push(`(c.public_id ILIKE $${n} OR c.description ILIKE $${n})`); }
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const { rows } = await q(`${LIST_SQL} ${where} ORDER BY c.created_at DESC LIMIT 25 OFFSET ${(f.page - 1) * 25}`, p);
  res.json(rows);
}));

r.patch('/complaints/:id/assign', wrap(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const b = z.object({ worker_id: uuid, note: z.string().trim().max(500).optional() }).parse(req.body);
  await tx((db) => assignWorker(db, id, b.worker_id, req.user.id, b.note));
  res.json({ ok: true });
}));

r.patch('/complaints/:id/status', wrap(async (req, res) => {
  const b = z.object({ status: z.enum(['under_review', 'assigned', 'worker_notified', 'in_progress', 'resolved', 'verified', 'reopened', 'rejected']), note: z.string().trim().max(500).optional() }).parse(req.body);
  if (b.status === 'rejected' && !b.note) throw new HttpError(422, 'REASON_REQUIRED', 'Please give a reason for rejecting this complaint');
  await tx(async (db) => {
    const before = await changeStatus(db, uuid.parse(req.params.id), b.status, req.user.id, b.note);
    await audit(db, req.user.id, 'complaint.status_changed', 'complaint', req.params.id, { from: before.previous_status, to: b.status, note: b.note });
  });
  res.json({ ok: true });
}));

r.post('/complaints/:id/notes', wrap(async (req, res) => {
  const b = z.object({ body: z.string().trim().min(1).max(1000) }).parse(req.body);
  const { rows } = await q('INSERT INTO internal_notes (complaint_id, author_id, body) VALUES ($1,$2,$3) RETURNING id, body, created_at', [uuid.parse(req.params.id), req.user.id, b.body]);
  res.status(201).json(rows[0]);
}));

// Only staff can set priority (including CRITICAL). Recorded in the timeline and the audit log.
r.patch('/complaints/:id/priority', wrap(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const b = z.object({ priority: z.enum(['low', 'medium', 'high', 'critical']), note: z.string().trim().max(300).optional() }).parse(req.body);
  await tx(async (db) => {
    const c = await lockComplaint(db, id);
    if (c.priority === b.priority) return;
    await db.query(`UPDATE complaints SET priority = $2, priority_source = 'admin' WHERE id = $1`, [id, b.priority]);
    await addEvent(db, id, req.user.id, c.status, c.status, `Priority changed from ${c.priority} to ${b.priority}${b.note ? ': ' + b.note : ''}`);
    await audit(db, req.user.id, 'complaint.priority_changed', 'complaint', id, { from: c.priority, to: b.priority, note: b.note });
  });
  res.json({ ok: true, priority: b.priority });
}));

// Permanently delete (spam/abuse). Also removes the stored photos.
r.delete('/complaints/:id', wrap(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const ids = await tx(async (db) => {
    const c = await lockComplaint(db, id);
    const m = (await db.query('SELECT public_id FROM complaint_media WHERE complaint_id = $1', [id])).rows.map((x) => x.public_id);
    await db.query('DELETE FROM complaints WHERE id = $1', [id]);
    await audit(db, req.user.id, 'complaint.deleted', 'complaint', id, { public_id: c.public_id, status: c.status, images: m.length });
    return m;
  });
  await deleteImages(ids);
  res.json({ ok: true });
}));

// Marker feed for the admin map
r.get('/map', wrap(async (_req, res) => {
  const { rows } = await q(`SELECT c.id, c.public_id, c.status, c.lat, c.lng, cat.label AS category_label, cat.icon AS category_icon,
      (c.status <> 'rejected' AND COALESCE(c.resolved_at, now()) > c.sla_due_at) AS sla_breached
    FROM complaints c JOIN categories cat ON cat.id = c.category_id
    WHERE c.created_at > now() - interval '180 days' LIMIT 2000`);
  res.json(rows);
}));

r.get('/analytics/summary', wrap(async (_req, res) => {
  const [avg, byCat, byArea, repeat, sla] = await Promise.all([
    q(`SELECT round(avg(resolution_hours)::numeric, 1)::float AS avg_hours FROM v_complaint_metrics WHERE resolved_at IS NOT NULL`),
    q(`SELECT cat.label, cat.icon, count(*)::int AS total, count(*) FILTER (WHERE m.resolved_at IS NOT NULL)::int AS resolved,
         round(avg(m.resolution_hours)::numeric, 1)::float AS avg_hours
       FROM v_complaint_metrics m JOIN categories leaf ON leaf.id = m.category_id
       JOIN categories cat ON cat.id = COALESCE(leaf.parent_id, leaf.id) GROUP BY cat.id ORDER BY total DESC`),
    q(`SELECT a.name, count(*)::int AS total, count(*) FILTER (WHERE m.status NOT IN ('resolved','verified','rejected'))::int AS open
       FROM v_complaint_metrics m JOIN areas a ON a.id = m.area_id GROUP BY a.id ORDER BY total DESC`),
    // Repeat complaints: same category inside the same ~100 m grid cell, 3+ times in 90 days
    q(`SELECT cat.label, cat.icon, (array_agg(a.name))[1] AS area_name, round(avg(c.lat)::numeric, 5)::float AS lat,
         round(avg(c.lng)::numeric, 5)::float AS lng, count(*)::int AS n
       FROM complaints c JOIN categories cat ON cat.id = c.category_id LEFT JOIN areas a ON a.id = c.area_id
       WHERE c.created_at > now() - interval '90 days'
       GROUP BY round(c.lat::numeric, 3), round(c.lng::numeric, 3), cat.id HAVING count(*) >= 3 ORDER BY n DESC LIMIT 10`),
    q(`SELECT count(*) FILTER (WHERE sla_breached)::int AS breached, count(*)::int AS total FROM v_complaint_metrics`),
  ]);
  res.json({ avg_resolution_hours: avg.rows[0].avg_hours, by_category: byCat.rows, by_area: byArea.rows, repeat_locations: repeat.rows, sla: sla.rows[0] });
}));

r.get('/analytics/workers', wrap(async (_req, res) => {
  const { rows } = await q(`SELECT u.id, u.name, d.name AS department,
      count(m.id)::int AS assigned,
      count(m.id) FILTER (WHERE m.resolved_at IS NOT NULL)::int AS resolved,
      count(m.id) FILTER (WHERE m.resolved_at IS NULL)::int AS open,
      round(avg(m.resolution_hours)::numeric, 1)::float AS avg_hours,
      count(m.id) FILTER (WHERE m.sla_breached)::int AS sla_breached
    FROM users u LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN v_complaint_metrics m ON m.assigned_worker_id = u.id
    WHERE u.role = 'worker' GROUP BY u.id, d.name ORDER BY resolved DESC`);
  res.json(rows);
}));

// CSV export. Cells starting with = + - @ are prefixed to block spreadsheet formula injection.
r.get('/export.csv', wrap(async (req, res) => {
  const { from = '1970-01-01', to = '2999-01-01' } = req.query;
  const { rows } = await q(`SELECT c.public_id, cat.label AS category, a.name AS area, c.status, c.created_at, c.resolved_at,
      c.sla_due_at, w.name AS worker, c.description FROM complaints c
    JOIN categories cat ON cat.id = c.category_id LEFT JOIN areas a ON a.id = c.area_id LEFT JOIN users w ON w.id = c.assigned_worker_id
    WHERE c.created_at >= $1 AND c.created_at < $2 ORDER BY c.created_at DESC`, [from, to]);
  const cell = (v) => { let s = v instanceof Date ? v.toISOString() : String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const head = ['public_id', 'category', 'area', 'status', 'created_at', 'resolved_at', 'sla_due_at', 'worker', 'description'];
  res.type('text/csv').attachment('mohallafix-complaints.csv').send([head.join(','), ...rows.map((x) => head.map((h) => cell(x[h])).join(','))].join('\n'));
}));

r.get('/departments', wrap(async (_req, res) => res.json((await q('SELECT id, name FROM departments ORDER BY name')).rows)));
r.get('/workers', wrap(async (_req, res) => {
  const { rows } = await q(`SELECT u.id, u.name, u.email, u.phone, d.name AS department, u.is_active,
      (SELECT count(*)::int FROM complaints c WHERE c.assigned_worker_id = u.id AND c.status NOT IN ('resolved','verified','rejected')) AS open_tasks
    FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.role = 'worker' ORDER BY u.name`);
  res.json(rows);
}));
r.post('/workers', wrap(async (req, res) => {
  const b = z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email(), password: z.string().min(8), department_id: z.coerce.number().int() }).parse(req.body);
  const { rows } = await q(`INSERT INTO users (name, email, password_hash, role, department_id) VALUES ($1,$2,$3,'worker',$4) RETURNING id, name, email`, [b.name, b.email, await bcrypt.hash(b.password, 10), b.department_id]);
  res.status(201).json(rows[0]);
}));

export default r;
