import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const trainingId = searchParams.get("training_id");
  const statusParam = searchParams.get("status");
  const statuses = statusParam ? statusParam.split(",") : undefined;

  const sessions = await prisma.session.findMany({
    where: {
      ...(trainingId ? { trainingId } : {}),
      ...(statuses ? { status: { in: statuses } } : {}),
    },
    orderBy: [{ trainingId: "asc" }, { sessionNumber: "asc" }],
  });

  return NextResponse.json(
    sessions.map((s) => ({
      id: s.id,
      training_id: s.trainingId,
      session_number: s.sessionNumber,
      session_date: s.sessionDate.toISOString().slice(0, 10),
      session_time: s.sessionTime,
      status: s.status,
      created_at: s.createdAt,
    }))
  );
}
