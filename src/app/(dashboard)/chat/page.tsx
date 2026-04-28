"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, FileText, MessageCircle, Search, Send, UserCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/Header";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

type ChatFilter = "all" | "bot" | "manual" | "anonymous";

type Rating = {
  stars?: number | null;
  status?: string | null;
  reason?: string | null;
};

type JsonRecord = Record<string, unknown>;

type ThreadSummary = {
  chatId: string;
  name: string;
  phone: string | null;
  username: string | null;
  participantId: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  messageCount: number | null;
  intent: string | null;
  routedTo: string | null;
  isAnonymous: boolean;
};

type TimelineMessage = {
  id: string;
  source: string | null;
  role: string | null;
  direction: string | null;
  content: string;
  createdAt: string | null;
  intent: string | null;
  model: string | null;
  routedTo: string | null;
  costUsd: number | null;
  rating: Rating | null;
  metadata: JsonRecord | null;
  messageType: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
};

type ThreadDetail = {
  participant: { full_name?: string | null; fullName?: string | null; phone?: string | null } | null;
  messages: TimelineMessage[];
};

const filters: Array<{ value: ChatFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "bot", label: "Bot" },
  { value: "manual", label: "Manual" },
  { value: "anonymous", label: "Anonymous" },
];

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" || typeof value === "bigint") return String(value);
  }
  return null;
}

function pickNumber(record: JsonRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function pickRecord(record: JsonRecord, keys: string[]): JsonRecord | null {
  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) return value;
  }
  return null;
}

function normalizeListPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  for (const key of ["threads", "chats", "items", "data", "users"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function normalizeThread(raw: unknown): ThreadSummary | null {
  if (!isRecord(raw)) return null;
  const participant = pickRecord(raw, ["participant", "user"]);
  const chatId = pickString(raw, ["chatId", "chat_id", "id"]);
  if (!chatId) return null;

  const participantId =
    pickString(raw, ["participantId", "participant_id"]) ??
    (participant ? pickString(participant, ["id", "participantId", "participant_id"]) : null);
  const participantName = participant ? pickString(participant, ["full_name", "fullName", "name"]) : null;
  const telegramLink = pickRecord(raw, ["telegram_link", "telegramLink"]);
  const name = pickString(raw, ["full_name", "fullName", "name", "title", "label"]) ?? participantName;
  const username = pickString(raw, ["username", "telegram_username"]) ?? (telegramLink ? pickString(telegramLink, ["username"]) : null);
  const phone =
    pickString(raw, ["phone", "verified_phone"]) ??
    (participant ? pickString(participant, ["phone"]) : null) ??
    (telegramLink ? pickString(telegramLink, ["verified_phone"]) : null);
  const botCount = pickNumber(raw, ["bot_count", "botCount"]) ?? 0;
  const telegramCount = pickNumber(raw, ["telegram_count", "telegramCount"]) ?? 0;

  return {
    chatId,
    name: name ?? `Anonymous #${chatId.slice(-6)}`,
    phone,
    username,
    participantId,
    lastMessage: pickString(raw, ["last_message_preview", "last_message", "lastMessage", "preview", "text", "content"]),
    lastMessageAt: pickString(raw, ["last_activity", "last_message_at", "lastMessageAt", "updated_at", "created_at"]),
    messageCount: pickNumber(raw, ["total_count", "message_count", "messageCount", "count"]),
    intent: pickString(raw, ["intent", "last_intent"]),
    routedTo: pickString(raw, ["routed_to", "routedTo", "mode", "owner"]) ?? (botCount > 0 ? "bot" : telegramCount > 0 ? "manual" : null),
    isAnonymous: raw.linked === false || (!participantId && !participantName && !phone),
  };
}

function normalizeRating(raw: unknown): Rating | null {
  if (!isRecord(raw)) return null;
  return {
    stars: pickNumber(raw, ["stars", "rating"]),
    status: pickString(raw, ["status"]),
    reason: pickString(raw, ["reason"]),
  };
}

function normalizeMessage(raw: unknown, index: number): TimelineMessage | null {
  if (!isRecord(raw)) return null;
  const metadata = pickRecord(raw, ["metadata", "diagnostics", "meta"]);
  const usage = pickRecord(raw, ["usage"]);
  const rating = normalizeRating(raw.rating);
  const content = pickString(raw, ["content", "text", "message", "caption"]) ?? "";

  return {
    id: pickString(raw, ["id", "message_id", "telegram_msg_id"]) ?? `message-${index}`,
    source: pickString(raw, ["source", "channel", "kind"]),
    role: pickString(raw, ["role", "sender"]),
    direction: pickString(raw, ["direction"]),
    content,
    createdAt: pickString(raw, ["created_at", "createdAt", "sent_at", "date"]),
    intent: pickString(raw, ["intent"]) ?? (metadata ? pickString(metadata, ["intent"]) : null),
    model: pickString(raw, ["model"]) ?? (metadata ? pickString(metadata, ["model", "model_name", "modelName"]) : null),
    routedTo: pickString(raw, ["routed_to", "routedTo"]) ?? (metadata ? pickString(metadata, ["routed_to", "routedTo"]) : null),
    costUsd:
      pickNumber(raw, ["cost_usd", "costUsd"]) ??
      (usage ? pickNumber(usage, ["cost_usd", "costUsd"]) : null) ??
      (metadata ? pickNumber(metadata, ["cost_usd", "costUsd"]) : null),
    rating,
    metadata,
    messageType: pickString(raw, ["message_type", "messageType", "type"]),
    fileName: pickString(raw, ["file_name", "fileName", "filename"]),
    fileSizeBytes: pickNumber(raw, ["file_size_bytes", "fileSizeBytes", "size"]),
  };
}

function normalizeThreadDetail(payload: unknown): ThreadDetail {
  const record = isRecord(payload) ? payload : {};
  const messages = normalizeListPayload(record.messages ?? record.timeline ?? record)
    .map(normalizeMessage)
    .filter((message): message is TimelineMessage => message !== null);
  const participant = pickRecord(record, ["participant", "user"]);
  return { participant, messages };
}

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "";
  const mins = Math.floor((Date.now() - time) / 60_000);
  if (mins < 1) return "Hozir";
  if (mins < 60) return `${mins} daq. oldin`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} soat oldin`;
  return `${Math.floor(hours / 24)} kun oldin`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("uz-UZ", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMoney(value: number | null): string | null {
  if (value == null || value <= 0) return null;
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}

function formatBytes(value: number | null): string | null {
  if (value == null || value <= 0) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function messageKind(message: TimelineMessage): "admin" | "telegram-in" | "bot" | "bot-user" {
  const source = message.source?.toLowerCase();
  const role = message.role?.toLowerCase();
  const direction = message.direction?.toLowerCase();
  const routedTo = message.routedTo?.toLowerCase();

  if (source === "telegram" && direction === "out") return "admin";
  if (role === "admin" || routedTo === "manual") return "admin";
  if (source === "telegram" && direction === "in") return "telegram-in";
  if (role === "assistant" || source === "bot") return "bot";
  return "bot-user";
}

function labelForMessage(message: TimelineMessage): string {
  switch (messageKind(message)) {
    case "admin":
      return "Telegram/admin outbound";
    case "telegram-in":
      return "Telegram inbound";
    case "bot":
      return "Bot AI/template";
    case "bot-user":
      return "User bot message";
  }
}

function ThreadSkeleton() {
  return (
    <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50 p-4 sm:p-6">
      {[0, 1, 2, 3, 4].map((item) => (
        <div key={item} className={cn("flex animate-pulse", item % 2 ? "justify-start" : "justify-end")}>
          <div className="h-20 w-2/3 rounded-2xl bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

function ThreadRow({
  thread,
  selected,
  onSelect,
}: {
  thread: ThreadSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full border-b border-gray-100 px-4 py-3 text-left transition hover:bg-gray-50",
        selected && "bg-blue-50 shadow-[inset_3px_0_0_rgb(37,99,235)]"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 rounded-full p-2", thread.isAnonymous ? "bg-gray-100" : "bg-blue-100")}>
          {thread.isAnonymous ? <UserCircle className="h-4 w-4 text-gray-500" /> : <MessageCircle className="h-4 w-4 text-blue-600" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-gray-900">{thread.name}</p>
            {thread.messageCount != null && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{thread.messageCount}</span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {thread.phone ?? thread.username ?? `Chat ID: ${thread.chatId}`}
          </p>
          {thread.lastMessage && <p className="mt-2 line-clamp-2 text-xs text-gray-600">{thread.lastMessage}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {thread.isAnonymous && <Badge variant="gray">Anonymous</Badge>}
            {thread.routedTo && <Badge variant={thread.routedTo.toLowerCase() === "manual" ? "orange" : "blue"}>{thread.routedTo}</Badge>}
            {thread.intent && <Badge variant="purple">{thread.intent}</Badge>}
            <span className="text-[11px] text-gray-400">{formatRelative(thread.lastMessageAt)}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function MessageBubble({ message }: { message: TimelineMessage }) {
  const kind = messageKind(message);
  const isRight = kind === "admin" || kind === "bot";
  const meta = [
    message.intent ? `intent: ${message.intent}` : null,
    message.model ? `model: ${message.model}` : null,
    formatMoney(message.costUsd) ? `cost: ${formatMoney(message.costUsd)}` : null,
    message.rating?.stars ? `rating: ${message.rating.stars}★${message.rating.status ? ` ${message.rating.status}` : ""}` : null,
  ].filter(Boolean);
  const fileChips = [
    message.messageType && message.messageType !== "text" ? message.messageType : null,
    message.fileName,
    formatBytes(message.fileSizeBytes),
  ].filter(Boolean);

  return (
    <div className={cn("flex", isRight ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[82%] rounded-2xl px-4 py-3 text-sm shadow-sm",
          kind === "admin" && "rounded-br-sm border border-sky-200 bg-sky-50 text-sky-950",
          kind === "telegram-in" && "rounded-bl-sm border border-gray-200 bg-white text-gray-900",
          kind === "bot" && "rounded-br-sm bg-blue-600 text-white",
          kind === "bot-user" && "rounded-bl-sm border border-emerald-200 bg-emerald-50 text-emerald-950"
        )}
      >
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className={cn("text-[11px] font-semibold uppercase tracking-wide", kind === "bot" ? "text-blue-100" : "text-gray-500")}>
            {labelForMessage(message)}
          </span>
          {message.createdAt && (
            <span className={cn("text-[11px]", kind === "bot" ? "text-blue-100" : "text-gray-400")}>
              {formatDateTime(message.createdAt)}
            </span>
          )}
        </div>
        <p className="whitespace-pre-wrap leading-relaxed">{message.content || "Fayl/xabar matni yo'q"}</p>
        {fileChips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {fileChips.map((chip) => (
              <span key={chip} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white/80 px-2 py-1 text-[11px] text-gray-600">
                <FileText className="h-3 w-3" />
                {chip}
              </span>
            ))}
          </div>
        )}
        {kind === "bot" && meta.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {meta.map((item) => (
              <span key={item} className="rounded-full bg-blue-500 px-2 py-1 text-[11px] text-blue-50">
                {item}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function UnifiedChatPage() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [threadDetail, setThreadDetail] = useState<ThreadDetail | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadThread(chatId: string) {
    setLoadingTimeline(true);
    setError(null);
    try {
      const res = await fetch(`/api/chat/threads/${encodeURIComponent(chatId)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Timeline failed (${res.status})`);
      setThreadDetail(normalizeThreadDetail(await res.json()));
    } catch (err) {
      setThreadDetail(null);
      setError(err instanceof Error ? err.message : "Timeline yuklanmadi");
    } finally {
      setLoadingTimeline(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadThreads() {
      setLoadingThreads(true);
      setError(null);
      try {
        const res = await fetch("/api/chat/threads", { cache: "no-store" });
        if (!res.ok) throw new Error(`Threads failed (${res.status})`);
        const nextThreads = normalizeListPayload(await res.json())
          .map(normalizeThread)
          .filter((thread): thread is ThreadSummary => thread !== null);
        if (cancelled) return;
        setThreads(nextThreads);
        const requestedChatId = typeof window === "undefined"
          ? null
          : new URLSearchParams(window.location.search).get("chatId");
        setSelectedChatId((current) => (
          current ??
          (requestedChatId && nextThreads.some((thread) => thread.chatId === requestedChatId) ? requestedChatId : null) ??
          nextThreads[0]?.chatId ??
          null
        ));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Suhbatlar yuklanmadi");
      } finally {
        if (!cancelled) setLoadingThreads(false);
      }
    }
    void loadThreads();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedChatId) {
      setThreadDetail(null);
      return;
    }
    void loadThread(selectedChatId);
  }, [selectedChatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [threadDetail]);

  const visibleThreads = useMemo(() => {
    const term = search.trim().toLowerCase();
    return threads.filter((thread) => {
      const matchesSearch =
        !term ||
        [thread.name, thread.phone, thread.username, thread.chatId, thread.lastMessage]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(term));
      const routed = thread.routedTo?.toLowerCase();
      const matchesFilter =
        filter === "all" ||
        (filter === "anonymous" && thread.isAnonymous) ||
        (filter === "manual" && routed === "manual") ||
        (filter === "bot" && !thread.isAnonymous && routed !== "manual");
      return matchesSearch && matchesFilter;
    });
  }, [filter, search, threads]);

  const selectedThread = threads.find((thread) => thread.chatId === selectedChatId) ?? null;
  const selectedName =
    threadDetail?.participant?.full_name ??
    threadDetail?.participant?.fullName ??
    selectedThread?.name ??
    "Suhbat";

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedChatId || !reply.trim()) return;
    const text = reply.trim();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: selectedChatId, text }),
      });
      if (!res.ok) throw new Error(`Send failed (${res.status})`);
      setReply("");
      await loadThread(selectedChatId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xabar yuborilmadi");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Unified Chat"
        subtitle="Telegram, admin va bot xabarlari yagona timeline ichida"
        actions={<Badge variant="blue">{threads.length} chat</Badge>}
      />

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid h-[calc(100vh-190px)] grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card padding="none" className="flex min-h-0 flex-col overflow-hidden">
          <div className="sticky top-0 z-10 border-b border-gray-100 bg-white p-4">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search chats..."
              className="pl-9"
              aria-label="Search chats"
            />
            <Search className="pointer-events-none -mt-7 ml-3 h-4 w-4 text-gray-400" />
            <div className="mt-4 flex flex-wrap gap-2">
              {filters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    filter === item.value
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingThreads ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2, 3, 4, 5].map((item) => (
                  <div key={item} className="h-20 animate-pulse rounded-xl bg-gray-100" />
                ))}
              </div>
            ) : visibleThreads.length === 0 ? (
              <div className="flex h-full min-h-[240px] items-center justify-center p-6 text-center text-sm text-gray-500">
                Suhbatlar topilmadi.
              </div>
            ) : (
              visibleThreads.map((thread) => (
                <ThreadRow
                  key={thread.chatId}
                  thread={thread}
                  selected={thread.chatId === selectedChatId}
                  onSelect={() => setSelectedChatId(thread.chatId)}
                />
              ))
            )}
          </div>
        </Card>

        <Card padding="none" className="flex min-h-0 flex-col overflow-hidden">
          {selectedChatId ? (
            <>
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-100 bg-white px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-2xl bg-blue-100 p-2.5">
                    <Bot className="h-5 w-5 text-blue-700" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-gray-900">{selectedName}</h2>
                    <p className="truncate text-xs text-gray-500">
                      Chat ID: {selectedChatId}
                      {selectedThread?.phone ? ` · ${selectedThread.phone}` : ""}
                    </p>
                  </div>
                </div>
                {selectedThread?.isAnonymous && <Badge variant="gray">Anonymous</Badge>}
              </div>

              {loadingTimeline ? (
                <ThreadSkeleton />
              ) : (
                <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50 p-4 sm:p-6">
                  {threadDetail?.messages.length ? (
                    threadDetail.messages.map((message) => <MessageBubble key={message.id} message={message} />)
                  ) : (
                    <div className="flex h-full min-h-[260px] items-center justify-center text-center text-sm text-gray-500">
                      Bu chat uchun timeline bo&apos;sh.
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}

              <form onSubmit={handleSend} className="sticky bottom-0 border-t border-gray-100 bg-white p-4">
                <div className="flex gap-3">
                  <Textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder="Javob yozing..."
                    className="min-h-[44px] flex-1"
                    aria-label="Reply text"
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <Button type="submit" loading={sending} disabled={!reply.trim() || loadingTimeline} className="self-end">
                    <Send className="h-4 w-4" />
                    Send
                  </Button>
                </div>
                <p className="mt-2 text-xs text-gray-400">Cmd/Ctrl + Enter orqali yuborish mumkin.</p>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center">
              <div>
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
                  <MessageCircle className="h-7 w-7 text-gray-400" />
                </div>
                <p className="font-medium text-gray-700">Suhbat tanlang</p>
                <p className="mt-1 text-sm text-gray-500">Timeline va reply box shu yerda ko&apos;rinadi.</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
