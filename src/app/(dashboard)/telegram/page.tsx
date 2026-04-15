"use client";

import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import Link from "next/link";
import {
  Send, Loader2, Users, CheckCircle2,
  MessageCircle, ArrowDownToLine, File, Image, Mic,
} from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { ConfirmModal } from "@/components/ui/Modal";
import toast from "react-hot-toast";

interface LinkedParticipant {
  id:         string;
  full_name:  string;
  username:   string | null;
  first_name: string | null;
  linked_at:  string;
  trainings:  string[];
}

interface TelegramMsg {
  id:            string;
  direction:     "in" | "out";
  text:          string | null;
  messageType:   string;
  telegramFileId: string | null;
  fileName:      string | null;
  fileSizeBytes: number | null;
  created_at:    string;
}

function MessageBubble({ msg }: { msg: TelegramMsg }) {
  const isOut = msg.direction === "out";
  const time  = new Date(msg.created_at).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });

  const icon =
    msg.messageType === "photo"    ? <Image  size={14} className="shrink-0 text-blue-400" /> :
    msg.messageType === "document" ? <File   size={14} className="shrink-0 text-blue-400" /> :
    msg.messageType === "voice"    ? <Mic    size={14} className="shrink-0 text-blue-400" /> :
    msg.messageType === "audio"    ? <Mic    size={14} className="shrink-0 text-blue-400" /> :
    msg.messageType === "video"    ? <ArrowDownToLine size={14} className="shrink-0 text-blue-400" /> :
    null;

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
          isOut
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-gray-100 text-gray-900 rounded-bl-sm"
        }`}
      >
        {icon && (
          <div className="flex items-center gap-1.5 mb-1">
            {icon}
            <span className={`text-xs font-medium ${isOut ? "text-blue-200" : "text-gray-500"}`}>
              {msg.fileName ?? msg.messageType}
              {msg.fileSizeBytes ? ` · ${Math.round(msg.fileSizeBytes / 1024)} KB` : ""}
            </span>
          </div>
        )}
        {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
        <p className={`text-[10px] mt-1 ${isOut ? "text-blue-200 text-right" : "text-gray-400"}`}>{time}</p>
      </div>
    </div>
  );
}

export default function TelegramAdminPage() {
  const canManage = usePermission("participants", "edit");

  const [list,         setList]         = useState<LinkedParticipant[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [message,      setMessage]      = useState("");
  const [sending,         setSending]         = useState(false);
  const [selected,        setSelected]        = useState<Set<string>>(new Set());
  const [broadcastConfirm, setBroadcastConfirm] = useState(false);

  // Conversation panel
  const [activeId,     setActiveId]     = useState<string | null>(null);
  const [msgs,         setMsgs]         = useState<TelegramMsg[]>([]);
  const [msgsLoading,  setMsgsLoading]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/telegram/linked");
    if (res.ok) setList(await res.json());
    setLoading(false);
  }

  async function openConversation(id: string) {
    setActiveId(id);
    setMsgsLoading(true);
    const res = await fetch(`/api/telegram/messages?participantId=${id}&limit=100`);
    if (res.ok) {
      setMsgs(await res.json());
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
    setMsgsLoading(false);
  }

  async function sendBroadcast() {
    if (!message.trim()) return;
    const targetIds = selected.size > 0 ? [...selected] : list.map((p) => p.id);
    if (targetIds.length === 0) return;

    // Require confirmation when sending to all unselected recipients (> 5)
    if (selected.size === 0 && list.length > 5) {
      setBroadcastConfirm(true);
      return;
    }

    await doSend(targetIds);
  }

  async function doSend(targetIds: string[]) {
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
  const activePerson = list.find((p) => p.id === activeId);

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
            {list.length > 0 && (
              <button
                onClick={() => setSelected(allSelected ? new Set() : new Set(list.map((p) => p.id)))}
                className="text-xs text-blue-600 hover:underline"
              >
                {allSelected ? "Barchasini olib tashlash" : "Barchasini tanlash"}
              </button>
            )}
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

      {/* Two-panel: participants list + conversation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: participants */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users size={16} className="text-gray-500" /> Ishtirokchilar
            </CardTitle>
          </CardHeader>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={24} className="animate-spin text-gray-300" />
            </div>
          ) : list.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">
              Hali hech kim Telegram&apos;ni ulamagan
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
              {list.map((p) => (
                <div
                  key={p.id}
                  onClick={() => openConversation(p.id)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                    activeId === p.id ? "bg-blue-50" : "hover:bg-gray-50"
                  }`}
                >
                  {canManage && (
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-gray-300"
                    />
                  )}
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-blue-600">
                      {p.full_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{p.full_name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {p.username ? `@${p.username}` : p.first_name ?? "—"}
                      {p.trainings.length > 0 && ` · ${p.trainings[0]}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <MessageCircle size={14} className="text-blue-400" />
                    <span className="text-xs text-gray-400">
                      {new Date(p.linked_at).toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit" })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Right: conversation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle size={16} className="text-gray-500" />
              {activePerson ? activePerson.full_name : "Suhbatni tanlang"}
            </CardTitle>
            {activePerson && (
              <Link href={`/participants/${activePerson.id}`} className="text-xs text-blue-600 hover:underline">
                Profil
              </Link>
            )}
          </CardHeader>

          <div className="h-[55vh] overflow-y-auto px-4 py-3 space-y-2 bg-gray-50 rounded-b-xl">
            {!activeId ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                Chap tarafdan ishtirokchini tanlang
              </div>
            ) : msgsLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 size={24} className="animate-spin text-gray-300" />
              </div>
            ) : msgs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                Xabarlar yo&apos;q
              </div>
            ) : (
              <>
                {msgs.map((m) => <MessageBubble key={m.id} msg={m} />)}
                <div ref={bottomRef} />
              </>
            )}
          </div>
        </Card>
      </div>

      <ConfirmModal
        open={broadcastConfirm}
        onClose={() => setBroadcastConfirm(false)}
        onConfirm={() => {
          setBroadcastConfirm(false);
          doSend(list.map((p) => p.id));
        }}
        danger
        title="Ommaviy xabar yuborish"
        message={`Barcha ${list.length} ta ishtirokchiga xabar yuboriladi. Tasdiqlaysizmi?`}
        confirmLabel="Yuborish"
      />
    </div>
  );
}
