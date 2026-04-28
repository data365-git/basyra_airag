/**
 * Prestart helper — fixes any stuck _prisma_migrations rows.
 *
 * Handles:
 *   - 20260427010000_staffuser_username   (username column + email nullable)
 *   - 20260428010000_add_staff_phone_identity (phone column + staff_telegram_links table)
 *
 * For each migration:
 *   1. Applies its DDL idempotently (IF NOT EXISTS)
 *   2. Marks the row finished so `prisma migrate deploy` can proceed
 *
 * Safe to run on every boot — skips already-finished migrations.
 */
'use strict';

const { Client } = require('pg');

const MIGRATIONS = [
  {
    name: '20260427010000_staffuser_username',
    apply: async (client) => {
      await client.query(`ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "username" TEXT`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "StaffUser_username_key" ON "staff_users"("username")`);
      await client.query(`ALTER TABLE "staff_users" ALTER COLUMN "email" DROP NOT NULL`);
    },
    steps: 3,
  },
  {
    name: '20260428010000_add_staff_phone_identity',
    apply: async (client) => {
      await client.query(`ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "phone" TEXT`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "StaffUser_phone_key" ON "staff_users"("phone")`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS "staff_telegram_links" (
          "id"                  TEXT NOT NULL,
          "staff_user_id"       TEXT NOT NULL,
          "telegram_user_id"    BIGINT NOT NULL,
          "chat_id"             BIGINT NOT NULL,
          "username"            TEXT,
          "first_name"          TEXT,
          "verified_phone"      TEXT,
          "verified_by_contact" BOOLEAN NOT NULL DEFAULT false,
          "linked_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "staff_telegram_links_pkey" PRIMARY KEY ("id")
        )
      `);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "staff_telegram_links_staff_user_id_key" ON "staff_telegram_links"("staff_user_id")`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "staff_telegram_links_telegram_user_id_key" ON "staff_telegram_links"("telegram_user_id")`);
      await client.query(`CREATE INDEX IF NOT EXISTS "staff_telegram_links_chat_id_idx" ON "staff_telegram_links"("chat_id")`);
      await client.query(`CREATE INDEX IF NOT EXISTS "staff_telegram_links_verified_phone_idx" ON "staff_telegram_links"("verified_phone")`);
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'staff_telegram_links_staff_user_id_fkey'
          ) THEN
            ALTER TABLE "staff_telegram_links"
              ADD CONSTRAINT "staff_telegram_links_staff_user_id_fkey"
              FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id")
              ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$
      `);
    },
    steps: 8,
  },
];

async function fixMigration(client, migration) {
  const { rows } = await client.query(
    `SELECT started_at, finished_at, rolled_back_at
     FROM "_prisma_migrations"
     WHERE migration_name = $1`,
    [migration.name]
  );

  if (rows.length === 0) {
    console.log(`[fix-migration] ${migration.name}: not in DB yet — will be applied normally by migrate deploy.`);
    return;
  }

  const row = rows[0];

  if (row.finished_at !== null) {
    console.log(`[fix-migration] ${migration.name}: already finished — skipping.`);
    return;
  }

  if (row.rolled_back_at !== null) {
    console.log(`[fix-migration] ${migration.name}: rolled back — migrate deploy will retry.`);
    return;
  }

  console.log(`[fix-migration] ${migration.name}: stuck (started_at=${row.started_at}). Applying DDL...`);
  await migration.apply(client);
  console.log(`[fix-migration] ${migration.name}: DDL applied.`);

  await client.query(
    `UPDATE "_prisma_migrations"
     SET finished_at         = NOW(),
         applied_steps_count = $2,
         logs                = NULL,
         rolled_back_at      = NULL
     WHERE migration_name = $1`,
    [migration.name, migration.steps]
  );
  console.log(`[fix-migration] ${migration.name}: marked as finished.`);
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    for (const migration of MIGRATIONS) {
      await fixMigration(client, migration);
    }

    // Also ensure the phone migration DDL is applied even if the row is "finished"
    // (handles the case where finished_at was set but the DDL wasn't actually applied)
    const { rows: phoneCol } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'staff_users' AND column_name = 'phone'
    `);
    if (phoneCol.length === 0) {
      console.log('[fix-migration] phone column missing despite migration status — applying DDL directly...');
      await MIGRATIONS[1].apply(client);
      // Ensure the migration row is marked finished
      await client.query(`
        INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
        VALUES (gen_random_uuid()::text, 'manual', NOW(), '20260428010000_add_staff_phone_identity', NULL, NULL, NOW(), 8)
        ON CONFLICT (migration_name) DO UPDATE
          SET finished_at = NOW(), applied_steps_count = 8, logs = NULL, rolled_back_at = NULL
      `);
      console.log('[fix-migration] phone column applied and migration row upserted.');
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[fix-migration] Error (non-fatal):', err.message);
  process.exit(0);
});
