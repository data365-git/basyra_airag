import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getPortalUser } from "@/lib/portalAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const portalUser = await getPortalUser(req);
  if (!portalUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const links = await prisma.supervisorLink.findMany({
    where: { bossId: portalUser.sub },
    include: {
      report: {
        include: {
          trainingParticipants: {
            include: { training: { select: { id: true, name: true, color: true } } },
          },
          attendance: {
            select: { status: true },
          },
        },
      },
    },
  });

  const result = links.map((link) => {
    const att = link.report.attendance;
    const summary = {
      present: att.filter((a) => a.status === "present").length,
      late:    att.filter((a) => a.status === "late").length,
      absent:  att.filter((a) => a.status === "absent").length,
      total:   att.length,
    };

    return {
      link_id: link.id,
      participant: {
        id:        link.report.id,
        full_name: link.report.fullName,
        phone:     link.report.phone,
        trainings: link.report.trainingParticipants.map((tp) => ({
          id:    tp.training.id,
          name:  tp.training.name,
          color: tp.training.color,
        })),
        attendance_summary: summary,
      },
    };
  });

  return NextResponse.json(result);
}
