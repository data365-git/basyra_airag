export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";

type EligibilityMode = "supervisor" | "employee";

function getEligibilityReason(params: {
  mode: EligibilityMode;
  candidateId: string;
  targetId: string;
  candidateIsEmployee: boolean;
  candidateIsSupervisor: boolean;
  targetIsEmployee: boolean;
  targetIsSupervisor: boolean;
  isDuplicate: boolean;
}) {
  const {
    mode,
    candidateId,
    targetId,
    candidateIsEmployee,
    candidateIsSupervisor,
    targetIsEmployee,
    targetIsSupervisor,
    isDuplicate,
  } = params;

  if (candidateId === targetId) {
    return "Participant cannot supervise themselves";
  }

  if (isDuplicate) {
    return "Supervisor link already exists";
  }

  if (mode === "supervisor") {
    if (candidateIsEmployee) {
      return "Participant is already an employee";
    }

    if (targetIsSupervisor) {
      return "Selected participant is already a supervisor";
    }

    return null;
  }

  if (targetIsEmployee) {
    return "Selected participant is already an employee";
  }

  if (candidateIsSupervisor) {
    return "Participant is already a supervisor";
  }

  return null;
}

export async function GET(request: Request) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const eligibleSupervisorFor = searchParams.get("eligible_supervisor_for");
  const eligibleEmployeeFor = searchParams.get("eligible_employee_for");

  if (q.length < 2) {
    return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 });
  }

  if (eligibleSupervisorFor && eligibleEmployeeFor) {
    return NextResponse.json(
      { error: "Use only one eligibility filter at a time" },
      { status: 400 }
    );
  }

  const participants = await prisma.participant.findMany({
    where: {
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
      ],
    },
    select: {
      id: true,
      fullName: true,
      phone: true,
      _count: {
        select: {
          supervisedLinks: true,
          subordinateLinks: true,
        },
      },
    },
    take: 20,
    orderBy: { fullName: "asc" },
  });

  const eligibilityTargetId = eligibleSupervisorFor ?? eligibleEmployeeFor;
  const eligibilityMode: EligibilityMode | null = eligibleSupervisorFor
    ? "supervisor"
    : eligibleEmployeeFor
      ? "employee"
      : null;

  const targetParticipant = eligibilityTargetId
    ? await prisma.participant.findUnique({
        where: { id: eligibilityTargetId },
        select: {
          id: true,
          _count: {
            select: {
              supervisedLinks: true,
              subordinateLinks: true,
            },
          },
        },
      })
    : null;

  if (eligibilityTargetId && !targetParticipant) {
    return NextResponse.json({ error: "Eligibility target not found" }, { status: 400 });
  }

  const existingLinks = eligibilityTargetId && eligibilityMode
    ? await prisma.supervisorLink.findMany({
        where: eligibilityMode === "supervisor"
          ? {
              reportId: eligibilityTargetId,
              bossId: { in: participants.map((p) => p.id) },
            }
          : {
              bossId: eligibilityTargetId,
              reportId: { in: participants.map((p) => p.id) },
            },
        select: {
          bossId: true,
          reportId: true,
        },
      })
    : [];

  const duplicateIds = new Set(
    existingLinks.map((link) => eligibilityMode === "supervisor" ? link.bossId : link.reportId)
  );

  return NextResponse.json(
    participants.map((p) => {
      const isSupervisor = p._count.supervisedLinks > 0;
      const isEmployee = p._count.subordinateLinks > 0;
      const reason = eligibilityMode && eligibilityTargetId && targetParticipant
        ? getEligibilityReason({
            mode: eligibilityMode,
            candidateId: p.id,
            targetId: eligibilityTargetId,
            candidateIsEmployee: isEmployee,
            candidateIsSupervisor: isSupervisor,
            targetIsEmployee: targetParticipant._count.subordinateLinks > 0,
            targetIsSupervisor: targetParticipant._count.supervisedLinks > 0,
            isDuplicate: duplicateIds.has(p.id),
          })
        : null;

      return {
        id: p.id,
        full_name: p.fullName,
        phone: p.phone,
        is_supervisor: isSupervisor,
        is_employee: isEmployee,
        eligibility: eligibilityMode
          ? {
              mode: eligibilityMode,
              eligible: reason === null,
              reason,
            }
          : null,
      };
    })
  );
}
