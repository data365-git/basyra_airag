import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await prisma.session.update({
    where: { id },
    data: { status: "open" },
  });

  return NextResponse.json(session);
}
