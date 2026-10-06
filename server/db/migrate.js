// Applies db/migrations/*.sql in filename order, once each, inside a transaction.
// Run automatically on server start; also available as `npm run db:migrate`.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate(pool, log = console.log) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727001)'); // two instances starting together must not race
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name));
    for (const f of (await fs.readdir(DIR)).filter((x) => x.endsWith('.sql')).sort()) {
      if (done.has(f)) continue;
      try {
        await client.query('BEGIN');
        await client.query(await fs.readFile(path.join(DIR, f), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
        await client.query('COMMIT');
        log(`migration applied: ${f}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${f} failed: ${e.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => {});
    client.release();
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  const { pool } = await import('../src/db.js');
  try { await migrate(pool); console.log('Database is up to date.'); } catch (e) { console.error(e.message); process.exitCode = 1; } finally { await pool.end(); }
}
