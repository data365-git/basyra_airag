import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import { hashPassword } from "@/lib/auth";

// ─── Credential generation helpers ───────────────────────────────────────────

/** Convert "Dilnoza Yusupova" → "dilnoza.yusupova" (Latin, safe chars only) */
function nameToUsername(name: string): string {
  // Cyrillic → Latin transliteration map
  const MAP: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",й:"y",к:"k",
    л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",
    ч:"ch",ш:"sh",щ:"sh",ъ:"",ы:"i",ь:"",э:"e",ю:"yu",я:"ya",
    // Uzbek specifics
    ʻ:"",ʼ:"",ŏ:"o",ĝ:"g",
  };
  const transliterated = name
    .toLowerCase()
    .split("")
    .map((c) => MAP[c] ?? c)
    .join("");
  return transliterated
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .substring(0, 32) || "user";
}

function randomPassword(len = 8): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789"; // no confusable chars
  let pw = "";
  for (let i = 0; i < len; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  return pw;
}

async function generateUniqueUsername(base: string): Promise<string> {
  let username = base;
  let suffix   = 1;
  while (await prisma.participantAuth.findUnique({ where: { username } })) {
    username = `${base}${suffix++}`;
  }
  return username;
}

const CreateParticipantSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(200),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email("Invalid email").max(200).optional().nullable(),
  training_ids: z.array(z.string()).optional(),
});

export async function GET(request: Request) {
  try {
    const caller = await getFullUser();
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const trainingId = searchParams.get("training_id");
    const search = searchParams.get("search");

    const participants = await prisma.participant.findMany({
      where: {
        ...(trainingId
          ? { trainingParticipants: { some: { trainingId } } }
          : {}),
        ...(search
          ? { fullName: { contains: search, mode: "insensitive" } }
          : {}),
      },
      orderBy: { fullName: "asc" },
    });

    return NextResponse.json(
      participants.map((p) => ({
        id: p.id,
        full_name: p.fullName,
        phone: p.phone,
        email: p.email,
        photo_url: p.photoUrl,
        qr_token: p.qrToken,
        created_at: p.createdAt,
      }))
    );
  } catch (e) {
    console.error("participants GET error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "participants", "create"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = CreateParticipantSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { full_name, phone, email, training_ids } = parsed.data;

    // Duplicate phone check
    if (phone) {
      const existing = await prisma.participant.findFirst({ where: { phone } });
      if (existing) {
        return NextResponse.json(
          { error: "A participant with this phone number already exists", field: "phone" },
          { status: 409 }
        );
      }
    }

    // Duplicate email check
    if (email) {
      const existing = await prisma.participant.findFirst({ where: { email } });
      if (existing) {
        return NextResponse.json(
          { error: "A participant with this email already exists", field: "email" },
          { status: 409 }
        );
      }
    }

    // Auto-generate portal login credentials
    const rawPassword = randomPassword();
    const username    = await generateUniqueUsername(nameToUsername(full_name));
    const passwordHash = await hashPassword(rawPassword);

    const participant = await prisma.participant.create({
      data: {
        fullName: full_name,
        phone: phone || null,
        email: email || null,
        ...(training_ids?.length
          ? {
              trainingParticipants: {
                create: training_ids.map((tid: string) => ({ trainingId: tid })),
              },
            }
          : {}),
        auth: {
          create: { username, passwordHash },
        },
      },
      include: { auth: { select: { username: true } } },
    });

    // Return participant + plain-text password (shown once, then discarded)
    return NextResponse.json({
      id:          participant.id,
      full_name:   participant.fullName,
      phone:       participant.phone,
      email:       participant.email,
      qr_token:    participant.qrToken,
      created_at:  participant.createdAt,
      credentials: { username, password: rawPassword },
    }, { status: 201 });
  } catch (e) {
    console.error("participants POST error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
