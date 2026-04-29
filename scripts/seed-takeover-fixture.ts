/**
 * Reproduces the staff-Telegram-link deadlock for manual testing of the takeover fix.
 *
 * Creates:
 *   - StaffUser  "Takeover Test" with phone +998904044431
 *   - StaffTelegramLink pointing to a fake "old" Telegram account (chatId/userId 999000001)
 *
 * After running this, share contact +998 90 404 44 31 from any DIFFERENT Telegram
 * account. Pre-fix: bot replies "Bu staff raqam boshqa Telegram akkauntiga bog'langan"
 * + /logout returns "Hisob hali ulanmagan" (deadlock). Post-fix: bot welcomes the
 * staff user and overwrites the stale link.
 *
 * Idempotent — safe to run repeatedly. Resets the stale link to the canonical fake
 * chatId so the deadlock state is restored even if a prior test claimed the link.
 *
 * Run: DATABASE_URL=… npx tsx scripts/seed-takeover-fixture.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const PHONE        = "+998904044431";
const STAFF_NAME   = "Takeover Test";
const FAKE_OLD_TG  = 999000001n;

async function main() {
  const passwordHash = await bcrypt.hash("test-takeover", 10);

  const staff = await prisma.staffUser.upsert({
    where:  { phone: PHONE },
    update: { name: STAFF_NAME, isActive: true },
    create: { name: STAFF_NAME, phone: PHONE, password: passwordHash, isActive: true },
  });

  await prisma.staffTelegramLink.upsert({
    where:  { staffUserId: staff.id },
    update: {
      telegramUserId:    FAKE_OLD_TG,
      chatId:            FAKE_OLD_TG,
      username:          "old_account",
      firstName:         "OldAccount",
      verifiedPhone:     PHONE,
      verifiedByContact: true,
    },
    create: {
      staffUserId:       staff.id,
      telegramUserId:    FAKE_OLD_TG,
      chatId:            FAKE_OLD_TG,
      username:          "old_account",
      firstName:         "OldAccount",
      verifiedPhone:     PHONE,
      verifiedByContact: true,
    },
  });

  console.log("Takeover fixture seeded:");
  console.log(`  StaffUser            ${staff.id}  ${STAFF_NAME}  ${PHONE}`);
  console.log(`  StaffTelegramLink → fake old chatId/userId ${FAKE_OLD_TG}`);
  console.log("");
  console.log("Now share +998 90 404 44 31 from a different Telegram account to test takeover.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
