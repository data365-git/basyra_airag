import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

const CreateParticipantSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(200),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email("Invalid email").max(200).optional().nullable(),
  training_ids: z.array(z.string()).optional(),
});

export async function GET(request: Request) {
  try {
    const caller = await getFullUser();
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  } catch (e) {
    console.error("participants GET error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "participants", "create"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = CreateParticipantSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { full_name, phone, email, training_ids } = parsed.data;

    // Duplicate phone check
    if (phone) {
      const existing = await prisma.participant.findFirst({ where: { phone } });
      if (existing) {
        return NextResponse.json(
          { error: "A participant with this phone number already exists", field: "phone" },
          { status: 409 }
        );
      }
    }

    // Duplicate email check
    if (email) {
      const existing = await prisma.participant.findFirst({ where: { email } });
      if (existing) {
        return NextResponse.json(
          { error: "A participant with this email already exists", field: "email" },
          { status: 409 }
        );
      }
    }

    const participant = await prisma.participant.create({
      data: {
        fullName: full_name,
        phone: phone || null,
        email: email || null,
        ...(training_ids?.length
          ? {
              trainingParticipants: {
                create: training_ids.map((tid: string) => ({ trainingId: tid })),
              },
            }
          : {}),
      },
    });

    return NextResponse.json(participant, { status: 201 });
  } catch (e) {
    console.error("participants POST error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
