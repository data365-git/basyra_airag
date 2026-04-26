"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "@/components/ui/Table";

const PAGE_SIZE = 50;

type BotUser = {
  chat_id: string;
  participant_id: string | null;
  full_name: string | null;
  phone: string | null;
  is_linked: boolean;
  is_active: boolean;
  message_count: number;
  last_seen: string | null;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function ChatbotUsersPage() {
  const [users, setUsers] = useState<BotUser[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Reset offset when search changes
  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
        search: debouncedSearch,
      });
      const res = await fetch(`/api/chatbot/users?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setUsers(data.users);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xato yuz berdi");
    } finally {
      setLoading(false);
    }
  }, [offset, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleBlock(chatId: string, currentlyActive: boolean) {
    setBlocking(chatId);
    try {
      const res = await fetch(`/api/chatbot/users/${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !currentlyActive }),
      });
      if (!res.ok) throw new Error(await res.text());
      setUsers((prev) =>
        prev.map((u) =>
          u.chat_id === chatId ? { ...u, is_active: !currentlyActive } : u
        )
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Xato yuz berdi");
    } finally {
      setBlocking(null);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Bot foydalanuvchilari</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} ta foydalanuvchi
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-sm">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ism, telefon yoki chat ID bo'yicha qidirish..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className={loading ? "opacity-60 pointer-events-none" : ""}>
        <Table>
          <Thead>
            <tr>
              <Th>Foydalanuvchi</Th>
              <Th>Telefon</Th>
              <Th>LMS bog'liq</Th>
              <Th>Holat</Th>
              <Th>So'nggi faollik</Th>
              <Th>Xabarlar</Th>
              <Th>Amallar</Th>
            </tr>
          </Thead>
          <Tbody>
            {users.length === 0 && !loading ? (
              <EmptyRow
                cols={7}
                message={
                  debouncedSearch
                    ? "Qidiruv natijalari topilmadi"
                    : "Foydalanuvchilar yo'q"
                }
              />
            ) : (
              users.map((u) => (
                <Tr key={u.chat_id}>
                  <Td>
                    <div>
                      <div className="font-medium text-gray-900">
                        {u.full_name ?? (
                          <span className="text-gray-400 italic">Anonim</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 font-mono mt-0.5">
                        {u.chat_id}
                      </div>
                    </div>
                  </Td>
                  <Td className="text-gray-500">
                    {u.phone ?? "—"}
                  </Td>
                  <Td>
                    {u.is_linked ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
                        ✓ Ha
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200 rounded-full px-2 py-0.5">
                        ✗ Yo'q
                      </span>
                    )}
                  </Td>
                  <Td>
                    {u.is_active ? (
                      <span className="inline-flex items-center text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">
                        Faol
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-xs font-medium bg-red-50 text-red-600 border border-red-200 rounded-full px-2 py-0.5">
                        Bloklangan
                      </span>
                    )}
                  </Td>
                  <Td className="text-gray-500 text-sm">
                    {formatDate(u.last_seen)}
                  </Td>
                  <Td className="font-medium text-gray-700">
                    {u.message_count}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/chatbot/conversations?chatId=${u.chat_id}`}
                        className="text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap"
                      >
                        💬 Suhbat
                      </Link>
                      {u.is_linked && (
                        <button
                          onClick={() => toggleBlock(u.chat_id, u.is_active)}
                          disabled={blocking === u.chat_id}
                          className={`text-xs px-2 py-1 rounded-md border transition-colors whitespace-nowrap disabled:opacity-50 ${
                            u.is_active
                              ? "border-red-200 text-red-600 hover:bg-red-50"
                              : "border-green-200 text-green-600 hover:bg-green-50"
                          }`}
                        >
                          {blocking === u.chat_id
                            ? "..."
                            : u.is_active
                            ? "🚫 Bloklash"
                            : "✓ Ochish"}
                        </button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / {total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0 || loading}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Oldingi
            </button>
            <span className="px-3 py-1.5 font-medium text-gray-700">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total || loading}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Keyingi →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
