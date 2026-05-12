/**
 * GET /api/homeworks — staff-wide Homework Command Center listing.
 *
 * Query params (all optional):
 *   q              — full-text filter (case-insensitive) on title
 *   trainingId     — restrict to one training
 *   filter         — "all" | "pending_grade" | "overdue"
 *
 * Response: flat array of homeworks with counts + training info, newest first.
 */
import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { verifyJWT, COOKIE_NAME } from "@/lib/auth";
import { getTodayInTashkent } from "@/lib/sessionWindow";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const jar   = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  const user  = token ? await verifyJWT(token) : null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp         = req.nextUrl.searchParams;
  const q          = sp.get("q")?.trim();
  const trainingId = sp.get("trainingId") || undefined;
  const filter     = sp.get("filter") ?? "all";
  const today      = getTodayInTashkent();

  const where: Prisma.HomeworkWhereInput = {};
  if (trainingId) where.trainingId = trainingId;
  if (q)          where.title = { contains: q, mode: "insensitive" };
  if (filter === "overdue") {
    where.dueDate = { lt: today, not: null };
  }

  const rows = await prisma.homework.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      training: { select: { id: true, name: true } },
      _count:   { select: { submissions: true } },
      submissions: {
        select: { grade: { select: { score: true } } },
      },
    },
  });

  const mapped = rows.map((hw) => {
    const total        = hw._count.submissions;
    const graded       = hw.submissions.filter((s) => s.grade).length;
    const pendingGrade = total - graded;
    const avgRaw       = graded > 0
      ? hw.submissions.reduce((acc, s) => acc + (s.grade?.score ?? 0), 0) / graded
      : null;
    return {
      id:               hw.id,
      title:            hw.title,
      description:      hw.description,
      due_date:         hw.dueDate,
      accepting_submissions: hw.acceptingSubmissions,
      closed_at:        hw.closedAt,
      closed_by_id:     hw.closedById,
      reopened_at:      hw.reopenedAt,
      reopened_by_id:   hw.reopenedById,
      max_score:        hw.maxScore,
      created_at:       hw.createdAt,
      training:         { id: hw.training.id, name: hw.training.name },
      submission_count: total,
      graded_count:     graded,
      pending_grade:    pendingGrade,
      avg_score:        avgRaw !== null ? Math.round(avgRaw) : null,
      is_overdue:       !!hw.dueDate && hw.dueDate < today,
    };
  });

  // "pending_grade" is computed — filter in memory
  const final = filter === "pending_grade"
    ? mapped.filter((h) => h.pending_grade > 0)
    : mapped;

  return NextResponse.json(final);
}
