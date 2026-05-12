import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import { deleteR2ObjectByPublicUrl } from "@/lib/r2Upload";
import { deleteLocalFile } from "@/lib/localUpload";
import { logSubmissionEvent, SubmissionEventType } from "@/lib/submissionEvents";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; subId: string; fileId: string }> }
) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "trainings", "edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: homeworkId, subId, fileId } = await params;

  const file = await prisma.homeworkFile.findFirst({
    where: {
      id: fileId,
      submissionId: subId,
      submission: { homeworkId },
    },
    include: {
      submission: {
        select: {
          id: true,
          participantId: true,
          participant: { select: { fullName: true } },
        },
      },
    },
  });

  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  await prisma.homeworkFile.delete({ where: { id: file.id } });

  if (file.storageUrl) {
    // Try both storage backends — exactly one will match
    void deleteR2ObjectByPublicUrl(file.storageUrl);   // R2 (no-ops if not R2 URL)
    void deleteLocalFile(file.storageUrl);              // Railway Volume (no-ops if not /api/files/ URL)
  }

  void logSubmissionEvent(prisma, {
    submissionId: file.submission.id,
    actorId: user.id,
    actorRole: "admin",
    actorName: user.name,
    eventType: SubmissionEventType.FILE_DELETED,
    meta: {
      filename: file.fileName,
      size: file.fileSizeBytes,
      fileType: file.fileType,
      participantId: file.submission.participantId,
      participantName: file.submission.participant.fullName,
    },
  });

  return NextResponse.json({ ok: true });
}
