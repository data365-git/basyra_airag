import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const trainingId = searchParams.get("training_id");
  const search = searchParams.get("search");

  const participants = await prisma.participant.findMany({
    where: {
      ...(trainingId
        ? { trainingParticipants: { some: { trainingId } } }
        : {}),
      ...(search
        ? { fullName: { contains: search, mode: "insensitive" } }
        : {}),
    },
    orderBy: { fullName: "asc" },
  });

  return NextResponse.json(
    participants.map((p) => ({
      id: p.id,
      full_name: p.fullName,
      phone: p.phone,
      email: p.email,
      photo_url: p.photoUrl,
      qr_token: p.qrToken,
      created_at: p.createdAt,
    }))
  );
}

export async function POST(request: Request) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "participants", "create"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { full_name, phone, email, training_ids } = body;

  const participant = await prisma.participant.create({
    data: {
      fullName: full_name,
      phone,
      email,
      ...(training_ids?.length > 0
        ? {
            trainingParticipants: {
              create: training_ids.map((tid: string) => ({ trainingId: tid })),
            },
          }
        : {}),
    },
  });

  return NextResponse.json(participant, { status: 201 });
}
