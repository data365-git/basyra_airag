import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import { getTodayInTashkent, getSessionState } from "@/lib/sessionWindow";

export async function GET() {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "scanner", "view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const now      = new Date();
    const todayStr = getTodayInTashkent(now); // "YYYY-MM-DD" in Tashkent time

    // Find all non-cancelled sessions scheduled for today
    const sessions = await prisma.session.findMany({
      where: {
        sessionDate: todayStr,
        isCancelled: false,
        forceClosed: false,
        training: {
          status: { in: ["active", "upcoming"] },
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

    // All sessions are for today → pick the first one
    const chosen = sessions[0];

    const sessionState = getSessionState(
      {
        sessionDate: chosen.sessionDate,
        sessionTime: chosen.sessionTime,
        isCancelled: chosen.isCancelled,
        forceClosed: chosen.forceClosed,
      },
      undefined,
      now
    );

    return NextResponse.json({
      autoSelected: true,
      state:        sessionState,
      training: {
        id:   chosen.training.id,
        name: chosen.training.name,
      },
      session: {
        id:             chosen.id,
        session_number: chosen.sessionNumber,
        session_date:   chosen.sessionDate,
        session_time:   chosen.sessionTime,
      },
    });
  } catch (err) {
    console.error("scanner/context error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
