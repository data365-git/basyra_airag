import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import * as XLSX from "xlsx";
import { formatDate } from "@/lib/utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const trainingId = searchParams.get("training_id");

  if (!trainingId) return NextResponse.json({ error: "training_id required" }, { status: 400 });

  const [training, sessions, participants, records] = await Promise.all([
    prisma.training.findUnique({ where: { id: trainingId }, select: { name: true } }),
    prisma.session.findMany({ where: { trainingId }, orderBy: { sessionNumber: "asc" } }),
    prisma.participant.findMany({
      where: { trainingParticipants: { some: { trainingId } } },
      orderBy: { fullName: "asc" },
    }),
    prisma.attendance.findMany({
      where: { session: { trainingId } },
    }),
  ]);

  if (!training || !sessions || !participants) {
    return NextResponse.json({ error: "Data not found" }, { status: 404 });
  }

  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = participants.map((p) => {
    const pRecords = records.filter((r) => r.participantId === p.id);
    const present = pRecords.filter((r) => r.status === "present").length;
    const late = pRecords.filter((r) => r.status === "late").length;
    const excused = pRecords.filter((r) => r.status === "excused").length;
    const absent = pRecords.filter((r) => r.status === "absent").length;
    const total = sessions.length;
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return {
      Name: p.fullName,
      Phone: p.phone || "",
      Present: present,
      Late: late,
      Excused: excused,
      Absent: absent,
      "Total Sessions": total,
      Rate: `${rate}%`,
    };
  });

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "Summary");

  // Detail sheet
  const headers = [
    "Name",
    ...sessions.map((s) => `S${s.sessionNumber} (${formatDate(s.sessionDate.toISOString().slice(0, 10), "MM/dd")})`),
    "Rate",
  ];
  const detailData = participants.map((p) => {
    const row: Record<string, string> = { Name: p.fullName };
    let attended = 0;
    sessions.forEach((s) => {
      const rec = records.find((r) => r.sessionId === s.id && r.participantId === p.id);
      const status = rec?.status || "—";
      row[`S${s.sessionNumber} (${formatDate(s.sessionDate.toISOString().slice(0, 10), "MM/dd")})`] = status;
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
