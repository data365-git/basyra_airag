"use client";

import { useEffect, useRef, useState } from "react";

// ---- Types ----

interface ConvUser {
  chat_id: string;
  participant_id: string | null;
  full_name: string | null;
  phone: string | null;
  message_count: number;
  last_message_at: string | null;
  intent: string | null;
  routed_to: string | null;
  token_count: number;
  usage_cost_usd: number;
  avg_response_time_ms: number | null;
  rating: { stars: number; status: string } | null;
}

interface BotMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  intent: string | null;
  routed_to: string | null;
  token_count: number | null;
  usage: {
    tokens_in: number;
    tokens_out: number;
    cost_usd: number;
    response_time_ms: number | null;
  } | null;
  diagnostics: {
    reply_context_used: boolean | null;
    reply_to_message_id: string | null;
    telegram_message_id: number | null;
    delivery_type: string | null;
    finish_reason: string | null;
    continuation_count: number | null;
    answer_char_count: number | null;
    timing_ms: number | null;
  } | null;
  rating: { stars: number; reason: string | null; status: string } | null;
}

interface Thread {
  messages: BotMessage[];
  participant: { id: string; full_name: string } | null;
}

// ---- Helpers ----

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Hozir";
  if (mins < 60) return `${mins} daq. oldin`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} soat oldin`;
  const days = Math.floor(hrs / 24);
  return `${days} kun oldin`;
}

function displayName(u: ConvUser): string {
  return u.full_name ?? `Anonymous #${u.chat_id.slice(-6)}`;
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtUsd(n: number): string {
  if (n <= 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function fmtMs(n: number | null): string {
  if (n == null) return "";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${n}ms`;
}

function diagnosticItems(msg: BotMessage): string[] {
  const d = msg.diagnostics;
  if (!d) return [];

  return [
    d.reply_context_used != null
      ? `reply ctx: ${d.reply_context_used ? "yes" : "no"}`
      : null,
    d.reply_to_message_id ? `reply_to: ${d.reply_to_message_id}` : null,
    d.telegram_message_id != null ? `tg msg: ${d.telegram_message_id}` : null,
    d.delivery_type ? `delivery: ${d.delivery_type}` : null,
    d.finish_reason ? `finish: ${d.finish_reason}` : null,
    d.continuation_count != null ? `cont: ${d.continuation_count}` : null,
    d.answer_char_count != null ? `${fmtCompact(d.answer_char_count)} chars` : null,
    d.timing_ms != null ? `timing: ${fmtMs(d.timing_ms)}` : null,
  ].filter((item): item is string => Boolean(item));
}

// ---- Skeleton components ----

function UserRowSkeleton() {
  return (
    <div className="px-3 py-3 flex flex-col gap-1 animate-pulse">
      <div className="h-3.5 bg-gray-200 rounded w-3/4" />
      <div className="h-2.5 bg-gray-100 rounded w-1/2" />
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="flex-1 p-4 space-y-3 overflow-y-auto animate-pulse">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`h-8 rounded-2xl ${
              i % 2 === 0 ? "bg-indigo-100 w-2/3" : "bg-gray-200 w-1/2"
            }`}
          />
        </div>
      ))}
    </div>
  );
}

// ---- User list item ----

function UserRow({
  user,
  selected,
  onClick,
}: {
  user: ConvUser;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
        selected ? "bg-indigo-50 border-l-2 border-l-indigo-500" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-800 truncate">
          {displayName(user)}
        </p>
        <span className="shrink-0 text-xs bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5">
          {user.message_count}
        </span>
      </div>
      <p className="text-xs text-gray-400 mt-0.5">
        {relativeTime(user.last_message_at)}
        {user.phone ? ` · ${user.phone}` : ""}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-gray-400">
        {user.intent && (
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5">{user.intent}</span>
        )}
        {user.routed_to && (
          <span className="rounded-full bg-blue-50 text-blue-600 px-1.5 py-0.5">
            {user.routed_to}
          </span>
        )}
        {user.token_count > 0 && <span>{fmtCompact(user.token_count)} tok</span>}
        {user.usage_cost_usd > 0 && <span>{fmtUsd(user.usage_cost_usd)}</span>}
        {user.avg_response_time_ms != null && <span>{fmtMs(user.avg_response_time_ms)}</span>}
        {user.rating && <span>{user.rating.stars}★ {user.rating.status}</span>}
      </div>
    </button>
  );
}

// ---- Message bubble ----

function Bubble({ msg }: { msg: BotMessage }) {
  const isUser = msg.role === "user";
  const usageTokens = msg.usage ? msg.usage.tokens_in + msg.usage.tokens_out : 0;
  const meta = [
    msg.intent,
    msg.routed_to,
    msg.token_count ? `${fmtCompact(msg.token_count)} tok` : null,
    usageTokens > 0 ? `${fmtCompact(usageTokens)} usage tok` : null,
    msg.usage && msg.usage.cost_usd > 0 ? fmtUsd(msg.usage.cost_usd) : null,
    msg.usage?.response_time_ms != null ? fmtMs(msg.usage.response_time_ms) : null,
    msg.rating ? `${msg.rating.stars}★ ${msg.rating.status}` : null,
  ].filter(Boolean);
  const diagnostics = diagnosticItems(msg);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-2`}>
      <div
        className={`relative max-w-[72%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-indigo-600 text-white rounded-br-sm"
            : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm"
        }`}
      >
        {msg.content}
        {meta.length > 0 && (
          <div
            className={`mt-2 flex flex-wrap gap-1 text-[11px] leading-none ${
              isUser ? "text-indigo-100" : "text-gray-400"
            }`}
          >
            {meta.map((item) => (
              <span
                key={item}
                className={`rounded-full px-1.5 py-1 ${
                  isUser ? "bg-indigo-500/60" : "bg-gray-100"
                }`}
              >
                {item}
              </span>
            ))}
          </div>
        )}
        {diagnostics.length > 0 && (
          <div
            className={`mt-2 flex flex-wrap gap-1 text-[10px] leading-none ${
              isUser ? "text-indigo-50" : "text-slate-500"
            }`}
          >
            {diagnostics.map((item) => (
              <span
                key={item}
                className={`rounded-md border px-1.5 py-1 ${
                  isUser
                    ? "border-indigo-300/60 bg-indigo-700/30"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                {item}
              </span>
            ))}
          </div>
        )}
        {msg.rating && (
          <span
            className={`absolute -bottom-2 ${
              isUser ? "right-2" : "left-2"
            } text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-1.5 py-0.5 leading-none`}
          >
            {"★".repeat(msg.rating.stars)}
          </span>
        )}
      </div>
    </div>
  );
}

// ---- Main page ----

export default function ChatbotConversationsPage() {
  const [users, setUsers] = useState<ConvUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setLoadingUsers(true);
      const params = new URLSearchParams({ limit: "30", offset: "0" });
      if (search) params.set("search", search);
      fetch(`/api/chatbot/conversations?${params}`)
        .then((r) => r.json())
        .then((data) => {
          setUsers(data.users ?? []);
          setTotal(data.total ?? 0);
        })
        .finally(() => setLoadingUsers(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Load thread when selection changes
  useEffect(() => {
    if (!selectedChatId) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoadingThread(true);
      setThread(null);
      fetch(`/api/chatbot/conversations/${selectedChatId}`)
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled) setThread(data);
        })
        .finally(() => {
          if (!cancelled) setLoadingThread(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedChatId]);

  // Scroll to bottom when thread loads
  useEffect(() => {
    if (thread) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [thread]);

  const selectedUser = users.find((u) => u.chat_id === selectedChatId);

  return (
    <div className="p-6 max-w-[1400px] mx-auto h-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Suhbatlar</h1>
        <span className="text-sm text-gray-400">{total} ta foydalanuvchi</span>
      </div>

      <div className="flex gap-4 h-[calc(100vh-160px)]">
        {/* Left column: user list */}
        <div className="w-72 shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b border-gray-100">
            <input
              type="text"
              placeholder="Qidirish..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
            />
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loadingUsers ? (
              <>
                {[...Array(8)].map((_, i) => (
                  <UserRowSkeleton key={i} />
                ))}
              </>
            ) : users.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">
                Foydalanuvchilar topilmadi
              </p>
            ) : (
              users.map((u) => (
                <UserRow
                  key={u.chat_id}
                  user={u}
                  selected={u.chat_id === selectedChatId}
                  onClick={() => setSelectedChatId(u.chat_id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right column: thread */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
          {selectedChatId ? (
            <>
              {/* Thread header */}
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm shrink-0">
                  {(thread?.participant?.full_name ?? selectedUser?.full_name ?? "?")
                    .charAt(0)
                    .toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    {thread?.participant?.full_name ??
                      selectedUser?.full_name ??
                      `Anonymous #${selectedChatId.slice(-6)}`}
                  </p>
                  <p className="text-xs text-gray-400">
                    Chat ID: {selectedChatId}
                    {selectedUser?.phone ? ` · ${selectedUser.phone}` : ""}
                  </p>
                </div>
              </div>

              {/* Messages */}
              {loadingThread ? (
                <ThreadSkeleton />
              ) : (
                <div className="flex-1 overflow-y-auto px-5 py-4 bg-gray-50">
                  {thread?.messages.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-8">
                      Xabarlar yo&apos;q
                    </p>
                  )}
                  {thread?.messages.map((msg) => (
                    <Bubble key={msg.id} msg={msg} />
                  ))}
                  <div ref={bottomRef} />
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <svg
                    className="w-7 h-7 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
                    />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-500">
                  Foydalanuvchini tanlang
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Suhbat tarixini ko&apos;rish uchun chapdan tanlang
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
