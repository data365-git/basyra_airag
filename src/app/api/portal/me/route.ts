import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getPortalUser } from "@/lib/portalAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const portalUser = await getPortalUser(req);
  if (!portalUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const participant = await prisma.participant.findUnique({
    where: { id: portalUser.sub },
    include: {
      trainingParticipants: {
        include: {
          training: {
            select: { id: true, name: true, color: true, status: true },
          },
        },
      },
    },
  });

  if (!participant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id:       participant.id,
    name:     participant.fullName,
    username: portalUser.username,
    trainings: participant.trainingParticipants.map((tp) => ({
      id:     tp.training.id,
      name:   tp.training.name,
      color:  tp.training.color,
      status: tp.training.status,
    })),
  });
}
