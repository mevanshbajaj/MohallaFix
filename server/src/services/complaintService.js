import { q } from '../db.js';
import { HttpError } from '../middleware/error.js';

/** Allowed lifecycle moves. Everything else is rejected with 409. */
export const TRANSITIONS = {
  submitted: ['assigned'],
  assigned: ['worker_notified', 'in_progress'],
  worker_notified: ['in_progress'],
  in_progress: ['resolved'],
  resolved: ['verified', 'reopened'],
  reopened: ['assigned'],
  verified: [],
};

/** SQL expression: metres between ($1 lat, $2 lng) and complaint row alias c (haversine). */
export const DIST_SQL = `(6371000 * acos(least(1,
  cos(radians($1::float8)) * cos(radians(c.lat)) * cos(radians(c.lng) - radians($2::float8)) +
  sin(radians($1::float8)) * sin(radians(c.lat)))))`;

export const addEvent = (db, complaintId, actorId, from, to, note) =>
  db.query(
    `INSERT INTO complaint_events (complaint_id, actor_id, from_status, to_status, note) VALUES ($1,$2,$3,$4,$5)`,
    [complaintId, actorId, from, to, note || null]
  );

/** Locks the complaint row so concurrent updates (double taps, two admins) cannot race. */
export async function lockComplaint(db, id) {
  const { rows } = await db.query('SELECT * FROM complaints WHERE id = $1 FOR UPDATE', [id]);
  if (!rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Complaint not found');
  return rows[0];
}

/** Moves a complaint to a new status, enforcing the state machine and writing the audit event. */
export async function changeStatus(db, id, to, actorId, note) {
  const c = await lockComplaint(db, id);
  if (!TRANSITIONS[c.status]?.includes(to)) {
    throw new HttpError(409, 'BAD_TRANSITION', `Cannot move from ${c.status} to ${to}`);
  }
  await db.query(
    `UPDATE complaints SET status = $2::complaint_status,
       resolved_at = CASE WHEN $2::complaint_status = 'resolved' THEN now() WHEN $2::complaint_status = 'reopened' THEN NULL ELSE resolved_at END,
       verified_at = CASE WHEN $2::complaint_status = 'verified' THEN now() ELSE verified_at END,
       sla_due_at  = CASE WHEN $2::complaint_status = 'reopened'
         THEN now() + make_interval(hours => (SELECT sla_hours FROM categories WHERE id = category_id))
         ELSE sla_due_at END
     WHERE id = $1`,
    [id, to]
  );
  await addEvent(db, id, actorId, c.status, to, note);
  return { ...c, status: to };
}

/** Assigns (or reassigns) a worker. Moves new/reopened complaints to assigned -> worker_notified. */
export async function assignWorker(db, id, workerId, actorId, note) {
  const { rows } = await db.query(`SELECT id, name, department_id FROM users WHERE id = $1 AND role = 'worker' AND is_active`, [workerId]);
  if (!rows[0]) throw new HttpError(422, 'BAD_WORKER', 'Choose an active worker');
  const c = await lockComplaint(db, id);
  if (['resolved', 'verified'].includes(c.status)) throw new HttpError(409, 'BAD_TRANSITION', 'Complaint is already resolved');
  await db.query('UPDATE complaints SET assigned_worker_id = $2, department_id = $3 WHERE id = $1', [id, workerId, rows[0].department_id]);
  if (['submitted', 'reopened'].includes(c.status)) {
    await changeStatus(db, id, 'assigned', actorId, `Assigned to ${rows[0].name}`);
    await changeStatus(db, id, 'worker_notified', null, 'Worker notified');
    if (note) await db.query('INSERT INTO internal_notes (complaint_id, author_id, body) VALUES ($1,$2,$3)', [id, actorId, note]);
  } else {
    await addEvent(db, id, actorId, c.status, c.status, `Reassigned to ${rows[0].name}`);
  }
}

/** Nearest colony by centre point. Falls back to null when no areas exist. */
export async function nearestAreaId(db, lat, lng) {
  const { rows } = await db.query(
    `SELECT id FROM areas WHERE center_lat IS NOT NULL
     ORDER BY (center_lat - $1::float8)^2 + (center_lng - $2::float8)^2 LIMIT 1`, [lat, lng]);
  return rows[0]?.id ?? null;
}

const SELECT_COMPLAINT = `
  SELECT c.id, c.public_id, c.status, c.description, c.lat, c.lng, c.address_text, c.location_source,
         c.priority, c.upvotes, c.created_at, c.resolved_at, c.verified_at, c.sla_due_at,
         COALESCE(c.resolved_at, now()) > c.sla_due_at AS sla_breached,
         cat.id AS category_id, cat.slug AS category_slug, cat.label AS category_label, cat.icon AS category_icon,
         a.name AS area_name, c.assigned_worker_id, w.name AS worker_name, c.citizen_id, u.name AS citizen_name
  FROM complaints c
  JOIN categories cat ON cat.id = c.category_id
  JOIN users u ON u.id = c.citizen_id
  LEFT JOIN areas a ON a.id = c.area_id
  LEFT JOIN users w ON w.id = c.assigned_worker_id`;

/** Full complaint with media + timeline. Internal notes only when staff=true. */
export async function getComplaintDetail(where, param, { staff = false, publicView = false } = {}) {
  const { rows } = await q(`${SELECT_COMPLAINT} WHERE ${where}`, [param]);
  const c = rows[0];
  if (!c) throw new HttpError(404, 'NOT_FOUND', 'Complaint not found');
  const [media, events, notes, ver] = await Promise.all([
    q('SELECT id, kind, url, created_at FROM complaint_media WHERE complaint_id = $1 ORDER BY created_at', [c.id]),
    q(`SELECT e.id, e.from_status, e.to_status, e.note, e.created_at, u.name AS actor_name
       FROM complaint_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.complaint_id = $1 ORDER BY e.id`, [c.id]),
    staff ? q(`SELECT n.id, n.body, n.created_at, u.name AS author FROM internal_notes n JOIN users u ON u.id = n.author_id
               WHERE n.complaint_id = $1 ORDER BY n.id DESC`, [c.id]) : { rows: [] },
    q('SELECT is_resolved, comment, created_at FROM verifications WHERE complaint_id = $1', [c.id]),
  ]);
  const out = { ...c, media: media.rows, events: events.rows, verification: ver.rows[0] || null };
  if (staff) out.notes = notes.rows;
  if (publicView) { // anonymous tracking: no names, no exact coordinates
    delete out.citizen_name; delete out.citizen_id; delete out.worker_name; delete out.assigned_worker_id;
    out.lat = +out.lat.toFixed(3); out.lng = +out.lng.toFixed(3);
    out.events = out.events.map(({ actor_name, ...e }) => e);
  }
  return out;
}

export const LIST_SQL = `
  SELECT c.id, c.public_id, c.status, c.created_at, c.sla_due_at, c.lat, c.lng, c.upvotes,
         COALESCE(c.resolved_at, now()) > c.sla_due_at AS sla_breached,
         cat.label AS category_label, cat.icon AS category_icon, cat.slug AS category_slug,
         a.name AS area_name, w.name AS worker_name,
         (SELECT url FROM complaint_media m WHERE m.complaint_id = c.id AND m.kind = 'before' LIMIT 1) AS thumb
  FROM complaints c
  JOIN categories cat ON cat.id = c.category_id
  LEFT JOIN areas a ON a.id = c.area_id
  LEFT JOIN users w ON w.id = c.assigned_worker_id`;
