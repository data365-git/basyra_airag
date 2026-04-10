import * as XLSX from "xlsx";
import type { AttendanceRecord, Participant, Session } from "@/types";
import { formatDate } from "@/lib/utils";

export function exportAttendanceToExcel(
  trainingName: string,
  sessions: Session[],
  participants: Participant[],
  records: AttendanceRecord[]
) {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = participants.map((p) => {
    const pRecords = records.filter((r) => r.participant_id === p.id);
    const present = pRecords.filter((r) => r.status === "present").length;
    const late = pRecords.filter((r) => r.status === "late").length;
    const excused = pRecords.filter((r) => r.status === "excused").length;
    const absent = pRecords.filter((r) => r.status === "absent").length;
    const total = sessions.length;
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    return {
      Name: p.full_name,
      Phone: p.phone || "",
      Email: p.email || "",
      "Total Sessions": total,
      Present: present,
      Late: late,
      Excused: excused,
      Absent: absent,
      "Attendance Rate": `${rate}%`,
    };
  });

  const summarySheet = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  // Per-session detail sheet
  const detailHeaders = ["Name", ...sessions.map((s) => `Session ${s.session_number} (${formatDate(s.session_date, "MM/dd")})`), "Rate"];
  const detailData = participants.map((p) => {
    const row: Record<string, string> = { Name: p.full_name };
    let attended = 0;
    sessions.forEach((s) => {
      const rec = records.find((r) => r.session_id === s.id && r.participant_id === p.id);
      const status = rec?.status || "—";
      row[`Session ${s.session_number} (${formatDate(s.session_date, "MM/dd")})`] = status;
      if (status === "present" || status === "late") attended++;
    });
    row["Rate"] = sessions.length > 0 ? `${Math.round((attended / sessions.length) * 100)}%` : "0%";
    return row;
  });

  const detailSheet = XLSX.utils.json_to_sheet(detailData, { header: detailHeaders });
  XLSX.utils.book_append_sheet(wb, detailSheet, "Attendance Detail");

  XLSX.writeFile(wb, `${trainingName.replace(/\s+/g, "_")}_attendance.xlsx`);
}

export function exportParticipantsToExcel(participants: Participant[]) {
  const data = participants.map((p) => ({
    Name: p.full_name,
    Phone: p.phone || "",
    Email: p.email || "",
    "QR Token": p.qr_token,
    Registered: formatDate(p.created_at),
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Participants");
  XLSX.writeFile(wb, "participants.xlsx");
}
