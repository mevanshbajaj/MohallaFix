import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from './error.js';

export const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpires });

/** Verifies the Bearer token and sets req.user = { id, role } */
export function auth(req, _res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return next(new HttpError(401, 'UNAUTHENTICATED', 'Please sign in'));
  try {
    const p = jwt.verify(h.slice(7), config.jwtSecret);
    req.user = { id: p.sub, role: p.role };
    next();
  } catch {
    next(new HttpError(401, 'INVALID_TOKEN', 'Session expired. Please sign in again'));
  }
}

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(new HttpError(403, 'FORBIDDEN', 'You do not have access to this'));
