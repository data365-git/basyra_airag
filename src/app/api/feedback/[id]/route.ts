import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const item = await prisma.studentFeedback.update({
    where: { id: params.id },
    data: {
      ...(body.status      ? { status: body.status }           : {}),
      ...(body.curatorNote !== undefined ? { curatorNote: body.curatorNote } : {}),
    },
  });
  return NextResponse.json({ id: item.id, status: item.status });
}
