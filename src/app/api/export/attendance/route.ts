import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";
import { formatDate } from "@/lib/utils";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const trainingId = searchParams.get("training_id");

  if (!trainingId) return NextResponse.json({ error: "training_id required" }, { status: 400 });

  const [{ data: training }, { data: sessions }, { data: participants }, { data: records }] = await Promise.all([
    supabase.from("trainings").select("name").eq("id", trainingId).single(),
    supabase.from("sessions").select("*").eq("training_id", trainingId).order("session_number"),
    supabase.from("participants")
      .select("*, training_participants!inner(training_id)")
      .eq("training_participants.training_id", trainingId)
      .order("full_name"),
    supabase.from("attendance")
      .select("*")
      .in("session_id", (await supabase.from("sessions").select("id").eq("training_id", trainingId)).data?.map(s => s.id) || []),
  ]);

  if (!training || !sessions || !participants) {
    return NextResponse.json({ error: "Data not found" }, { status: 404 });
  }

  const wb = XLSX.utils.book_new();

  // Summary
  const summaryData = (participants || []).map((p) => {
    const pRecords = (records || []).filter((r) => r.participant_id === p.id);
    const present = pRecords.filter((r) => r.status === "present").length;
    const late = pRecords.filter((r) => r.status === "late").length;
    const excused = pRecords.filter((r) => r.status === "excused").length;
    const absent = pRecords.filter((r) => r.status === "absent").length;
    const total = sessions.length;
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { Name: p.full_name, Phone: p.phone || "", Present: present, Late: late, Excused: excused, Absent: absent, "Total Sessions": total, "Rate": `${rate}%` };
  });

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "Summary");

  // Detail
  const headers = ["Name", ...sessions.map(s => `S${s.session_number} (${formatDate(s.session_date, "MM/dd")})`), "Rate"];
  const detailData = (participants || []).map((p) => {
    const row: Record<string, string> = { Name: p.full_name };
    let attended = 0;
    sessions.forEach((s) => {
      const rec = (records || []).find(r => r.session_id === s.id && r.participant_id === p.id);
      const status = rec?.status || "—";
      row[`S${s.session_number} (${formatDate(s.session_date, "MM/dd")})`] = status;
      if (status === "present" || status === "late") attended++;
    });
    row["Rate"] = `${sessions.length > 0 ? Math.round((attended / sessions.length) * 100) : 0}%`;
    return row;
  });

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailData, { header: headers }), "Detail");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${training.name.replace(/\s+/g, "_")}_attendance.xlsx"`,
    },
  });
}
