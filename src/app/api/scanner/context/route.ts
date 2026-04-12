import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import { getSessionState } from "@/lib/sessionWindow";
import { loadSystemWindowSettings } from "@/lib/sessionWindow.server";

export async function GET() {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "scanner", "view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const now = new Date();

    // Asia/Tashkent is always UTC+5 — derive today's date in local time
    const todayStr = new Date(now.getTime() + 5 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10); // "YYYY-MM-DD" in Tashkent

    // Find all sessions today whose training spans today.
    // sessionDate is stored as a plain "YYYY-MM-DD" string — exact equality match.
    const sessions = await prisma.session.findMany({
      where: {
        sessionDate:  todayStr,
        isCancelled:  false,
        forceClosed:  false,
        training: {
          startDate: { lte: new Date(`${todayStr}T23:59:59+05:00`) },
          endDate:   { gte: new Date(`${todayStr}T00:00:00+05:00`) },
        },
      },
      include: {
        training: {
          select: {
            id:               true,
            name:             true,
            scanWindowBefore: true,
            scanWindowAfter:  true,
          },
        },
      },
      orderBy: { sessionTime: "asc" },
    });

    if (sessions.length === 0) {
      return NextResponse.json({ autoSelected: false });
    }

    const settings = await loadSystemWindowSettings();

    // Prefer the session that is currently active; fall back to the next upcoming one
    let activeSession  = sessions.find((s) => {
      const state = getSessionState(
        {
          sessionDate:      s.sessionDate,
          sessionTime:      s.sessionTime,
          isCancelled:      s.isCancelled,
          forceClosed:      s.forceClosed,
          scanWindowBefore: s.training.scanWindowBefore,
          scanWindowAfter:  s.training.scanWindowAfter,
        },
        settings,
        now
      );
      return state === "active";
    });

    // If none are active, pick the first upcoming one
    if (!activeSession) {
      activeSession = sessions.find((s) => {
        const state = getSessionState(
          {
            sessionDate:      s.sessionDate,
            sessionTime:      s.sessionTime,
            isCancelled:      s.isCancelled,
            forceClosed:      s.forceClosed,
            scanWindowBefore: s.training.scanWindowBefore,
            scanWindowAfter:  s.training.scanWindowAfter,
          },
          settings,
          now
        );
        return state === "upcoming";
      });
    }

    if (!activeSession) {
      // All sessions ended today — don't auto-select
      return NextResponse.json({ autoSelected: false });
    }

    const sessionState = getSessionState(
      {
        sessionDate:      activeSession.sessionDate,
        sessionTime:      activeSession.sessionTime,
        isCancelled:      activeSession.isCancelled,
        forceClosed:      activeSession.forceClosed,
        scanWindowBefore: activeSession.training.scanWindowBefore,
        scanWindowAfter:  activeSession.training.scanWindowAfter,
      },
      settings,
      now
    );

    return NextResponse.json({
      autoSelected:   true,
      state:          sessionState,
      training: {
        id:   activeSession.training.id,
        name: activeSession.training.name,
      },
      session: {
        id:              activeSession.id,
        session_number:  activeSession.sessionNumber,
        session_date:    activeSession.sessionDate,
        session_time:    activeSession.sessionTime,
        scan_window_before: activeSession.training.scanWindowBefore ?? settings.before,
        scan_window_after:  activeSession.training.scanWindowAfter  ?? settings.after,
      },
    });
  } catch (err) {
    console.error("scanner/context error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
