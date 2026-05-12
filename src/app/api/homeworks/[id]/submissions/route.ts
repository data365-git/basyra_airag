import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { verifyJWT, COOKIE_NAME } from "@/lib/auth";
import { getPortalUser } from "@/lib/portalAuth";
import { toTashkentDateStr } from "@/lib/sessionWindow";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

async function getActor() {
  const staff  = await (async () => { const jar = await cookies(); const t = jar.get(COOKIE_NAME)?.value; return t ? verifyJWT(t) : null; })();
  const portal = await getPortalUser();
  return { staff, portal };
}

function calculateLateInfo(submittedAt: Date, dueDate: string | null) {
  if (!dueDate) return { isLate: false, lateByDays: null };

  const submittedDate = toTashkentDateStr(submittedAt);
  const lateByDays = Math.round(
    (new Date(`${submittedDate}T00:00:00Z`).getTime() - new Date(`${dueDate}T00:00:00Z`).getTime()) / 86400000
  );

  return { isLate: lateByDays > 0, lateByDays: lateByDays > 0 ? lateByDays : null };
}

// GET /api/homeworks/[id]/submissions — staff only, returns all submissions with grades
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { staff } = await getActor();
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: homeworkId } = await params;

  const subs = await prisma.homeworkSubmission.findMany({
    where:   { homeworkId },
    orderBy: { submittedAt: "asc" },
    include: {
      participant: { select: { id: true, fullName: true } },
      grade:       true,
      files:       true,
    },
  });

  return NextResponse.json(
    subs.map((s) => ({
      id:           s.id,
      participant:  { id: s.participant.id, full_name: s.participant.fullName },
      text:         s.text,
      submitted_at: s.submittedAt,
      is_late:      s.isLate,
      late_by_days: s.lateByDays,
      grade: s.grade ? { score: s.grade.score, feedback: s.grade.feedback, graded_at: s.grade.gradedAt } : null,
      files: s.files.map((f) => ({
        id:               f.id,
        file_name:        f.fileName,
        file_type:        f.fileType,
        file_size_bytes:  f.fileSizeBytes,
        storage_url:      f.storageUrl,
        telegram_file_id: f.telegramFileId,
      })),
    }))
  );
}

// POST /api/homeworks/[id]/submissions — portal participant submits their work
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { portal } = await getActor();
  if (!portal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: homeworkId } = await params;
  const body = await req.json().catch(() => ({}));
  const { text } = body;

  const homework = await prisma.homework.findUnique({
    where:  { id: homeworkId },
    select: { dueDate: true, hardCloseAt: true, allowLateSubmission: true, acceptingSubmissions: true, closedAt: true },
  });

  if (!homework) return NextResponse.json({ error: "Homework not found" }, { status: 404 });

  // Manual admin close — hard stop
  if (!homework.acceptingSubmissions) {
    return NextResponse.json(
      {
        error: "This homework is closed and no longer accepting submissions.",
        code: "submissions_closed",
        closed_at: homework.closedAt,
      },
      { status: 403 }
    );
  }

  const today = toTashkentDateStr(new Date());

  // Hard cutoff date — absolute block regardless of allowLateSubmission
  if (homework.hardCloseAt && today > homework.hardCloseAt) {
    return NextResponse.json(
      {
        error: "The submission deadline has passed and this homework is now closed.",
        code: "hard_close_passed",
        closed_at: homework.hardCloseAt,
      },
      { status: 403 }
    );
  }

  // Soft deadline — block only if late submissions are not allowed
  if (!homework.allowLateSubmission && homework.dueDate && today > homework.dueDate) {
    return NextResponse.json(
      {
        error: "The deadline has passed and late submissions are not allowed for this homework.",
        code: "late_submission_not_allowed",
        due_date: homework.dueDate,
      },
      { status: 403 }
    );
  }

  const submittedAt = new Date();
  const lateInfo = calculateLateInfo(submittedAt, homework.dueDate);

  const sub = await prisma.homeworkSubmission.upsert({
    where:  { homeworkId_participantId: { homeworkId, participantId: portal.sub } },
    update: { text: text || null, submittedAt, isLate: lateInfo.isLate, lateByDays: lateInfo.lateByDays },
    create: { homeworkId, participantId: portal.sub, text: text || null, submittedAt, isLate: lateInfo.isLate, lateByDays: lateInfo.lateByDays },
  });

  return NextResponse.json(sub, { status: 201 });
}
