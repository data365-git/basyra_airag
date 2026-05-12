import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyJWT, COOKIE_NAME } from "@/lib/auth";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  const jar   = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  const user  = token ? await verifyJWT(token) : null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const links = await prisma.telegramLink.findMany({
    orderBy: { linkedAt: "desc" },
    include: {
      participant: {
        include: {
          trainingParticipants: { include: { training: { select: { name: true } } } },
        },
      },
    },
  });

  return NextResponse.json(
    links.map((l) => ({
      id:         l.participant.id,
      full_name:  l.participant.fullName,
      username:   l.username,
      first_name: l.firstName,
      linked_at:  l.linkedAt,
      trainings:  l.participant.trainingParticipants.map((tp) => tp.training.name),
    }))
  );
}
