/**
 * Manual end-to-end simulation of the takeover fix.
 *
 * 1. Reads the seeded fixture (StaffUser +998904044431 linked to fake old Telegram).
 * 2. Replays the post-fix contactAuth.ts logic with a NEW Telegram user/chat id.
 * 3. Prints the link before and after to prove the takeover succeeded.
 *
 * Re-run scripts/seed-takeover-fixture.ts between simulations to reset the
 * stale-link state.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const PHONE           = "+998904044431";
const NEW_TG_USER_ID  = 555111222n;
const NEW_CHAT_ID     = 555111222n;

const stringify = (v: unknown) =>
  JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2);

async function main() {
  const before = await prisma.staffTelegramLink.findFirst({
    where:  { staffUser: { phone: PHONE } },
    select: { chatId: true, telegramUserId: true, username: true },
  });
  console.log("BEFORE:", stringify(before));

  const staffUser = await prisma.staffUser.findUnique({
    where:  { phone: PHONE },
    select: { id: true, name: true, isActive: true },
  });
  if (!staffUser) throw new Error("staff not found");

  const [existingForUser, existingForTg] = await Promise.all([
    prisma.staffTelegramLink.findUnique({ where: { staffUserId:    staffUser.id    } }),
    prisma.staffTelegramLink.findUnique({ where: { telegramUserId: NEW_TG_USER_ID } }),
  ]);

  if (existingForUser && existingForUser.chatId !== NEW_CHAT_ID) {
    console.log(`Takeover: previous chatId=${existingForUser.chatId.toString()}`);
  }
  if (existingForTg && existingForTg.staffUserId !== staffUser.id) {
    await prisma.staffTelegramLink.delete({ where: { id: existingForTg.id } });
    console.log("Cleared stale telegramUserId link.");
  }

  await prisma.staffTelegramLink.upsert({
    where:  { staffUserId: staffUser.id },
    update: {
      telegramUserId: NEW_TG_USER_ID, chatId: NEW_CHAT_ID,
      username: "new_account", firstName: "NewAccount",
      verifiedPhone: PHONE, verifiedByContact: true,
    },
    create: {
      staffUserId: staffUser.id,
      telegramUserId: NEW_TG_USER_ID, chatId: NEW_CHAT_ID,
      username: "new_account", firstName: "NewAccount",
      verifiedPhone: PHONE, verifiedByContact: true,
    },
  });

  const after = await prisma.staffTelegramLink.findFirst({
    where:  { staffUser: { phone: PHONE } },
    select: { chatId: true, telegramUserId: true, username: true },
  });
  console.log("AFTER:", stringify(after));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
