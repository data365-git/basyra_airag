import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // Roles — granular permission structure
  const adminPerms = {
    trainings:    { view: true,  create: true,  edit: true,  delete: true  },
    participants: { view: true,  create: true,  edit: true,  delete: true  },
    scanner:      { view: true  },
    reports:      { view: true,  export: true  },
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

  const scannerRole = await prisma.role.upsert({
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

  const viewerRole = await prisma.role.upsert({
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

  const hashedPassword = await bcrypt.hash("demo1234", 12);

  // Staff users
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

  await prisma.staffUser.upsert({
    where: { email: "scanner@demo.com" },
    update: {},
    create: {
      id: "staffff-0002-0000-0000-000000000000",
      name: "Scanner User",
      email: "scanner@demo.com",
      password: hashedPassword,
      roleId: scannerRole.id,
      isActive: true,
    },
  });

  await prisma.staffUser.upsert({
    where: { email: "viewer@demo.com" },
    update: {},
    create: {
      id: "staffff-0003-0000-0000-000000000000",
      name: "Viewer User",
      email: "viewer@demo.com",
      password: hashedPassword,
      roleId: viewerRole.id,
      isActive: true,
    },
  });

  console.log("Staff users created.");

  // 25 Uzbek participants
  const participantData = [
    { id: "bbbbbbbb-0001-0000-0000-000000000000", fullName: "Dilnoza Yusupova", phone: "+998901234501", email: "dilnoza@example.uz", qrToken: "qr_dilnoza_a1b2c3d4e5f60001" },
    { id: "bbbbbbbb-0002-0000-0000-000000000000", fullName: "Bobur Karimov", phone: "+998901234502", email: "bobur@example.uz", qrToken: "qr_bobur_a1b2c3d4e5f60002" },
    { id: "bbbbbbbb-0003-0000-0000-000000000000", fullName: "Zulfiya Toshmatova", phone: "+998901234503", email: null, qrToken: "qr_zulfiya_a1b2c3d4e5f60003" },
    { id: "bbbbbbbb-0004-0000-0000-000000000000", fullName: "Sardor Rahimov", phone: "+998901234504", email: "sardor@example.uz", qrToken: "qr_sardor_a1b2c3d4e5f60004" },
    { id: "bbbbbbbb-0005-0000-0000-000000000000", fullName: "Malika Hasanova", phone: "+998901234505", email: null, qrToken: "qr_malika_a1b2c3d4e5f60005" },
    { id: "bbbbbbbb-0006-0000-0000-000000000000", fullName: "Jasur Mirzayev", phone: "+998901234506", email: "jasur@example.uz", qrToken: "qr_jasur_a1b2c3d4e5f60006" },
    { id: "bbbbbbbb-0007-0000-0000-000000000000", fullName: "Feruza Nazarova", phone: "+998901234507", email: null, qrToken: "qr_feruza_a1b2c3d4e5f60007" },
    { id: "bbbbbbbb-0008-0000-0000-000000000000", fullName: "Ulugbek Xolmatov", phone: "+998901234508", email: "ulugbek@example.uz", qrToken: "qr_ulugbek_a1b2c3d4e5f60008" },
    { id: "bbbbbbbb-0009-0000-0000-000000000000", fullName: "Nilufar Qodirov", phone: "+998901234509", email: null, qrToken: "qr_nilufar_a1b2c3d4e5f60009" },
    { id: "bbbbbbbb-0010-0000-0000-000000000000", fullName: "Sherzod Tursunov", phone: "+998901234510", email: "sherzod@example.uz", qrToken: "qr_sherzod_a1b2c3d4e5f60010" },
    { id: "bbbbbbbb-0011-0000-0000-000000000000", fullName: "Mushtariy Ergasheva", phone: "+998901234511", email: null, qrToken: "qr_mushtariy_a1b2c3d4e5f60011" },
    { id: "bbbbbbbb-0012-0000-0000-000000000000", fullName: "Otabek Normatov", phone: "+998901234512", email: "otabek@example.uz", qrToken: "qr_otabek_a1b2c3d4e5f60012" },
    { id: "bbbbbbbb-0013-0000-0000-000000000000", fullName: "Mohira Sultonova", phone: "+998901234513", email: null, qrToken: "qr_mohira_a1b2c3d4e5f60013" },
    { id: "bbbbbbbb-0014-0000-0000-000000000000", fullName: "Asilbek Umarov", phone: "+998901234514", email: "asilbek@example.uz", qrToken: "qr_asilbek_a1b2c3d4e5f60014" },
    { id: "bbbbbbbb-0015-0000-0000-000000000000", fullName: "Dildora Sotvoldiyeva", phone: "+998901234515", email: null, qrToken: "qr_dildora_a1b2c3d4e5f60015" },
    { id: "bbbbbbbb-0016-0000-0000-000000000000", fullName: "Mansur Qosimov", phone: "+998901234516", email: "mansur@example.uz", qrToken: "qr_mansur_a1b2c3d4e5f60016" },
    { id: "bbbbbbbb-0017-0000-0000-000000000000", fullName: "Shoira Yuldosheva", phone: "+998901234517", email: null, qrToken: "qr_shoira_a1b2c3d4e5f60017" },
    { id: "bbbbbbbb-0018-0000-0000-000000000000", fullName: "Islom Baxtiyorov", phone: "+998901234518", email: "islom@example.uz", qrToken: "qr_islom_a1b2c3d4e5f60018" },
    { id: "bbbbbbbb-0019-0000-0000-000000000000", fullName: "Gulnora Xasanova", phone: "+998901234519", email: null, qrToken: "qr_gulnora_a1b2c3d4e5f60019" },
    { id: "bbbbbbbb-0020-0000-0000-000000000000", fullName: "Nodir Rajabov", phone: "+998901234520", email: "nodir@example.uz", qrToken: "qr_nodir_a1b2c3d4e5f60020" },
    { id: "bbbbbbbb-0021-0000-0000-000000000000", fullName: "Lola Mirzaeva", phone: "+998901234521", email: null, qrToken: "qr_lola_a1b2c3d4e5f60021" },
    { id: "bbbbbbbb-0022-0000-0000-000000000000", fullName: "Husan Abdullayev", phone: "+998901234522", email: "husan@example.uz", qrToken: "qr_husan_a1b2c3d4e5f60022" },
    { id: "bbbbbbbb-0023-0000-0000-000000000000", fullName: "Maftuna Boltayeva", phone: "+998901234523", email: null, qrToken: "qr_maftuna_a1b2c3d4e5f60023" },
    { id: "bbbbbbbb-0024-0000-0000-000000000000", fullName: "Bekzod Holiqov", phone: "+998901234524", email: "bekzod@example.uz", qrToken: "qr_bekzod_a1b2c3d4e5f60024" },
    { id: "bbbbbbbb-0025-0000-0000-000000000000", fullName: "Sabohat Yusupov", phone: "+998901234525", email: null, qrToken: "qr_sabohat_a1b2c3d4e5f60025" },
  ];

  for (const p of participantData) {
    await prisma.participant.upsert({
      where: { qrToken: p.qrToken },
      update: {},
      create: p,
    });
  }

  console.log("Participants created.");

  const now = new Date();
  const daysAgo = (n: number) => { const d = new Date(now); d.setDate(d.getDate() - n); d.setHours(0,0,0,0); return d; };

  // Training 1: Active Web Dev — Saturday + Sunday to show multi-day feature
  const webDev = await prisma.training.upsert({
    where: { id: "cccccccc-0001-0000-0000-000000000000" },
    update: {},
    create: {
      id: "cccccccc-0001-0000-0000-000000000000",
      name: "Veb-dasturlash kursi",
      description: "Front-end va back-end dasturlash asoslari",
      color: "#3B82F6",
      icon: "book",
      startDate: daysAgo(56),
      endDate: new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000),
      scheduleDays: [0, 6],      // Sunday + Saturday
      scheduleTime: "09:00",
      status: "active",
      attendanceThreshold: 75,
    },
  });

  // Training 2: Upcoming Data Analysis — Saturday only
  await prisma.training.upsert({
    where: { id: "cccccccc-0002-0000-0000-000000000000" },
    update: {},
    create: {
      id: "cccccccc-0002-0000-0000-000000000000",
      name: "Ma'lumotlar tahlili",
      description: "Python va Excel yordamida ma'lumotlarni tahlil qilish",
      color: "#10B981",
      icon: "book",
      startDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      endDate: new Date(now.getTime() + 112 * 24 * 60 * 60 * 1000),
      scheduleDays: [6],
      scheduleTime: "14:00",
      status: "upcoming",
      attendanceThreshold: 80,
    },
  });

  // Training 3: Completed English — Saturday only
  const english = await prisma.training.upsert({
    where: { id: "cccccccc-0003-0000-0000-000000000000" },
    update: {},
    create: {
      id: "cccccccc-0003-0000-0000-000000000000",
      name: "Ingliz tili kursi",
      description: "Biznes ingliz tili va muloqot ko'nikmalari",
      color: "#8B5CF6",
      icon: "book",
      startDate: daysAgo(84),
      endDate: daysAgo(14),
      scheduleDays: [6],
      scheduleTime: "11:00",
      status: "completed",
      attendanceThreshold: 80,
    },
  });

  console.log("Trainings created.");

  // Sessions for Web Dev (8 closed + 1 open + 3 upcoming)
  const webDevSessionData = [
    { sessionNumber: 1, sessionDate: daysAgo(56), status: "closed" },
    { sessionNumber: 2, sessionDate: daysAgo(49), status: "closed" },
    { sessionNumber: 3, sessionDate: daysAgo(42), status: "closed" },
    { sessionNumber: 4, sessionDate: daysAgo(35), status: "closed" },
    { sessionNumber: 5, sessionDate: daysAgo(28), status: "closed" },
    { sessionNumber: 6, sessionDate: daysAgo(21), status: "closed" },
    { sessionNumber: 7, sessionDate: daysAgo(14), status: "closed" },
    { sessionNumber: 8, sessionDate: daysAgo(7), status: "closed" },
    { sessionNumber: 9, sessionDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()), status: "open" },
    { sessionNumber: 10, sessionDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), status: "upcoming" },
    { sessionNumber: 11, sessionDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), status: "upcoming" },
    { sessionNumber: 12, sessionDate: new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000), status: "upcoming" },
  ];

  const webDevSessions: { id: string; sessionNumber: number; sessionDate: Date; status: string }[] = [];
  for (const s of webDevSessionData) {
    const session = await prisma.session.upsert({
      where: { trainingId_sessionNumber: { trainingId: webDev.id, sessionNumber: s.sessionNumber } },
      update: {},
      create: {
        trainingId: webDev.id,
        sessionNumber: s.sessionNumber,
        sessionDate: s.sessionDate,
        sessionTime: "09:00",
        status: s.status,
      },
    });
    webDevSessions.push(session);
  }

  // Sessions for English (10 closed)
  const englishSessions: { id: string }[] = [];
  for (let i = 1; i <= 10; i++) {
    const session = await prisma.session.upsert({
      where: { trainingId_sessionNumber: { trainingId: english.id, sessionNumber: i } },
      update: {},
      create: {
        trainingId: english.id,
        sessionNumber: i,
        sessionDate: daysAgo(84 - (i - 1) * 7),
        sessionTime: "11:00",
        status: "closed",
      },
    });
    englishSessions.push(session);
  }

  console.log("Sessions created.");

  // Enroll all 25 in Web Dev
  for (const p of participantData) {
    await prisma.trainingParticipant.upsert({
      where: { trainingId_participantId: { trainingId: webDev.id, participantId: p.id } },
      update: {},
      create: { trainingId: webDev.id, participantId: p.id },
    });
  }

  // Enroll first 15 in English
  for (const p of participantData.slice(0, 15)) {
    await prisma.trainingParticipant.upsert({
      where: { trainingId_participantId: { trainingId: english.id, participantId: p.id } },
      update: {},
      create: { trainingId: english.id, participantId: p.id },
    });
  }

  console.log("Enrollments created.");

  // Generate attendance for closed Web Dev sessions
  const closedWebDevSessions = webDevSessions.filter((s) => s.status === "closed");
  for (const session of closedWebDevSessions) {
    for (let i = 0; i < participantData.length; i++) {
      const p = participantData[i];
      const rand = Math.random();
      let chance = i < 10 ? 0.90 : i < 18 ? 0.72 : 0.55;
      let status: string;
      if (rand < chance * 0.85) status = "present";
      else if (rand < chance) status = "late";
      else if (rand < chance + 0.05) status = "excused";
      else status = "absent";

      await prisma.attendance.upsert({
        where: { sessionId_participantId: { sessionId: session.id, participantId: p.id } },
        update: {},
        create: {
          sessionId: session.id,
          participantId: p.id,
          status,
          scannedAt: (status === "present" || status === "late") ? new Date(session.sessionDate.getTime() + Math.random() * 60 * 60 * 1000) : null,
        },
      });
    }
  }

  // Generate attendance for English sessions
  for (const session of englishSessions) {
    for (const p of participantData.slice(0, 15)) {
      const rand = Math.random();
      let status: string;
      if (rand < 0.75) status = "present";
      else if (rand < 0.82) status = "late";
      else if (rand < 0.88) status = "excused";
      else status = "absent";

      await prisma.attendance.upsert({
        where: { sessionId_participantId: { sessionId: session.id, participantId: p.id } },
        update: {},
        create: { sessionId: session.id, participantId: p.id, status },
      });
    }
  }

  console.log("Attendance data generated.");

  // Training categories
  const categoryData = [
    {
      id: "catcat00-0001-0000-0000-000000000000",
      nameUz: "Veb-dasturlash",
      nameRu: "Веб-разработка",
      nameEn: "Web Development",
      sortOrder: 1,
    },
    {
      id: "catcat00-0002-0000-0000-000000000000",
      nameUz: "Ma'lumotlar tahlili",
      nameRu: "Анализ данных",
      nameEn: "Data Analysis",
      sortOrder: 2,
    },
    {
      id: "catcat00-0003-0000-0000-000000000000",
      nameUz: "Liderlik",
      nameRu: "Лидерство",
      nameEn: "Leadership",
      sortOrder: 3,
    },
    {
      id: "catcat00-0004-0000-0000-000000000000",
      nameUz: "Til o'rganish",
      nameRu: "Изучение языков",
      nameEn: "Language Learning",
      sortOrder: 4,
    },
    {
      id: "catcat00-0005-0000-0000-000000000000",
      nameUz: "Dizayn",
      nameRu: "Дизайн",
      nameEn: "Design",
      sortOrder: 5,
    },
  ];

  for (const cat of categoryData) {
    await prisma.trainingCategory.upsert({
      where: { id: cat.id },
      update: { nameUz: cat.nameUz, nameRu: cat.nameRu, nameEn: cat.nameEn, sortOrder: cat.sortOrder },
      create: cat,
    });
  }

  console.log("Training categories created.");

  // System settings — global defaults
  await prisma.systemSetting.upsert({
    where: { key: "late_threshold_minutes" },
    update: {},
    create: { key: "late_threshold_minutes", value: "15" },
  });

  console.log("System settings seeded.");
  console.log("Seed complete!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
