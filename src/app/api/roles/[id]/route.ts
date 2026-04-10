import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "settings.roles", "delete"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const userCount = await prisma.staffUser.count({ where: { roleId: id } });
    if (userCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${userCount} user${userCount === 1 ? " is" : "s are"} assigned this role` },
        { status: 409 }
      );
    }

    await prisma.role.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("role DELETE error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
