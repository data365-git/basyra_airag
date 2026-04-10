import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "trainings", "edit"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const session = await prisma.session.update({
      where: { id },
      data: { status: "open" },
    });

    return NextResponse.json(session);
  } catch (e) {
    console.error("session open error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
