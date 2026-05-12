import { NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ratings = await (prisma as any).botMessageRating.findMany({
    where: { stars: { lte: 2 } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      message: {
        select: {
          id: true,
          content: true,
          chatId: true,
          createdAt: true,
          replyToMessage: {
            select: { content: true, createdAt: true },
          },
        },
      },
    },
  });

  return NextResponse.json({
    ratings: ratings.map((r: any) => ({
      id:           r.id,
      stars:        r.stars,
      reason:       r.reason ?? null,
      curator_note: r.curator_note ?? null,
      status:       r.status ?? null,
      created_at:   r.createdAt?.toISOString() ?? null,
      answer: {
        id:         r.message?.id ?? null,
        content:    r.message?.content ?? null,
        chat_id:    r.message?.chatId?.toString() ?? null,
        created_at: r.message?.createdAt?.toISOString() ?? null,
      },
      question: {
        content:    r.message?.replyToMessage?.content ?? null,
        created_at: r.message?.replyToMessage?.createdAt?.toISOString() ?? null,
      },
    })),
  });
}
