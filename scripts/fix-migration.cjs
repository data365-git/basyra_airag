/**
 * Prestart helper: marks the staffuser_username migration as rolled-back
 * so prisma migrate deploy can retry it with the corrected SQL.
 * Uses pg directly to avoid any Prisma client state issues.
 * Safe to run on every boot — does nothing if already resolved.
 */
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query(
  `UPDATE "_prisma_migrations"
   SET rolled_back_at = NOW()
   WHERE migration_name = '20260427010000_staffuser_username'
     AND finished_at   IS NULL
     AND rolled_back_at IS NULL`,
  (err, res) => {
    if (err) {
      console.warn('[fix-migration] UPDATE failed (non-fatal):', err.message);
    } else if (res.rowCount > 0) {
      console.log('[fix-migration] Marked failed migration as rolled-back — will be retried.');
    } else {
      console.log('[fix-migration] No action needed (migration already resolved or not present).');
    }
    pool.end();
  }
);
