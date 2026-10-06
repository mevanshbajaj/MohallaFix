import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { notFound, errorHandler } from './middleware/error.js';
import { UPLOAD_DIR } from './services/storage.js';
import { startJobs } from './jobs/cron.js';
import authRoutes from './routes/auth.js';
import metaRoutes from './routes/meta.js';
import complaintRoutes from './routes/complaints.js';
import workerRoutes from './routes/worker.js';
import adminRoutes from './routes/admin.js';

const app = express();
app.set('trust proxy', 1); // behind Railway/Render proxy: correct client IPs for rate limiting
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: '100kb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' })); // dev-only photo storage

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/v1', rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));
app.use('/api/v1/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }), authRoutes);
app.use('/api/v1/meta', metaRoutes);
app.use('/api/v1/complaints', complaintRoutes);
app.use('/api/v1/worker', workerRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`MohallaFix API on :${config.port}`);
  startJobs();
});
