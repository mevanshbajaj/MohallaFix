import { Router } from 'express';
import { q } from '../db.js';
import { wrap } from '../middleware/error.js';

const r = Router();
r.get('/categories', wrap(async (_req, res) => {
  const { rows } = await q('SELECT id, slug, label, icon, sla_hours FROM categories ORDER BY id');
  res.json(rows);
}));
r.get('/areas', wrap(async (_req, res) => {
  const { rows } = await q('SELECT id, name, center_lat, center_lng FROM areas ORDER BY name');
  res.json(rows);
}));
export default r;
