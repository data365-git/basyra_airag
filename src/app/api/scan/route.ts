import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token, sessionId } = await request.json();

  if (!token || !sessionId) {
    return NextResponse.json({ type: "unknown", message: "Missing token or session" }, { status: 400 });
  }

  // Look up participant by QR token
  const { data: participant } = await supabase
    .from("participants")
    .select("*")
    .eq("qr_token", token)
    .single();

  if (!participant) {
    return NextResponse.json({ type: "unknown", message: "QR not recognized" });
  }

  // Get session + training info
  const { data: session } = await supabase
    .from("sessions")
    .select("*, training:trainings(id)")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ type: "unknown", message: "Session not found" });
  }

  if (session.status === "closed") {
    return NextResponse.json({ type: "session_closed", message: "Session is closed", participant });
  }

  // Check enrollment
  const { data: enrollment } = await supabase
    .from("training_participants")
    .select("participant_id")
    .eq("training_id", session.training.id)
    .eq("participant_id", participant.id)
    .single();

  if (!enrollment) {
    return NextResponse.json({ type: "not_enrolled", message: "Not enrolled in this training", participant });
  }

  // Check if already scanned
  const { data: existing } = await supabase
    .from("attendance")
    .select("id, status")
    .eq("session_id", sessionId)
    .eq("participant_id", participant.id)
    .single();

  if (existing) {
    return NextResponse.json({ type: "already_scanned", message: "Already marked present", participant });
  }

  // Mark present
  await supabase.from("attendance").insert({
    session_id: sessionId,
    participant_id: participant.id,
    status: "present",
    scanned_at: new Date().toISOString(),
    scanned_by: user.id,
  });

  return NextResponse.json({ type: "success", message: "Marked present", participant });
}
