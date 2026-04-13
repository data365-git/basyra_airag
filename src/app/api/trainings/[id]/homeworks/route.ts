import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { verifyJWT, COOKIE_NAME } from "@/lib/auth";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

async function getStaffUser() {
  const jar   = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  return token ? verifyJWT(token) : null;
}

// GET /api/trainings/[id]/homeworks
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: trainingId } = await params;

  const homeworks = await prisma.homework.findMany({
    where:   { trainingId },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { submissions: true } },
      submissions: {
        select: { grade: { select: { score: true } } },
      },
    },
  });

  return NextResponse.json(
    homeworks.map((hw) => {
      const graded = hw.submissions.filter((s) => s.grade).length;
      const avgRaw = graded > 0
        ? hw.submissions.reduce((s, sub) => s + (sub.grade?.score ?? 0), 0) / graded
        : null;
      return {
        id:          hw.id,
        title:       hw.title,
        description: hw.description,
        due_date:    hw.dueDate,
        max_score:   hw.maxScore,
        created_at:  hw.createdAt,
        submission_count: hw._count.submissions,
        graded_count: graded,
        avg_score:   avgRaw !== null ? Math.round(avgRaw) : null,
      };
    })
  );
}

// POST /api/trainings/[id]/homeworks
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: trainingId } = await params;
  const body = await req.json().catch(() => ({}));
  const { title, description, due_date, max_score } = body;

  if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 });

  const hw = await prisma.homework.create({
    data: {
      trainingId,
      title:       title.trim(),
      description: description?.trim() || null,
      dueDate:     due_date || null,
      maxScore:    max_score ?? 100,
      createdById: user.sub,
    },
  });

  return NextResponse.json(hw, { status: 201 });
}
