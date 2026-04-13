"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "@/components/ui/Table";
import Link from "next/link";
import { Send, Loader2, Users, CheckCircle2 } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import toast from "react-hot-toast";

interface LinkedParticipant {
  id:         string;
  full_name:  string;
  username:   string | null;
  first_name: string | null;
  linked_at:  string;
  trainings:  string[];
}

export default function TelegramAdminPage() {
  const canManage = usePermission("participants", "edit");

  const [list,      setList]      = useState<LinkedParticipant[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [message,   setMessage]   = useState("");
  const [sending,   setSending]   = useState(false);
  const [selected,  setSelected]  = useState<Set<string>>(new Set());

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/telegram/linked");
    if (res.ok) setList(await res.json());
    setLoading(false);
  }

  async function sendBroadcast() {
    if (!message.trim()) return;
    const targetIds = selected.size > 0 ? [...selected] : list.map((p) => p.id);
    if (targetIds.length === 0) return;

    setSending(true);
    const res = await fetch("/api/telegram/broadcast", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ participantIds: targetIds, message: message.trim() }),
    });
    setSending(false);
    if (res.ok) {
      const data = await res.json();
      toast.success(`${data.sent} ta xabar yuborildi`);
      setMessage("");
      setSelected(new Set());
    } else {
      toast.error("Xato yuz berdi");
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const allSelected = selected.size === list.length && list.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Telegram"
        subtitle={`${list.length} ishtirokchi ulangan`}
      />

      {/* Broadcast card */}
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send size={16} className="text-blue-500" /> Xabar yuborish
            </CardTitle>
          </CardHeader>
          <div className="space-y-3">
            {selected.size > 0 && (
              <p className="text-sm text-blue-600 font-medium">
                {selected.size} ta ishtirokchi tanlangan
              </p>
            )}
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Xabar matni..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">
                {selected.size === 0 ? `Barcha ${list.length} ta` : `${selected.size} ta tanlangan`} ga yuboriladi
              </p>
              <button
                onClick={sendBroadcast}
                disabled={sending || !message.trim() || list.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Yuborish
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Linked participants */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users size={16} className="text-gray-500" /> Ulangan ishtirokchilar
          </CardTitle>
          {list.length > 0 && canManage && (
            <button
              onClick={() => setSelected(allSelected ? new Set() : new Set(list.map((p) => p.id)))}
              className="text-xs text-blue-600 hover:underline"
            >
              {allSelected ? "Barchasini olib tashlash" : "Barchasini tanlash"}
            </button>
          )}
        </CardHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="animate-spin text-gray-300" />
          </div>
        ) : (
          <Table>
            <Thead>
              <tr>
                {canManage && <Th></Th>}
                <Th>Ishtirokchi</Th>
                <Th>Telegram</Th>
                <Th>Kurslar</Th>
                <Th>Ulangan</Th>
                <Th></Th>
              </tr>
            </Thead>
            <Tbody>
              {list.length === 0 ? (
                <EmptyRow cols={canManage ? 6 : 5} message="Hali hech kim Telegram'ni ulamagan" />
              ) : list.map((p) => (
                <Tr key={p.id} onClick={() => canManage && toggleSelect(p.id)}>
                  {canManage && (
                    <Td>
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-gray-300"
                      />
                    </Td>
                  )}
                  <Td className="font-medium text-gray-900">{p.full_name}</Td>
                  <Td className="text-gray-500 text-sm">
                    <div>
                      {p.first_name && <span>{p.first_name} </span>}
                      {p.username && <span className="text-blue-600">@{p.username}</span>}
                    </div>
                  </Td>
                  <Td className="text-xs text-gray-500">
                    {p.trainings.join(", ") || "—"}
                  </Td>
                  <Td className="text-xs text-gray-400 whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 size={12} className="text-green-500" />
                      {new Date(p.linked_at).toLocaleDateString("uz-UZ")}
                    </span>
                  </Td>
                  <Td>
                    <Link
                      href={`/participants/${p.id}`}
                      className="text-xs text-blue-600 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Profil
                    </Link>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
