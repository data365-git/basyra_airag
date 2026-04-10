"use client";

import { useEffect, useState } from "react";
import { Plus, Search, Upload, Download } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "@/components/ui/Table";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { usePermission } from "@/hooks/usePermission";
import { useTranslation } from "@/providers/LanguageProvider";
import { downloadQR } from "@/lib/qr/generate";
import type { Participant } from "@/types";

export default function ParticipantsPage() {
  const router = useRouter();
  const canManage = usePermission("participants", "create");
  const { t } = useTranslation();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/participants")
      .then((r) => r.json())
      .then((data) => {
        setParticipants(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, []);

  const filtered = participants.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.phone?.includes(search) ||
    p.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("participants.title")}</h1>
          <p className="text-gray-500 text-sm mt-1">{participants.length} registered</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Link href="/participants/import">
              <Button variant="outline" size="sm"><Upload size={14} /> {t("participants.import_csv")}</Button>
            </Link>
            <Link href="/participants/new">
              <Button size="sm"><Plus size={14} /> {t("common.add")}</Button>
            </Link>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("participants.search_placeholder")}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={10} cols={5} />
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>{t("common.name")}</Th>
              <Th>{t("common.phone")}</Th>
              <Th>{t("common.email")}</Th>
              <Th>{t("participants.registered_col")}</Th>
              <Th>{t("participants.qr_col")}</Th>
            </tr>
          </Thead>
          <Tbody>
            {filtered.length === 0 ? (
              <EmptyRow cols={5} message={t("participants.no_participants")} />
            ) : filtered.map((p) => (
              <Tr key={p.id} onClick={() => router.push(`/participants/${p.id}`)}>
                <Td className="font-medium text-gray-900">{p.full_name}</Td>
                <Td className="text-gray-500">{p.phone || "—"}</Td>
                <Td className="text-gray-500">{p.email || "—"}</Td>
                <Td className="text-gray-500 text-xs">{new Date(p.created_at).toLocaleDateString()}</Td>
                <Td>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); downloadQR(p.qr_token, p.full_name); }}
                  >
                    <Download size={14} />
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
