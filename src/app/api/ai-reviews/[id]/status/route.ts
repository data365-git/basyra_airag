import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";

const VALID_STATUSES = ["new", "triaging", "fixed", "wont_fix"] as const;
type Status = (typeof VALID_STATUSES)[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: { status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { status } = body;
  if (!status || !VALID_STATUSES.includes(status as Status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    await prisma.botMessageRating.update({
      where: { id },
      data: {
        status: status as string,
        curatedById: user.id,
        curatedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("ai-reviews PATCH status error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
