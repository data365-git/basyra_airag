import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

// GET /api/translations — returns all DB translation overrides
export async function GET() {
  try {
    const rows = await prisma.translation.findMany({
      orderBy: [{ language: "asc" }, { key: "asc" }],
    });

    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        key: r.key,
        language: r.language,
        value: r.value,
        updated_at: r.updatedAt,
        updated_by: r.updatedById,
      }))
    );
  } catch (e) {
    console.error("translations GET error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const PatchSchema = z.object({
  key: z.string().min(1),
  language: z.enum(["uz", "ru", "en"]),
  value: z.string().min(1),
});

// PATCH /api/translations — upsert one key+language pair
export async function PATCH(request: Request) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "settings.translations", "edit"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { key, language, value } = parsed.data;

    const row = await prisma.translation.upsert({
      where: { key_language: { key, language } },
      update: { value, updatedById: user.id },
      create: { key, language, value, updatedById: user.id },
    });

    return NextResponse.json({
      id: row.id,
      key: row.key,
      language: row.language,
      value: row.value,
      updated_at: row.updatedAt,
      updated_by: row.updatedById,
    });
  } catch (e) {
    console.error("translations PATCH error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const DeleteSchema = z.object({
  key: z.string().min(1),
  language: z.enum(["uz", "ru", "en"]),
});

// DELETE /api/translations — remove a DB override (revert to bundled default)
export async function DELETE(request: Request) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "settings.translations", "edit"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = DeleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    const { key, language } = parsed.data;

    await prisma.translation.deleteMany({ where: { key, language } });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("translations DELETE error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
