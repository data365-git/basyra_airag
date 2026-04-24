import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSupervisorUser } from "@/lib/supervisorAuth";
import { getParticipantScorecard } from "@/lib/scorecard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supervisor = await getSupervisorUser(req);
  if (!supervisor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supervisorId = supervisor.sub;

  // Fetch all assignments for this supervisor, including participant and training data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assignments: any[] = await (prisma as any).supervisorAssignment.findMany({
    where: { supervisorId },
    include: {
      participant: true,
      training: true,
    },
  });

  // Group by participantId
  // participantId → { participant, Set of explicit trainingIds, hasNullAssignment }
  const participantMap = new Map<
    string,
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      participant: any;
      trainingIds: Set<string>;
      hasNullAssignment: boolean;
    }
  >();

  for (const a of assignments) {
    if (!participantMap.has(a.participantId)) {
      participantMap.set(a.participantId, {
        participant: a.participant,
        trainingIds: new Set(),
        hasNullAssignment: false,
      });
    }
    const entry = participantMap.get(a.participantId)!;
    if (a.trainingId === null) {
      entry.hasNullAssignment = true;
    } else {
      entry.trainingIds.add(a.trainingId);
    }
  }

  // For participants with a null-training assignment, fetch all their trainings
  const nullParticipantIds = [...participantMap.entries()]
    .filter(([, v]) => v.hasNullAssignment)
    .map(([id]) => id);

  const allEnrollments =
    nullParticipantIds.length > 0
      ? await prisma.trainingParticipant.findMany({
          where: { participantId: { in: nullParticipantIds } },
          include: { training: true },
        })
      : [];

  // Group enrollments by participantId
  const enrollmentMap = new Map<
    string,
    (typeof allEnrollments)[number]["training"][]
  >();
  for (const e of allEnrollments) {
    if (!enrollmentMap.has(e.participantId)) {
      enrollmentMap.set(e.participantId, []);
    }
    enrollmentMap.get(e.participantId)!.push(e.training);
  }

  // For specific trainingId assignments we need the training objects — already in assignments
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trainingById = new Map<string, any>();
  for (const a of assignments) {
    if (a.training) {
      trainingById.set(a.training.id, a.training);
    }
  }

  // Build final people list
  const people = [...participantMap.entries()].map(([participantId, entry]) => {
    let trainings: Array<{
      id: string;
      name: string;
      color: string;
      status: string;
    }>;

    if (entry.hasNullAssignment) {
      // All trainings from TrainingParticipant
      const fromEnrollments = enrollmentMap.get(participantId) ?? [];
      // Also include any explicit trainingId assignments not already in enrollments
      const seen = new Set(fromEnrollments.map((t) => t.id));
      for (const tid of entry.trainingIds) {
        if (!seen.has(tid) && trainingById.has(tid)) {
          fromEnrollments.push(trainingById.get(tid)!);
          seen.add(tid);
        }
      }
      trainings = fromEnrollments.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        status: t.status,
      }));
    } else {
      // Only explicitly assigned trainings
      trainings = [...entry.trainingIds]
        .map((tid) => trainingById.get(tid))
        .filter((t): t is NonNullable<typeof t> => t !== undefined)
        .map((t) => ({
          id: t.id,
          name: t.name,
          color: t.color,
          status: t.status,
        }));
    }

    return {
      id: participantId,
      name: entry.participant.fullName,
      trainings,
    };
  });

  // Fetch overall score for each person (use their first training)
  const peopleWithScores = await Promise.all(
    people.map(async (person) => {
      if (person.trainings.length === 0) return { ...person, overall_score: undefined };
      try {
        const sc = await getParticipantScorecard(person.id, person.trainings[0].id);
        return { ...person, overall_score: sc.overallScore };
      } catch {
        return { ...person, overall_score: undefined };
      }
    }),
  );

  return NextResponse.json({ people: peopleWithScores });
}
