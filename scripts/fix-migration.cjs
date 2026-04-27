/**
 * Prestart helper — fixes the stuck 20260427010000_staffuser_username migration.
 *
 * The migration started but the container was killed before Prisma wrote
 * finished_at. Prisma refuses to proceed (P3009) until that row is resolved.
 *
 * This script:
 *   1. Connects directly to Postgres (runs INSIDE Railway — has network access)
 *   2. Checks the _prisma_migrations row for the stuck migration
 *   3. Applies the DDL idempotently (IF NOT EXISTS / already idempotent DROP NOT NULL)
 *   4. Marks the migration as finished so prisma migrate deploy can continue
 *
 * Safe to run on every boot — does nothing if migration is already finished.
 */
'use strict';

const { Client } = require('pg');

const MIGRATION_NAME = '20260427010000_staffuser_username';

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    // Check current migration state
    const { rows } = await client.query(
      `SELECT started_at, finished_at, rolled_back_at
       FROM "_prisma_migrations"
       WHERE migration_name = $1`,
      [MIGRATION_NAME]
    );

    if (rows.length === 0) {
      console.log('[fix-migration] Row not found — skipping (first-time deploy will apply it normally).');
      return;
    }

    const row = rows[0];

    if (row.finished_at !== null) {
      console.log('[fix-migration] Migration already finished — no action needed.');
      return;
    }

    if (row.rolled_back_at !== null) {
      console.log('[fix-migration] Migration already rolled-back — prisma migrate deploy will retry it.');
      return;
    }

    // Row exists, finished_at IS NULL — migration is stuck
    console.log('[fix-migration] Found stuck migration (started_at=' + row.started_at + '). Applying DDL...');

    await client.query(`ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "username" TEXT`);
    console.log('[fix-migration] username column: ok');

    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "StaffUser_username_key" ON "staff_users"("username")`
    );
    console.log('[fix-migration] unique index: ok');

    // DROP NOT NULL is safe to run even if already nullable
    await client.query(`ALTER TABLE "staff_users" ALTER COLUMN "email" DROP NOT NULL`);
    console.log('[fix-migration] email nullable: ok');

    // Mark migration as successfully applied
    await client.query(
      `UPDATE "_prisma_migrations"
       SET finished_at         = NOW(),
           applied_steps_count = 3,
           logs                = NULL,
           rolled_back_at      = NULL
       WHERE migration_name = $1`,
      [MIGRATION_NAME]
    );

    console.log('[fix-migration] Migration marked as finished. prisma migrate deploy will now proceed.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[fix-migration] Error (non-fatal, will continue to migrate deploy):', err.message);
  // Exit 0 so migrate deploy still runs — it may succeed or give better error info
  process.exit(0);
});
