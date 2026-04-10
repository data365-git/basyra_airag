import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import JSZip from "jszip";
import { generateQRBuffer } from "@/lib/qr/generate";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const trainingId = searchParams.get("training_id");

  if (!trainingId) return NextResponse.json({ error: "training_id required" }, { status: 400 });

  const { data: participants } = await supabase
    .from("participants")
    .select("id, full_name, qr_token, training_participants!inner(training_id)")
    .eq("training_participants.training_id", trainingId)
    .order("full_name");

  if (!participants?.length) {
    return NextResponse.json({ error: "No participants" }, { status: 404 });
  }

  const zip = new JSZip();
  const folder = zip.folder("qr-codes");

  await Promise.all(
    participants.map(async (p) => {
      const buffer = await generateQRBuffer(p.qr_token);
      const filename = `${p.full_name.replace(/\s+/g, "_")}.png`;
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
