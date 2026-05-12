"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, CheckCircle, XCircle, SkipForward } from "lucide-react";
import { PageHeader } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/providers/LanguageProvider";
import toast from "react-hot-toast";

interface CSVRow {
  full_name: string;
  phone?: string;
  email?: string;
  state: "pending" | "imported" | "skipped" | "error";
  reason?: string;
}

export default function ImportParticipantsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<CSVRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

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
        state: "pending" as const,
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
      setResult(null);
    };
    reader.readAsText(file);
  }

  async function importAll() {
    setImporting(true);

    const res = await fetch("/api/participants/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participants: rows.map((r) => ({
          full_name: r.full_name,
          phone: r.phone || null,
          email: r.email || null,
        })),
      }),
    });

    setImporting(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Import failed — no participants were saved");
      return;
    }

    const data: { created: number; skipped: number; skipped_rows: Array<{ full_name: string; phone?: string | null; reason: string }> } = await res.json();
    const skippedNames = new Set(data.skipped_rows.map((r) => r.full_name + "|" + (r.phone ?? "")));

    setRows((prev) =>
      prev.map((r) => {
        const key = r.full_name + "|" + (r.phone ?? "");
        if (skippedNames.has(key)) {
          const skipped = data.skipped_rows.find((s) => s.full_name === r.full_name && (s.phone ?? "") === (r.phone ?? ""));
          return { ...r, state: "skipped", reason: skipped?.reason };
        }
        return { ...r, state: "imported" };
      })
    );

    setResult({ created: data.created, skipped: data.skipped });
    toast.success(t("participants.import_success", { n: String(data.created) }));
  }

  function goToParticipants() {
    router.refresh();
    router.push("/participants");
  }

  return (
    <div>
      <PageHeader
        title={t("participants.import_title")}
        subtitle={t("participants.import_subtitle")}
        back
        backHref="/participants"
      />

      <Card className="mb-6 max-w-xl">
        <h3 className="font-semibold text-gray-900 mb-2">{t("participants.csv_format")}</h3>
        <p className="text-sm text-gray-500 mb-3">{t("participants.csv_columns_hint")}</p>
        <code className="block text-xs bg-gray-50 p-3 rounded-lg text-gray-700">
          full_name,phone,email<br />
          Dilnoza Yusupova,+998901234567,dilnoza@example.com<br />
          Bobur Karimov,+998901234568,
        </code>
        <p className="text-xs text-gray-400 mt-2">
          {t("participants.csv_duplicate_hint")}
        </p>
      </Card>

      <div className="flex gap-3 mb-6">
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload size={16} /> {t("participants.choose_file")}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFile}
        />
        {rows.length > 0 && !result && (
          <Button onClick={importAll} loading={importing}>
            {t("participants.import_n", { n: String(rows.length) })}
          </Button>
        )}
        {result && (
          <Button onClick={goToParticipants}>
            {t("participants.view_imported", { n: String(result.created) })}
          </Button>
        )}
      </div>

      {result && (
        <div className="mb-4 p-4 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800">
          ✅ <strong>{result.created}</strong> participant{result.created === 1 ? "" : "s"} imported successfully.
          {result.skipped > 0 && (
            <> <strong>{result.skipped}</strong> skipped (duplicate phone).</>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600 font-medium">{t("participants.rows_found", { n: String(rows.length) })}</p>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0">
                {row.state === "imported" && <CheckCircle size={16} className="text-green-500 shrink-0" />}
                {row.state === "error"    && <XCircle size={16} className="text-red-500 shrink-0" />}
                {row.state === "skipped"  && <SkipForward size={16} className="text-yellow-500 shrink-0" />}
                {row.state === "pending"  && <div className="w-4 h-4 rounded-full bg-gray-200 shrink-0" />}
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{row.full_name}</p>
                  <p className="text-xs text-gray-500">{row.phone} {row.email}</p>
                </div>
                {row.state === "skipped" && (
                  <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">{row.reason}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
