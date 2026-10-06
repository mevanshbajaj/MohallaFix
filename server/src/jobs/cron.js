import cron from 'node-cron';
import { q } from '../db.js';

/** Hourly: auto-verify complaints the citizen never confirmed within 7 days. */
export function startJobs() {
  cron.schedule('0 * * * *', async () => {
    try {
      const { rowCount } = await q(`
        WITH u AS (UPDATE complaints SET status = 'verified', verified_at = now()
                   WHERE status = 'resolved' AND resolved_at < now() - interval '7 days' RETURNING id)
        INSERT INTO complaint_events (complaint_id, from_status, to_status, note)
        SELECT id, 'resolved', 'verified', 'Auto-verified after 7 days without a response' FROM u`);
      if (rowCount) console.log(`auto-verified ${rowCount} complaints`);
    } catch (e) { console.error('cron failed', e.message); }
  });
}
