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
  res.status(404).json({ success: false, message: 'Route not found', error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  const send = (status, code, message, details) => res.status(status).json({ success: false, message, error: { code, message, details } });
  if (err instanceof ZodError) {
    const f = err.flatten().fieldErrors;
    const first = Object.entries(f)[0];
    return send(422, 'VALIDATION', first ? `${first[0]}: ${first[1][0]}` : 'Invalid input', f);
  }
  if (err.code?.startsWith?.('LIMIT_') && err.code !== 'LIMIT_FILE_SIZE') return send(422, 'BAD_UPLOAD', 'Too many files, or a file was sent in the wrong field');
  if (err.code === 'LIMIT_FILE_SIZE') {
    return send(413, 'FILE_TOO_LARGE', 'Each photo must be under 5 MB');
  }
  if (err.code === '23505') {
    return send(409, 'DUPLICATE', 'Already exists');
  }
  const status = err.status || 500;
  if (status === 500) console.error(err);
  send(status, err.code || 'SERVER_ERROR', status === 500 ? 'Something went wrong' : err.message);
}
