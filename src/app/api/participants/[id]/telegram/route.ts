import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { verifyJWT, COOKIE_NAME } from "@/lib/auth";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";

async function getStaffUser() {
  const jar   = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  return token ? verifyJWT(token) : null;
}

// GET — current Telegram link status for this participant
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: participantId } = await params;

  const [link, code] = await Promise.all([
    prisma.telegramLink.findUnique({ where: { participantId } }),
    prisma.telegramLinkCode.findUnique({ where: { participantId } }),
  ]);

  return NextResponse.json({
    linked: !!link,
    chatId:    link ? String(link.chatId) : null,
    username:  link?.username ?? null,
    firstName: link?.firstName ?? null,
    linkedAt:  link?.linkedAt ?? null,
    // active (not expired) link code
    pendingCode: code && code.expiresAt > new Date() ? code.code : null,
    codeExpiresAt: code?.expiresAt ?? null,
  });
}

// POST — generate a fresh 8-char link code (or return existing if not expired)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: participantId } = await params;

  // Ensure participant exists
  const participant = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!participant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const code      = randomBytes(4).toString("hex").toUpperCase(); // 8 hex chars
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);  // 24 hours

  await prisma.telegramLinkCode.upsert({
    where:  { participantId },
    update: { code, expiresAt },
    create: { participantId, code, expiresAt },
  });

  return NextResponse.json({ code, expiresAt });
}

// DELETE — unlink Telegram
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: participantId } = await params;
  await prisma.telegramLink.delete({ where: { participantId } }).catch(() => null);
  await prisma.telegramLinkCode.delete({ where: { participantId } }).catch(() => null);

  return new NextResponse(null, { status: 204 });
}
