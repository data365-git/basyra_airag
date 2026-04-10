import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import JSZip from "jszip";
import { generateQRBuffer } from "@/lib/qr/generate";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const trainingId = searchParams.get("training_id");

  if (!trainingId) return NextResponse.json({ error: "training_id required" }, { status: 400 });

  const participants = await prisma.participant.findMany({
    where: { trainingParticipants: { some: { trainingId } } },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, qrToken: true },
  });

  if (!participants.length) {
    return NextResponse.json({ error: "No participants" }, { status: 404 });
  }

  const zip = new JSZip();
  const folder = zip.folder("qr-codes");

  await Promise.all(
    participants.map(async (p) => {
      const buffer = await generateQRBuffer(p.qrToken);
      const filename = `${p.fullName.replace(/\s+/g, "_")}.png`;
      folder!.file(filename, buffer);
    })
  );

  const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="qr_codes.zip"`,
    },
  });
}
