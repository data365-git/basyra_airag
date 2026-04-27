import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getPortalUser } from "@/lib/portalAuth";
import { getParticipantScorecard } from "@/lib/scorecard";

export const dynamic = "force-dynamic";

type AttendanceSummary = {
  present: number;
  late: number;
  excused: number;
  absent: number;
  total: number;
};

type TrainingLite = {
  id: string;
  name: string;
  color: string;
  status: string;
};

type TrainingProgress = TrainingLite & {
  attendance_percent: number;
  homework_completion_percent: number;
  average_score: number | null;
  overall_score: number;
  risk_status: RiskStatus;
};

type RiskStatus = "low" | "medium" | "high" | "unknown";

type EmployeeRow = {
  link_id: string | null;
  participant: {
    id: string;
    full_name: string;
    phone: string | null;
    trainings: TrainingLite[];
    attendance_summary: AttendanceSummary;
    attendance_percent: number;
    homework_completion_percent: number;
    average_score: number | null;
    overall_score: number;
    risk_status: RiskStatus;
    last_activity: string | null;
    training_progress: TrainingProgress[];
  };
};

type TeamSummary = {
  employee_count: number;
  avg_attendance_percent: number;
  avg_homework_completion_percent: number;
  avg_score: number | null;
  risk_counts: Record<RiskStatus, number>;
};

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function safeDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function latestIso(values: Array<Date | string | null | undefined>): string | null {
  let latest: Date | null = null;
  for (const value of values) {
    if (!value) continue;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    if (!latest || date > latest) latest = date;
  }
  return safeDate(latest);
}

function riskStatus(metrics: {
  attendancePercent: number;
  homeworkCompletionPercent: number;
  averageScore: number | null;
  overallScore: number;
  trainingCount: number;
}): RiskStatus {
  if (metrics.trainingCount === 0) return "unknown";
  const score = metrics.averageScore ?? metrics.overallScore;
  if (
    metrics.attendancePercent < 60 ||
    metrics.homeworkCompletionPercent < 50 ||
    score < 50
  ) {
    return "high";
  }
  if (
    metrics.attendancePercent < 75 ||
    metrics.homeworkCompletionPercent < 75 ||
    score < 70
  ) {
    return "medium";
  }
  return "low";
}

function emptyAttendance(): AttendanceSummary {
  return { present: 0, late: 0, excused: 0, absent: 0, total: 0 };
}

function attendancePercent(summary: AttendanceSummary): number {
  if (summary.total === 0) return 0;
  return Math.round(((summary.present + summary.late + summary.excused) / summary.total) * 100);
}

async function buildEmployee(
  participantId: string,
  linkId: string | null,
): Promise<EmployeeRow | null> {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: {
      trainingParticipants: {
        include: {
          training: { select: { id: true, name: true, color: true, status: true } },
        },
      },
      attendance: { select: { status: true, scannedAt: true, overrideAt: true } },
      homeworkSubmissions: { select: { submittedAt: true } },
      activityScores: { select: { createdAt: true } },
    },
  });

  if (!participant) return null;

  const summary = participant.attendance.reduce<AttendanceSummary>((acc, item) => {
    if (item.status === "present") acc.present++;
    else if (item.status === "late") acc.late++;
    else if (item.status === "excused") acc.excused++;
    else acc.absent++;
    acc.total++;
    return acc;
  }, emptyAttendance());

  const trainingProgress = await Promise.all(
    participant.trainingParticipants.map(async (tp) => {
      const scorecard = await getParticipantScorecard(participant.id, tp.training.id);
      const averageScore = scorecard.homework.avgScore ?? scorecard.activity.avgScore;
      return {
        id: tp.training.id,
        name: tp.training.name,
        color: tp.training.color,
        status: tp.training.status,
        attendance_percent: scorecard.attendance.rate,
        homework_completion_percent: scorecard.homework.submitRate,
        average_score: averageScore,
        overall_score: scorecard.overallScore,
        risk_status: riskStatus({
          attendancePercent: scorecard.attendance.rate,
          homeworkCompletionPercent: scorecard.homework.submitRate,
          averageScore,
          overallScore: scorecard.overallScore,
          trainingCount: 1,
        }),
      };
    }),
  );

  const employeeAttendancePercent = attendancePercent(summary);
  const homeworkCompletionPercent = avg(trainingProgress.map((item) => item.homework_completion_percent)) ?? 0;
  const averageScore = avg(trainingProgress.flatMap((item) => item.average_score == null ? [] : [item.average_score]));
  const overallScore = avg(trainingProgress.map((item) => item.overall_score)) ?? 0;
  const employeeRisk = riskStatus({
    attendancePercent: employeeAttendancePercent,
    homeworkCompletionPercent,
    averageScore,
    overallScore,
    trainingCount: trainingProgress.length,
  });

  return {
    link_id: linkId,
    participant: {
      id: participant.id,
      full_name: participant.fullName,
      phone: participant.phone,
      trainings: participant.trainingParticipants.map((tp) => ({
        id: tp.training.id,
        name: tp.training.name,
        color: tp.training.color,
        status: tp.training.status,
      })),
      attendance_summary: summary,
      attendance_percent: employeeAttendancePercent,
      homework_completion_percent: homeworkCompletionPercent,
      average_score: averageScore,
      overall_score: overallScore,
      risk_status: employeeRisk,
      last_activity: latestIso([
        participant.lastSeenAt,
        ...participant.attendance.map((item) => item.scannedAt ?? item.overrideAt),
        ...participant.homeworkSubmissions.map((item) => item.submittedAt),
        ...participant.activityScores.map((item) => item.createdAt),
      ]),
      training_progress: trainingProgress,
    },
  };
}

function buildSummary(employees: EmployeeRow[]): TeamSummary {
  const scores = employees.flatMap((employee) => (
    employee.participant.average_score == null ? [] : [employee.participant.average_score]
  ));
  const riskCounts: Record<RiskStatus, number> = { low: 0, medium: 0, high: 0, unknown: 0 };
  for (const employee of employees) riskCounts[employee.participant.risk_status]++;

  return {
    employee_count: employees.length,
    avg_attendance_percent: avg(employees.map((employee) => employee.participant.attendance_percent)) ?? 0,
    avg_homework_completion_percent: avg(employees.map((employee) => employee.participant.homework_completion_percent)) ?? 0,
    avg_score: avg(scores),
    risk_counts: riskCounts,
  };
}

export async function GET(req: Request) {
  const portalUser = await getPortalUser(req);
  if (!portalUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const links = await prisma.supervisorLink.findMany({
    where: { bossId: portalUser.sub },
    select: { id: true, reportId: true },
  });

  const employees: EmployeeRow[] = [];
  const seen = new Set<string>();

  for (const link of links) {
    if (seen.has(link.reportId)) continue;
    seen.add(link.reportId);
    const employee = await buildEmployee(link.reportId, link.id);
    if (employee) employees.push(employee);
  }

  return NextResponse.json({
    employees,
    summary: buildSummary(employees),
    legacy_links: links.length,
  });
}
