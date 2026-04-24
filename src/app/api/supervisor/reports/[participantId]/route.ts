import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSupervisorUser, assertSupervisorCanSee } from "@/lib/supervisorAuth";
import { getParticipantScorecard } from "@/lib/scorecard";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ participantId: string }> },
) {
  const supervisor = await getSupervisorUser(req);
  if (!supervisor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supervisorId = supervisor.sub;
  const { participantId } = await params;
  const { searchParams } = new URL(req.url);
  const trainingIdParam = searchParams.get("trainingId") ?? undefined;

  // Guard: ensure this supervisor is allowed to see this participant
  try {
    await assertSupervisorCanSee(supervisorId, participantId, trainingIdParam);
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err as Error & { status?: number }).status === 403
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw err;
  }

  // Fetch participant details
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    select: { id: true, fullName: true, phone: true, email: true },
  });
  if (!participant) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  // Fetch all trainings this supervisor can see for this participant
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assignments: any[] = await (prisma as any).supervisorAssignment.findMany({
    where: {
      supervisorId,
      participantId,
    },
    include: { training: true },
  });

  const hasNullAssignment = assignments.some((a: any) => a.trainingId === null);

  let visibleTrainings: Array<{ id: string; name: string; color: string; status: string }>;

  if (hasNullAssignment) {
    // All trainings this participant is enrolled in
    const enrollments = await prisma.trainingParticipant.findMany({
      where: { participantId },
      include: { training: true },
    });
    visibleTrainings = enrollments.map((e) => ({
      id: e.training.id,
      name: e.training.name,
      color: e.training.color,
      status: e.training.status,
    }));
  } else {
    // Only explicitly assigned trainings
    visibleTrainings = assignments
      .filter((a: any) => a.training !== null)
      .map((a: any) => ({
        id: a.training!.id,
        name: a.training!.name,
        color: a.training!.color,
        status: a.training!.status,
      }));
  }

  // Determine which trainingId to use for the scorecard
  let selectedTrainingId: string | undefined = trainingIdParam;

  if (!selectedTrainingId) {
    // Pick the first visible training
    selectedTrainingId = visibleTrainings[0]?.id;
  }

  if (!selectedTrainingId) {
    return NextResponse.json(
      { error: "No training found for this participant" },
      { status: 404 },
    );
  }

  const scorecard = await getParticipantScorecard(participantId, selectedTrainingId);

  return NextResponse.json({
    participant: {
      id: participant.id,
      name: participant.fullName,
      phone: participant.phone ?? null,
      email: participant.email ?? null,
    },
    trainings: visibleTrainings,
    selectedTrainingId,
    scorecard,
  });
}
