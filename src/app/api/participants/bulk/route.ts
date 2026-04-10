import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

const BulkRowSchema = z.object({
  full_name: z.string().min(1),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().max(200).optional().nullable().or(z.literal("")),
});

const BulkImportSchema = z.object({
  participants: z.array(BulkRowSchema).min(1).max(1000),
});

export async function POST(request: Request) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "participants", "create"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = BulkImportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { participants } = parsed.data;

    // Collect all non-empty phones to check duplicates in one query
    const incomingPhones = participants
      .map((p) => p.phone)
      .filter((ph): ph is string => !!ph);

    const existingByPhone = incomingPhones.length > 0
      ? await prisma.participant.findMany({
          where: { phone: { in: incomingPhones } },
          select: { phone: true },
        })
      : [];

    const duplicatePhones = new Set(existingByPhone.map((p) => p.phone));

    const toCreate: typeof participants = [];
    const skipped: Array<{ full_name: string; phone?: string | null; reason: string }> = [];

    for (const p of participants) {
      if (p.phone && duplicatePhones.has(p.phone)) {
        skipped.push({ full_name: p.full_name, phone: p.phone, reason: "Duplicate phone number" });
      } else {
        toCreate.push(p);
      }
    }

    // All-or-nothing transaction for the valid rows
    await prisma.$transaction(async (tx) => {
      await tx.participant.createMany({
        data: toCreate.map((p) => ({
          fullName: p.full_name,
          phone: p.phone || null,
          email: (p.email && p.email !== "") ? p.email : null,
        })),
        skipDuplicates: true,
      });
    });

    return NextResponse.json({
      created: toCreate.length,
      skipped: skipped.length,
      skipped_rows: skipped,
    }, { status: 201 });
  } catch (e) {
    console.error("bulk import error:", e);
    return NextResponse.json({ error: "Internal error — no participants were imported" }, { status: 500 });
  }
}
