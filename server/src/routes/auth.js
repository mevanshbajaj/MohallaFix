import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { q } from '../db.js';
import { wrap, HttpError } from '../middleware/error.js';
import { auth, signToken } from '../middleware/auth.js';

const r = Router();
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(20).optional(),
  password: z.string().min(8).max(100),
});

// Public sign-up always creates a citizen. Workers/admins are created by an admin.
r.post('/register', wrap(async (req, res) => {
  const b = registerSchema.parse(req.body);
  const hash = await bcrypt.hash(b.password, 10);
  const { rows } = await q(
    `INSERT INTO users (name, email, phone, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role`,
    [b.name, b.email, b.phone || null, hash]);
  res.status(201).json({ token: signToken(rows[0]), user: pub(rows[0]) });
}));

r.post('/login', wrap(async (req, res) => {
  const b = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }).parse(req.body);
  const { rows } = await q('SELECT * FROM users WHERE email = $1', [b.email]);
  const u = rows[0];
  // Same message for unknown email and wrong password: do not leak which accounts exist
  if (!u || !u.is_active || !(await bcrypt.compare(b.password, u.password_hash))) {
    throw new HttpError(401, 'BAD_LOGIN', 'Email or password is incorrect');
  }
  res.json({ token: signToken(u), user: pub(u) });
}));

r.get('/me', auth, wrap(async (req, res) => {
  const { rows } = await q('SELECT id, name, email, role FROM users WHERE id = $1 AND is_active', [req.user.id]);
  if (!rows[0]) throw new HttpError(401, 'UNAUTHENTICATED', 'Account not found');
  res.json({ user: rows[0] });
}));

export default r;
