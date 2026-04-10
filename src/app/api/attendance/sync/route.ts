import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { PendingScan } from "@/types";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { scans }: { scans: PendingScan[] } = await request.json();
  if (!scans?.length) return NextResponse.json({ synced: 0 });

  let synced = 0;
  const errors: string[] = [];

  for (const scan of scans) {
    try {
      // Look up participant
      const { data: participant } = await supabase
        .from("participants")
        .select("id")
        .eq("qr_token", scan.qrToken)
        .single();

      if (!participant) continue;

      // Get session
      const { data: session } = await supabase
        .from("sessions")
        .select("training_id")
        .eq("id", scan.sessionId)
        .single();

      if (!session) continue;

      // Check enrollment
      const { data: enrollment } = await supabase
        .from("training_participants")
        .select("participant_id")
        .eq("training_id", session.training_id)
        .eq("participant_id", participant.id)
        .single();

      if (!enrollment) continue;

      // Upsert attendance (offline scans may have been after close)
      const { error } = await supabase.from("attendance").upsert(
        {
          session_id: scan.sessionId,
          participant_id: participant.id,
          status: "present",
          scanned_at: scan.scannedAt,
          scanned_by: user.id,
          synced_from_offline: true,
        },
        { onConflict: "session_id,participant_id", ignoreDuplicates: true }
      );

      if (!error) synced++;
    } catch (e) {
      errors.push(String(e));
    }
  }

  return NextResponse.json({ synced, errors });
}
