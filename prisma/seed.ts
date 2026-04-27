import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // ── One-time cleanup: remove demo trainings/participants if still present ─
  const DEMO_TRAINING_IDS = [
    "cccccccc-0001-0000-0000-000000000000", // Veb-dasturlash kursi
    "cccccccc-0002-0000-0000-000000000000", // Ma'lumotlar tahlili
    "cccccccc-0003-0000-0000-000000000000", // Ingliz tili kursi
  ];
  const DEMO_PARTICIPANT_IDS = Array.from({ length: 25 }, (_, i) =>
    `bbbbbbbb-${String(i + 1).padStart(4, "0")}-0000-0000-000000000000`
  );

  // Delete demo attendance records
  const demoSessions = await prisma.session.findMany({
    where: { trainingId: { in: DEMO_TRAINING_IDS } },
    select: { id: true },
  });
  if (demoSessions.length > 0) {
    await prisma.attendance.deleteMany({ where: { sessionId: { in: demoSessions.map((s) => s.id) } } });
  }
  await prisma.attendance.deleteMany({ where: { participantId: { in: DEMO_PARTICIPANT_IDS } } });
  await prisma.trainingParticipant.deleteMany({ where: { trainingId: { in: DEMO_TRAINING_IDS } } });
  await prisma.trainingParticipant.deleteMany({ where: { participantId: { in: DEMO_PARTICIPANT_IDS } } });
  await prisma.session.deleteMany({ where: { trainingId: { in: DEMO_TRAINING_IDS } } });
  await prisma.training.deleteMany({ where: { id: { in: DEMO_TRAINING_IDS } } });
  await prisma.participant.deleteMany({ where: { id: { in: DEMO_PARTICIPANT_IDS } } });
  console.log("Demo data removed.");

  // ── Roles ────────────────────────────────────────────────────────────────
  const adminPerms = {
    trainings:    { view: true,  create: true,  edit: true,  delete: true  },
    participants: { view: true,  create: true,  edit: true,  delete: true  },
    scanner:      { view: true  },
    reports:      { view: true,  export: true  },
    chatbot:      { view: true,  conversations: true, content: true, broadcast: true, settings: true },
    settings: {
      users:        { view: true,  create: true,  edit: true,  delete: true  },
      roles:        { view: true,  create: true,  edit: true,  delete: true  },
      categories:   { view: true,  create: true,  edit: true,  delete: true  },
      translations: { view: true,  edit: true  },
    },
  };
  const scannerPerms = {
    trainings:    { view: true,  create: false, edit: false, delete: false },
    participants: { view: false, create: false, edit: false, delete: false },
    scanner:      { view: true  },
    reports:      { view: false, export: false },
    chatbot:      { view: false, conversations: false, content: false, broadcast: false, settings: false },
    settings: {
      users:        { view: false, create: false, edit: false, delete: false },
      roles:        { view: false, create: false, edit: false, delete: false },
      categories:   { view: false, create: false, edit: false, delete: false },
      translations: { view: false, edit: false },
    },
  };
  const viewerPerms = {
    trainings:    { view: true,  create: false, edit: false, delete: false },
    participants: { view: false, create: false, edit: false, delete: false },
    scanner:      { view: false },
    reports:      { view: true,  export: true  },
    chatbot:      { view: false, conversations: false, content: false, broadcast: false, settings: false },
    settings: {
      users:        { view: false, create: false, edit: false, delete: false },
      roles:        { view: false, create: false, edit: false, delete: false },
      categories:   { view: false, create: false, edit: false, delete: false },
      translations: { view: false, edit: false },
    },
  };

  const adminRole = await prisma.role.upsert({
    where: { name: "Admin" },
    update: { permissions: adminPerms, color: "#6366f1", isSuperadmin: true, description: "Full system access" },
    create: {
      id: "aaaaaaaa-0001-0000-0000-000000000000",
      name: "Admin",
      description: "Full system access",
      color: "#6366f1",
      isSuperadmin: true,
      permissions: adminPerms,
    },
  });

  await prisma.role.upsert({
    where: { name: "Scanner" },
    update: { permissions: scannerPerms, color: "#0ea5e9", description: "Can scan QR codes and view trainings" },
    create: {
      id: "aaaaaaaa-0002-0000-0000-000000000000",
      name: "Scanner",
      description: "Can scan QR codes and view trainings",
      color: "#0ea5e9",
      isSuperadmin: false,
      permissions: scannerPerms,
    },
  });

  await prisma.role.upsert({
    where: { name: "Viewer" },
    update: { permissions: viewerPerms, color: "#10b981", description: "Read-only access to trainings and reports" },
    create: {
      id: "aaaaaaaa-0003-0000-0000-000000000000",
      name: "Viewer",
      description: "Read-only access to trainings and reports",
      color: "#10b981",
      isSuperadmin: false,
      permissions: viewerPerms,
    },
  });

  // ── Staff users ──────────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash("demo1234", 12);

  await prisma.staffUser.upsert({
    where: { email: "admin@demo.com" },
    update: {},
    create: {
      id: "staffff-0001-0000-0000-000000000000",
      name: "Admin User",
      email: "admin@demo.com",
      password: hashedPassword,
      roleId: adminRole.id,
      isActive: true,
    },
  });

  console.log("Staff users seeded.");

  // ── Training categories ──────────────────────────────────────────────────
  const categoryData = [
    { id: "catcat00-0001-0000-0000-000000000000", nameUz: "Veb-dasturlash",       nameRu: "Веб-разработка",    nameEn: "Web Development",  sortOrder: 1 },
    { id: "catcat00-0002-0000-0000-000000000000", nameUz: "Ma'lumotlar tahlili",  nameRu: "Анализ данных",     nameEn: "Data Analysis",    sortOrder: 2 },
    { id: "catcat00-0003-0000-0000-000000000000", nameUz: "Liderlik",             nameRu: "Лидерство",         nameEn: "Leadership",       sortOrder: 3 },
    { id: "catcat00-0004-0000-0000-000000000000", nameUz: "Til o'rganish",        nameRu: "Изучение языков",   nameEn: "Language Learning", sortOrder: 4 },
    { id: "catcat00-0005-0000-0000-000000000000", nameUz: "Dizayn",               nameRu: "Дизайн",            nameEn: "Design",           sortOrder: 5 },
  ];

  for (const cat of categoryData) {
    await prisma.trainingCategory.upsert({
      where: { id: cat.id },
      update: { nameUz: cat.nameUz, nameRu: cat.nameRu, nameEn: cat.nameEn, sortOrder: cat.sortOrder },
      create: cat,
    });
  }

  console.log("Categories seeded.");

  // ── System settings ──────────────────────────────────────────────────────
  const systemSettings = [
    { key: "late_threshold_minutes",     value: "15"            },
    { key: "scan_window_before_minutes", value: "30"            },
    { key: "scan_window_after_minutes",  value: "120"           },
    { key: "timezone",                   value: "Asia/Tashkent" },
  ];

  for (const s of systemSettings) {
    await prisma.systemSetting.upsert({
      where:  { key: s.key },
      update: {},
      create: s,
    });
  }

  console.log("System settings seeded.");
  console.log("Seed complete!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
