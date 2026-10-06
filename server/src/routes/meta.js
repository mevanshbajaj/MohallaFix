import { Router } from 'express';
import { q } from '../db.js';
import { wrap } from '../middleware/error.js';

const r = Router();

// Top-level categories, each with its sub-types in `children`
r.get('/categories', wrap(async (_req, res) => {
  const { rows } = await q(`SELECT id, slug, label, icon, sla_hours, default_priority, parent_id
                            FROM categories WHERE is_active ORDER BY sort_order, id`);
  const roots = rows.filter((c) => !c.parent_id).map((c) => ({ ...c, children: [] }));
  const byId = new Map(roots.map((c) => [c.id, c]));
  rows.filter((c) => c.parent_id).forEach((c) => byId.get(c.parent_id)?.children.push(c));
  res.json(roots);
}));

r.get('/areas', wrap(async (_req, res) => {
  const { rows } = await q('SELECT id, name, center_lat, center_lng FROM areas ORDER BY name');
  res.json(rows);
}));
export default r;
