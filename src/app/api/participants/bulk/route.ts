import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

const BulkParticipantSchema = z.object({
  participants: z
    .array(
      z.object({
        full_name: z.string().min(1).max(200),
        phone:     z.string().max(30).optional().nullable(),
        email:     z.string().email().max(200).optional().nullable(),
      })
    )
    .min(1)
    .max(500),
});

export async function POST(request: Request) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "participants", "create"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body   = await request.json();
    const parsed = BulkParticipantSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { participants } = parsed.data;

    // ── Pre-load existing phones and names for O(n) dedup ─────────────────────
    const incomingPhones = participants
      .map((p) => p.phone)
      .filter((ph): ph is string => !!ph);

    const existingByPhone = incomingPhones.length
      ? await prisma.participant.findMany({
          where: { phone: { in: incomingPhones } },
          select: { phone: true },
        })
      : [];
    const takenPhones = new Set(existingByPhone.map((p) => p.phone!));

    const incomingNames = participants.map((p) => p.full_name);
    const existingByName = await prisma.participant.findMany({
      where: { fullName: { in: incomingNames, mode: "insensitive" } },
      select: { fullName: true },
    });
    const takenNames = new Set(existingByName.map((p) => p.fullName.toLowerCase()));

    // ── Partition into create / skip ──────────────────────────────────────────
    const toCreate: typeof participants = [];
    const skipped_rows: Array<{ full_name: string; phone?: string | null; reason: string }> = [];

    for (const p of participants) {
      if (p.phone && takenPhones.has(p.phone)) {
        skipped_rows.push({ full_name: p.full_name, phone: p.phone, reason: "Duplicate phone" });
        continue;
      }
      if (!p.phone && takenNames.has(p.full_name.toLowerCase())) {
        skipped_rows.push({ full_name: p.full_name, phone: null, reason: "Duplicate name" });
        continue;
      }
      toCreate.push(p);
    }

    // ── Bulk insert ───────────────────────────────────────────────────────────
    let created = 0;
    if (toCreate.length > 0) {
      const result = await prisma.participant.createMany({
        data: toCreate.map((p) => ({
          fullName: p.full_name,
          phone:    p.phone || null,
          email:    p.email || null,
        })),
        skipDuplicates: true,
      });
      created = result.count;
    }

    return NextResponse.json({
      created,
      skipped: skipped_rows.length,
      skipped_rows,
    });
  } catch (e) {
    console.error("participants bulk POST error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
