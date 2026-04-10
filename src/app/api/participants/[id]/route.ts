import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const p = await prisma.participant.findUnique({
    where: { id },
    include: {
      trainingParticipants: {
        include: {
          training: {
            select: { id: true, name: true, color: true, icon: true, startDate: true, endDate: true, status: true, scheduleDay: true },
          },
        },
      },
    },
  });

  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: p.id,
    full_name: p.fullName,
    phone: p.phone,
    email: p.email,
    photo_url: p.photoUrl,
    qr_token: p.qrToken,
    created_at: p.createdAt,
    training_participants: p.trainingParticipants.map((tp) => ({
      enrolled_at: tp.enrolledAt,
      training: {
        id: tp.training.id,
        name: tp.training.name,
        color: tp.training.color,
        icon: tp.training.icon,
        start_date: tp.training.startDate.toISOString().slice(0, 10),
        end_date: tp.training.endDate.toISOString().slice(0, 10),
        status: tp.training.status,
        schedule_day: tp.training.scheduleDay,
      },
    })),
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.full_name !== undefined) data.fullName = body.full_name;
  if (body.phone !== undefined) data.phone = body.phone;
  if (body.email !== undefined) data.email = body.email;
  if (body.photo_url !== undefined) data.photoUrl = body.photo_url;

  const participant = await prisma.participant.update({ where: { id }, data });
  return NextResponse.json(participant);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.participant.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
