import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUser } from "@/lib/getUser";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const updated = await (prisma as any).inboxItem.update({
    where: { id },
    data: {
      ...(body.status && { status: body.status }),
      ...(body.priority && { priority: body.priority }),
      ...(body.assigned_to_id !== undefined && { assignedToId: body.assigned_to_id }),
      ...(body.resolution_note !== undefined && { resolutionNote: body.resolution_note }),
      ...(body.status === "resolved" && { resolvedAt: new Date() }),
    },
  });
  return NextResponse.json({ ok: true, id: updated.id, status: updated.status });
}
