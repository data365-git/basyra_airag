import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const trainingId = searchParams.get("training_id");
  const search = searchParams.get("search");

  let query = supabase
    .from("participants")
    .select("*")
    .order("full_name");

  if (trainingId) {
    query = supabase
      .from("participants")
      .select("*, training_participants!inner(training_id)")
      .eq("training_participants.training_id", trainingId)
      .order("full_name");
  }

  if (search) {
    query = query.ilike("full_name", `%${search}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const body = await request.json();
  const { full_name, phone, email, training_ids } = body;

  const { data: participant, error } = await supabase
    .from("participants")
    .insert({ full_name, phone, email })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (training_ids?.length > 0) {
    await supabase.from("training_participants").insert(
      training_ids.map((tid: string) => ({
        training_id: tid,
        participant_id: participant.id,
      }))
    );
  }

  return NextResponse.json(participant, { status: 201 });
}
