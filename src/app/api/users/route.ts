import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_users")
    .select("*, role:roles(*)")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const body = await request.json();
  const { id, role_id, is_active, name } = body;

  const { data, error } = await supabase
    .from("staff_users")
    .update({ role_id, is_active, name })
    .eq("id", id)
    .select("*, role:roles(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
