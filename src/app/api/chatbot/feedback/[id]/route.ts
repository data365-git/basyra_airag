import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set(["new", "in_review", "resolved"]);

async function requireChatbotAccess() {
  const user = await getFullUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const allowed =
    hasPermission(user, "chatbot", "conversations") ||
    hasPermission(user, "chatbot", "view");

  if (!allowed) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireChatbotAccess();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json();
  const status = typeof body.status === "string" ? body.status : undefined;
  const curatorNote =
    body.curator_note !== undefined
      ? body.curator_note
      : body.curatorNote;

  if (status !== undefined && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  if (curatorNote !== undefined && typeof curatorNote !== "string" && curatorNote !== null) {
    return NextResponse.json({ error: "Invalid curator note" }, { status: 400 });
  }

  if (status === undefined && curatorNote === undefined) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  try {
    const item = await prisma.studentFeedback.update({
      where: { id },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(curatorNote !== undefined
          ? { curatorNote: curatorNote?.trim() ? curatorNote.trim() : null }
          : {}),
      },
    });

    return NextResponse.json({
      id: item.id,
      status: item.status,
      curator_note: item.curatorNote,
    });
  } catch {
    return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
  }
}
