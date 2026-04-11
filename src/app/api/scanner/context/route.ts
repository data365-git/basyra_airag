import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

export async function GET() {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "scanner", "view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD UTC

    // Find sessions today whose parent training is currently active (startDate ≤ today ≤ endDate)
    const sessions = await prisma.session.findMany({
      where: {
        sessionDate: {
          gte: new Date(`${todayStr}T00:00:00.000Z`),
          lte: new Date(`${todayStr}T23:59:59.999Z`),
        },
        training: {
          startDate: { lte: now },
          endDate:   { gte: now },
        },
      },
      include: {
        training: {
          select: { id: true, name: true },
        },
      },
      orderBy: { sessionTime: "asc" },
    });

    if (sessions.length === 0) {
      return NextResponse.json({ autoSelected: false });
    }

    // Prefer the session whose scan window is currently open (or closest to opening)
    // window = sessionDateTime -15min → +90min
    let best = sessions[0];
    for (const s of sessions) {
      const sessionDT  = new Date(`${todayStr}T${s.sessionTime}`);
      const windowStart = new Date(sessionDT.getTime() - 15 * 60 * 1000);
      const windowEnd   = new Date(sessionDT.getTime() + 90 * 60 * 1000);
      if (now >= windowStart && now <= windowEnd) {
        best = s;
        break;
      }
    }

    return NextResponse.json({
      autoSelected: true,
      training: {
        id:   best.training.id,
        name: best.training.name,
      },
      session: {
        id:             best.id,
        session_number: best.sessionNumber,
        session_date:   best.sessionDate.toISOString().slice(0, 10),
        session_time:   best.sessionTime,
      },
    });
  } catch (err) {
    console.error("scanner/context error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
