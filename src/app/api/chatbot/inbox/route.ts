import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUser } from "@/lib/getUser";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const kinds = searchParams.get("kind")?.split(",").filter(Boolean) ?? ["complaint","offer","lead"];
  const statuses = searchParams.get("status")?.split(",").filter(Boolean) ?? ["new","in_review"];
  const cursor = searchParams.get("cursor");
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 100);

  const items = await (prisma as any).inboxItem.findMany({
    where: {
      kind: { in: kinds },
      status: { in: statuses },
    },
    include: {
      participant: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  return NextResponse.json({
    ok: true,
    items: items.map((item: any) => ({
      id: item.id,
      chat_id: item.chatId.toString(),
      kind: item.kind,
      status: item.status,
      priority: item.priority,
      summary: item.summary,
      body: item.body,
      classifier_score: item.classifierScore,
      participant: item.participant
        ? { id: item.participant.id, full_name: item.participant.fullName }
        : null,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    })),
    next_cursor: items.length === limit ? items[items.length - 1].id : null,
  });
}
