import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { isSuperadmin } from "@/lib/permissions";

/** GET /api/settings — returns all system settings (superadmin only) */
export async function GET() {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperadmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const settings = await prisma.systemSetting.findMany({
      orderBy: { key: "asc" },
    });

    return NextResponse.json(
      settings.map((s) => ({
        key: s.key,
        value: s.value,
        updated_at: s.updatedAt,
        updated_by: s.updatedBy,
      }))
    );
  } catch (e) {
    console.error("settings GET error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const PatchSettingsSchema = z.object({
  late_threshold_minutes: z.number().int().min(0).max(120),
});

/** PATCH /api/settings — update system settings (superadmin only) */
export async function PATCH(request: Request) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperadmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();
    const parsed = PatchSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { late_threshold_minutes } = parsed.data;

    await prisma.systemSetting.upsert({
      where: { key: "late_threshold_minutes" },
      update: { value: String(late_threshold_minutes), updatedBy: user.id },
      create: { key: "late_threshold_minutes", value: String(late_threshold_minutes), updatedBy: user.id },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("settings PATCH error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
