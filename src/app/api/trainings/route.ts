import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateSessionDates } from "@/lib/utils";
import { format } from "date-fns";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trainings")
    .select("*, trainers:training_trainers(staff:staff_users(id,name,email))")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, description, color, icon, start_date, end_date, schedule_day, schedule_time, attendance_threshold, trainer_ids } = body;

  // Create training
  const { data: training, error } = await supabase
    .from("trainings")
    .insert({
      name, description, color: color || "#3B82F6", icon: icon || "book",
      start_date, end_date, schedule_day, schedule_time,
      attendance_threshold: attendance_threshold || 80,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Add trainers
  if (trainer_ids?.length > 0) {
    await supabase.from("training_trainers").insert(
      trainer_ids.map((id: string) => ({ training_id: training.id, staff_id: id }))
    );
  }

  // Generate sessions
  const sessionDates = generateSessionDates(start_date, end_date, schedule_day);
  if (sessionDates.length > 0) {
    await supabase.from("sessions").insert(
      sessionDates.map((date, i) => ({
        training_id: training.id,
        session_number: i + 1,
        session_date: format(date, "yyyy-MM-dd"),
        session_time: schedule_time,
        status: new Date() > date ? "closed" : "upcoming",
      }))
    );
  }

  return NextResponse.json(training, { status: 201 });
}
