import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Wrap async handlers so thrown errors reach the error middleware
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function notFound(_req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(422).json({ error: { code: 'VALIDATION', message: 'Invalid input', details: err.flatten().fieldErrors } });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'Photo must be under 5 MB' } });
  }
  if (err.code === '23505') {
    return res.status(409).json({ error: { code: 'DUPLICATE', message: 'Already exists' } });
  }
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: { code: err.code || 'SERVER_ERROR', message: status === 500 ? 'Something went wrong' : err.message } });
}
