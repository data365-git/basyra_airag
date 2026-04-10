import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

const CategorySchema = z.object({
  name_uz: z.string().min(1, "Uzbek name is required").max(100),
  name_ru: z.string().max(100).optional().nullable(),
  name_en: z.string().max(100).optional().nullable(),
  sort_order: z.number().int().min(0).optional(),
});

const PatchCategorySchema = CategorySchema.partial().extend({
  id: z.string().min(1),
});

function mapCategory(c: {
  id: string;
  nameUz: string;
  nameRu: string | null;
  nameEn: string | null;
  sortOrder: number;
  createdAt: Date;
  _count?: { trainings: number };
}) {
  return {
    id: c.id,
    name_uz: c.nameUz,
    name_ru: c.nameRu,
    name_en: c.nameEn,
    sort_order: c.sortOrder,
    created_at: c.createdAt,
    training_count: c._count?.trainings ?? 0,
  };
}

// GET /api/training-categories
export async function GET() {
  try {
    const categories = await prisma.trainingCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { nameUz: "asc" }],
      include: { _count: { select: { trainings: true } } },
    });
    return NextResponse.json(categories.map(mapCategory));
  } catch (e) {
    console.error("training-categories GET error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST /api/training-categories
export async function POST(request: Request) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "settings.categories", "create"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = CategorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name_uz, name_ru, name_en, sort_order } = parsed.data;
    const category = await prisma.trainingCategory.create({
      data: { nameUz: name_uz, nameRu: name_ru ?? null, nameEn: name_en ?? null, sortOrder: sort_order ?? 0 },
      include: { _count: { select: { trainings: true } } },
    });

    return NextResponse.json(mapCategory(category), { status: 201 });
  } catch (e) {
    console.error("training-categories POST error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// PATCH /api/training-categories
export async function PATCH(request: Request) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "settings.categories", "edit"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = PatchCategorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { id, name_uz, name_ru, name_en, sort_order } = parsed.data;

    const category = await prisma.trainingCategory.update({
      where: { id },
      data: {
        ...(name_uz !== undefined ? { nameUz: name_uz } : {}),
        ...(name_ru !== undefined ? { nameRu: name_ru } : {}),
        ...(name_en !== undefined ? { nameEn: name_en } : {}),
        ...(sort_order !== undefined ? { sortOrder: sort_order } : {}),
      },
      include: { _count: { select: { trainings: true } } },
    });

    return NextResponse.json(mapCategory(category));
  } catch (e) {
    console.error("training-categories PATCH error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// DELETE /api/training-categories
export async function DELETE(request: Request) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "settings.categories", "delete"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const trainingCount = await prisma.training.count({ where: { categoryId: id } });
    if (trainingCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${trainingCount} training${trainingCount === 1 ? " uses" : "s use"} this category` },
        { status: 409 }
      );
    }

    await prisma.trainingCategory.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("training-categories DELETE error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
