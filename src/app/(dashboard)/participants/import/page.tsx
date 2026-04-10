"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, CheckCircle, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import toast from "react-hot-toast";

interface CSVRow {
  full_name: string;
  phone?: string;
  email?: string;
  status?: "pending" | "success" | "error";
  error?: string;
}

export default function ImportParticipantsPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<CSVRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  function parseCSV(text: string): CSVRow[] {
    const lines = text.trim().split("\n");
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));

    return lines.slice(1).map((line) => {
      const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] || ""; });

      return {
        full_name: row.full_name || row.name || "",
        phone: row.phone || row.phone_number || "",
        email: row.email || "",
        status: "pending" as const,
      };
    }).filter((r) => r.full_name);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target?.result as string);
      setRows(parsed);
      setDone(false);
    };
    reader.readAsText(file);
  }

  async function importAll() {
    setImporting(true);
    const updated = [...rows];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.full_name) continue;

      const res = await fetch("/api/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: row.full_name, phone: row.phone, email: row.email }),
      });

      updated[i] = { ...updated[i], status: res.ok ? "success" : "error", error: res.ok ? undefined : "Failed" };
      setRows([...updated]);
    }

    setImporting(false);
    setDone(true);
    const successful = updated.filter((r) => r.status === "success").length;
    toast.success(`Imported ${successful} participants`);
  }

  return (
    <div>
      <PageHeader title="Import Participants" subtitle="Bulk import from CSV file" back backHref="/participants" />

      <Card className="mb-6 max-w-xl">
        <h3 className="font-semibold text-gray-900 mb-2">CSV Format</h3>
        <p className="text-sm text-gray-500 mb-3">Your CSV file should have these columns (first row = headers):</p>
        <code className="block text-xs bg-gray-50 p-3 rounded-lg text-gray-700">
          full_name,phone,email<br />
          Dilnoza Yusupova,+998901234567,dilnoza@example.com<br />
          Bobur Karimov,+998901234568,
        </code>
      </Card>

      <div className="flex gap-3 mb-6">
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload size={16} /> Choose CSV File
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFile}
        />
        {rows.length > 0 && !done && (
          <Button onClick={importAll} loading={importing}>
            Import {rows.length} Participants
          </Button>
        )}
        {done && (
          <Button variant="outline" onClick={() => router.push("/participants")}>
            View Participants
          </Button>
        )}
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600 font-medium">{rows.length} rows found</p>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0">
                {row.status === "success" && <CheckCircle size={16} className="text-green-500 shrink-0" />}
                {row.status === "error" && <XCircle size={16} className="text-red-500 shrink-0" />}
                {row.status === "pending" && <div className="w-4 h-4 rounded-full bg-gray-200 shrink-0" />}
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{row.full_name}</p>
                  <p className="text-xs text-gray-500">{row.phone} {row.email}</p>
                </div>
                {row.error && <p className="text-xs text-red-500">{row.error}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
