import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSupervisorUser } from "@/lib/supervisorAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSupervisorUser(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supervisor = await prisma.supervisor.findUnique({
    where: { id: session.sub },
    select: { id: true, name: true, email: true, isActive: true },
  });

  if (!supervisor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(supervisor);
}
