import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

const PatchParticipantSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email("Invalid email").max(200).optional().nullable(),
  photo_url: z.string().url().optional().nullable(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const p = await prisma.participant.findUnique({
      where: { id },
      include: {
        trainingParticipants: {
          include: {
            training: {
              select: { id: true, name: true, color: true, icon: true, startDate: true, endDate: true, status: true, scheduleDays: true },
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
      training_participants: (p as any).trainingParticipants?.map((tp: any) => ({
        enrolled_at: tp.enrolledAt,
        training: {
          id: tp.training.id,
          name: tp.training.name,
          color: tp.training.color,
          icon: tp.training.icon,
          start_date: tp.training.startDate.toISOString().slice(0, 10),
          end_date: tp.training.endDate.toISOString().slice(0, 10),
          status: tp.training.status,
          schedule_days: tp.training.scheduleDays,
        },
      })) ?? [],
    });
  } catch (e) {
    console.error("participant GET error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "participants", "edit"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const parsed = PatchParticipantSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const data: Record<string, unknown> = {};
    if (d.full_name !== undefined) data.fullName = d.full_name;
    if (d.phone !== undefined) data.phone = d.phone;
    if (d.email !== undefined) data.email = d.email;
    if (d.photo_url !== undefined) data.photoUrl = d.photo_url;

    const participant = await prisma.participant.update({ where: { id }, data });
    return NextResponse.json({
      id: participant.id,
      full_name: participant.fullName,
      phone: participant.phone,
      email: participant.email,
      photo_url: participant.photoUrl,
      qr_token: participant.qrToken,
      created_at: participant.createdAt,
    });
  } catch (e) {
    console.error("participant PATCH error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "participants", "delete"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    await prisma.participant.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("participant DELETE error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
