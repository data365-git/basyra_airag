import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // Close session
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .update({ status: "closed" })
    .eq("id", id)
    .select("training_id")
    .single();

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });

  // Get enrolled participants
  const { data: enrolled } = await supabase
    .from("training_participants")
    .select("participant_id")
    .eq("training_id", session.training_id);

  // Get already-marked attendance
  const { data: existing } = await supabase
    .from("attendance")
    .select("participant_id")
    .eq("session_id", id);

  const existingIds = new Set(existing?.map((r) => r.participant_id) || []);
  const missingIds = (enrolled || [])
    .map((e) => e.participant_id)
    .filter((pid) => !existingIds.has(pid));

  // Mark absent
  if (missingIds.length > 0) {
    await supabase.from("attendance").insert(
      missingIds.map((participant_id) => ({
        session_id: id,
        participant_id,
        status: "absent",
      }))
    );
  }

  return NextResponse.json({ success: true, marked_absent: missingIds.length });
}
