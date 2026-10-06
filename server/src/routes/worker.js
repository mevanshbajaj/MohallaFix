import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db.js';
import { wrap, HttpError } from '../middleware/error.js';
import { auth, requireRole } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { saveImage } from '../services/storage.js';
import { changeStatus, lockComplaint, LIST_SQL } from '../services/complaintService.js';

const r = Router();
r.use(auth, requireRole('worker'));

// My open tasks, most urgent (earliest SLA deadline) first
r.get('/tasks', wrap(async (req, res) => {
  const done = req.query.done === 'true';
  const cond = done ? `c.status IN ('resolved','verified')` : `c.status NOT IN ('resolved','verified')`;
  const { rows } = await q(`${LIST_SQL} WHERE c.assigned_worker_id = $1 AND ${cond} ORDER BY c.sla_due_at LIMIT 100`, [req.user.id]);
  res.json(rows);
}));

// Workers may only start work or resolve. Resolving requires a photo of the finished work.
r.patch('/tasks/:id/status', upload.single('photo'), wrap(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const b = z.object({ status: z.enum(['in_progress', 'resolved']), note: z.string().trim().max(500).optional() }).parse(req.body);
  if (b.status === 'resolved' && !req.file) throw new HttpError(422, 'PHOTO_REQUIRED', 'Add a photo of the completed work');
  const img = req.file ? await saveImage(req.file.buffer) : null;
  await tx(async (db) => {
    const c = await lockComplaint(db, id);
    if (c.assigned_worker_id !== req.user.id) throw new HttpError(403, 'FORBIDDEN', 'This task is not assigned to you');
    if (img) await db.query(`INSERT INTO complaint_media (complaint_id, uploaded_by, kind, url, public_id) VALUES ($1,$2,'after',$3,$4)`, [id, req.user.id, img.url, img.publicId]);
    await changeStatus(db, id, b.status, req.user.id, b.note);
  });
  res.json({ ok: true, status: b.status });
}));

export default r;
