/**
 * One-shot cleanup + student import for Business Navigator 2.0
 *
 * What this does:
 *   1. Finds Business Navigator 2.0 training (exact name match)
 *   2. Deletes ALL other trainings (cascades: sessions, attendance)
 *   3. Deletes ALL existing participants (and their enrollment records)
 *   4. Creates 39 students fresh
 *   5. Enrolls all 39 in Business Navigator 2.0
 *
 * Run:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/cleanup.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import crypto from "crypto";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const TRAINING_NAME = "Business Navigator 2.0";

const STUDENTS: { full_name: string; phone: string | null }[] = [
  { full_name: "Komron Mirobidov",          phone: "+998946738155" },
  { full_name: "Jamshid Nurmuhamedov",       phone: "+998947775992" },
  { full_name: "Asadbek Ismoilov",           phone: "+998904082373" },
  { full_name: "Yavkachev Otabek",           phone: "+998993797888" },
  { full_name: "Atakulov Shohjahon",         phone: "+998904340007" },
  { full_name: "Nematov Jonibek",            phone: "+998900860700" },
  { full_name: "Imamov Shahzod",             phone: "+998914410009" },
  { full_name: "Abdurasul Abdurahmonov",     phone: "+998994931111" },
  { full_name: "Sarvar Yo'ldoshev",          phone: "+998901289005" },
  { full_name: "Abdulhakim Temirov",         phone: "+998941502124" },
  { full_name: "Doniyor Khalilov",           phone: "+998909730102" },
  { full_name: "Tulaganova Muhayyo",         phone: "+998936152112" },
  { full_name: "Jamshid Hasanov",            phone: "+998992803008" },
  { full_name: "Suhrob Baxriddinov",         phone: "+998909228255" },
  { full_name: "Madina Shahidova",           phone: "+998973449707" },
  { full_name: "Shaxnoza Jo'rayeva",         phone: "+998770242714" },
  { full_name: "Hamidxon Majidxonov",        phone: "+998932310012" },
  { full_name: "Sunnatulla Esirgapov",       phone: "+998948290332" },
  { full_name: "Elyorjon Karimov",           phone: "+998880121991" },
  { full_name: "Shahboz Imomov",             phone: "+998998394139" },
  { full_name: "Shaxzod Turanov",            phone: "+998980110786" },
  { full_name: "Doniyor Rahmonov",           phone: "+998976202090" },
  { full_name: "Sevara Usmanova",            phone: "+998933214745" },
  { full_name: "Tursunali Abdurahimov",      phone: "+998946080085" },
  { full_name: "Odilbek Adoshev",            phone: "+998998200290" },
  { full_name: "Madina Hikmatova",           phone: "+998990549002" },
  { full_name: "Zafar Orifjonov",            phone: null },
  { full_name: "Muhammadali Uktamov",        phone: null },
  { full_name: "Odil Nig'matov",             phone: null },
  { full_name: "Saidjahon Djamalov",         phone: "+998500534040" },
  { full_name: "Asqarov Sarvar",             phone: "+998935138775" },
  { full_name: "Abduhalilov Jamshid",        phone: "+998990004206" },
  { full_name: "Javohir Habibullayev",        phone: "+998959509977" },
  { full_name: "Bunyodbek Mirzaxo'jayev",    phone: "+998998217094" },
  { full_name: "Najmiddin Solihov",          phone: "+998330913424" },
  { full_name: "Jahongir Haydarov",          phone: "+998951522922" },
  { full_name: "Holnazarova Guli",           phone: "+998998193001" },
  { full_name: "Mahmudova Dildora",          phone: "+998977390106" },
  { full_name: "Fayzullo Oripov",            phone: "+998888456575" },
];

async function main() {
  // ── 1. Find Business Navigator 2.0 ───────────────────────────────────────
  const training = await prisma.training.findFirst({
    where: { name: { equals: TRAINING_NAME, mode: "insensitive" } },
  });

  if (!training) {
    throw new Error(`Training "${TRAINING_NAME}" not found. Create it first.`);
  }
  console.log(`✓ Found training: "${training.name}" (id: ${training.id})`);

  // ── 2. Delete all OTHER trainings (cascade via Prisma schema) ────────────
  const otherTrainings = await prisma.training.findMany({
    where: { id: { not: training.id } },
    select: { id: true, name: true },
  });

  if (otherTrainings.length > 0) {
    console.log(`Deleting ${otherTrainings.length} other training(s):`);
    for (const t of otherTrainings) {
      console.log(`  - "${t.name}"`);
    }

    // Delete attendance records for those trainings' sessions first
    const otherIds = otherTrainings.map((t) => t.id);
    const otherSessions = await prisma.session.findMany({
      where: { trainingId: { in: otherIds } },
      select: { id: true },
    });
    const otherSessionIds = otherSessions.map((s) => s.id);

    if (otherSessionIds.length > 0) {
      await prisma.attendance.deleteMany({ where: { sessionId: { in: otherSessionIds } } });
    }
    await prisma.trainingParticipant.deleteMany({ where: { trainingId: { in: otherIds } } });
    await prisma.session.deleteMany({ where: { trainingId: { in: otherIds } } });
    await prisma.training.deleteMany({ where: { id: { in: otherIds } } });
    console.log("✓ Other trainings deleted");
  } else {
    console.log("✓ No other trainings to delete");
  }

  // ── 3. Delete all existing participants ──────────────────────────────────
  const existingCount = await prisma.participant.count();
  if (existingCount > 0) {
    // Delete attendance and enrollment records first
    const allParticipantIds = (await prisma.participant.findMany({ select: { id: true } })).map((p) => p.id);
    await prisma.attendance.deleteMany({ where: { participantId: { in: allParticipantIds } } });
    await prisma.trainingParticipant.deleteMany({ where: { participantId: { in: allParticipantIds } } });
    await prisma.participant.deleteMany({});
    console.log(`✓ Deleted ${existingCount} existing participant(s)`);
  } else {
    console.log("✓ No existing participants to delete");
  }

  // ── 4. Create 39 students ─────────────────────────────────────────────────
  console.log(`Creating ${STUDENTS.length} students...`);
  const created: string[] = [];

  for (const s of STUDENTS) {
    const participant = await prisma.participant.create({
      data: {
        fullName: s.full_name,
        phone: s.phone ?? null,
        email: null,
        qrToken: crypto.randomUUID(),
      },
    });
    created.push(participant.id);
    console.log(`  + ${s.full_name}${s.phone ? ` (${s.phone})` : " (no phone)"}`);
  }
  console.log(`✓ Created ${created.length} participants`);

  // ── 5. Enroll all in Business Navigator 2.0 ──────────────────────────────
  await prisma.trainingParticipant.createMany({
    data: created.map((participantId) => ({
      trainingId: training.id,
      participantId,
    })),
    skipDuplicates: true,
  });
  console.log(`✓ Enrolled all ${created.length} students in "${TRAINING_NAME}"`);

  console.log("\n🎉 Done!");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
