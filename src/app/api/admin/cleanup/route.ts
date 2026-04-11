/**
 * ONE-TIME cleanup + student import endpoint.
 * DELETE THIS FILE after running once.
 *
 * Requires header: x-cleanup-secret: cleanup-bn20-2026
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";

const SECRET = "cleanup-bn20-2026";

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

export async function POST(request: Request) {
  // Secret check
  const secret = request.headers.get("x-cleanup-secret");
  if (secret !== SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const log: string[] = [];

  try {
    // 1. Find Business Navigator 2.0
    const training = await prisma.training.findFirst({
      where: { name: { equals: TRAINING_NAME, mode: "insensitive" } },
    });
    if (!training) {
      return NextResponse.json({ error: `Training "${TRAINING_NAME}" not found` }, { status: 404 });
    }
    log.push(`✓ Found training: "${training.name}" (${training.id})`);

    // 2. Delete all OTHER trainings
    const otherTrainings = await prisma.training.findMany({
      where: { id: { not: training.id } },
      select: { id: true, name: true },
    });

    if (otherTrainings.length > 0) {
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
      log.push(`✓ Deleted ${otherTrainings.length} other training(s): ${otherTrainings.map((t) => t.name).join(", ")}`);
    } else {
      log.push("✓ No other trainings to delete");
    }

    // 3. Delete ALL existing participants
    const existingCount = await prisma.participant.count();
    if (existingCount > 0) {
      const allIds = (await prisma.participant.findMany({ select: { id: true } })).map((p) => p.id);
      await prisma.attendance.deleteMany({ where: { participantId: { in: allIds } } });
      await prisma.trainingParticipant.deleteMany({ where: { participantId: { in: allIds } } });
      await prisma.participant.deleteMany({});
      log.push(`✓ Deleted ${existingCount} existing participant(s)`);
    } else {
      log.push("✓ No existing participants");
    }

    // 4. Create 39 students
    const createdIds: string[] = [];
    for (const s of STUDENTS) {
      const p = await prisma.participant.create({
        data: {
          fullName: s.full_name,
          phone: s.phone ?? null,
          email: null,
          qrToken: crypto.randomUUID(),
        },
      });
      createdIds.push(p.id);
    }
    log.push(`✓ Created ${createdIds.length} participants`);

    // 5. Enroll all in Business Navigator 2.0
    await prisma.trainingParticipant.createMany({
      data: createdIds.map((participantId) => ({
        trainingId: training.id,
        participantId,
      })),
      skipDuplicates: true,
    });
    log.push(`✓ Enrolled all ${createdIds.length} in "${TRAINING_NAME}"`);

    return NextResponse.json({ ok: true, log });
  } catch (e) {
    console.error("Cleanup error:", e);
    return NextResponse.json({ error: String(e), log }, { status: 500 });
  }
}
