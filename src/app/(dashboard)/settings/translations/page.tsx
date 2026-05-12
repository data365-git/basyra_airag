"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/Header";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { usePermission } from "@/hooks/usePermission";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

// Bundled strings — used as baseline / reference
import uzStrings from "@/i18n/uz.json";
import ruStrings from "@/i18n/ru.json";
import enStrings from "@/i18n/en.json";

type Lang = "uz" | "ru" | "en";

// DB override row shape from the API
interface DbRow { key: string; language: string; value: string; }

// Per-key, per-language override state
type OverrideMap = Record<string, Record<Lang, string>>;

// Saved-flash state: key+lang → countdown id
type SavedFlash = Set<string>;

interface EditTarget { key: string; lang: Lang; }

// Collect all unique keys from all 3 bundled files
const BUNDLED_KEYS = Array.from(new Set([
  ...Object.keys(uzStrings),
  ...Object.keys(ruStrings),
  ...Object.keys(enStrings),
])).sort();

// Derive group prefix (everything before the first dot)
function groupOf(key: string) { return key.split(".")[0]; }

const BUNDLED: Record<Lang, Record<string, string>> = {
  uz: uzStrings as Record<string, string>,
  ru: ruStrings as Record<string, string>,
  en: enStrings as Record<string, string>,
};

type Filter = "all" | "missing_uz" | "missing_ru";

// ─── Cell ──────────────────────────────────────────────────────────────────────

interface CellProps {
  keyName: string;
  lang: Lang;
  bundled: string;
  override: string | undefined;
  canEdit: boolean;
  editing: EditTarget | null;
  onStartEdit: (target: EditTarget) => void;
  onSave: (key: string, lang: Lang, value: string) => Promise<void>;
  onCancel: () => void;
  savedFlash: SavedFlash;
  editValue: string;
  setEditValue: (v: string) => void;
}

function Cell({
  keyName, lang, bundled, override, canEdit, editing, onStartEdit,
  onSave, onCancel, savedFlash, editValue, setEditValue,
}: CellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = editing?.key === keyName && editing?.lang === lang;
  const flashKey = `${keyName}:${lang}`;
  const isSaved = savedFlash.has(flashKey);
  const displayValue = override ?? "";
  const isOverridden = override !== undefined && override !== "";
  const isMissing = !bundled && !override;

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onSave(keyName, lang, editValue); }
            if (e.key === "Escape") { e.preventDefault(); onCancel(); }
          }}
          className="flex-1 text-sm border border-blue-400 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
          placeholder={bundled || "Enter translation…"}
        />
        <span className="text-[10px] text-gray-400 whitespace-nowrap hidden sm:block">
          Enter ↵ · Esc
        </span>
      </div>
    );
  }

  return (
    <div
      onClick={() => canEdit && onStartEdit({ key: keyName, lang })}
      className={cn(
        "group flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors min-h-[30px]",
        canEdit ? "cursor-text hover:bg-blue-50" : "cursor-default",
        isMissing && "italic text-gray-300",
      )}
    >
      {isSaved ? (
        <span className="text-xs text-green-600 font-medium">✓ Saved</span>
      ) : isOverridden ? (
        <span className="text-gray-800">{override}</span>
      ) : bundled ? (
        <span className="text-gray-400">{bundled}</span>
      ) : (
        <span className="text-gray-300 italic">— missing —</span>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function TranslationsPage() {
  const canEdit = usePermission("settings.translations", "edit");

  const [overrides, setOverrides] = useState<OverrideMap>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savedFlash, setSavedFlash] = useState<SavedFlash>(new Set());

  // Load DB overrides once
  useEffect(() => {
    fetch("/api/translations")
      .then((r) => r.json())
      .then((rows: DbRow[]) => {
        if (!Array.isArray(rows)) return;
        const map: OverrideMap = {};
        for (const row of rows) {
          if (!map[row.key]) map[row.key] = { uz: "", ru: "", en: "" };
          map[row.key][row.language as Lang] = row.value;
        }
        setOverrides(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Filtered + searched keys
  const filteredKeys = useMemo(() => {
    let keys = BUNDLED_KEYS;

    if (filter === "missing_uz") {
      keys = keys.filter((k) => {
        const ov = overrides[k]?.uz;
        return !ov && !BUNDLED.uz[k];
      });
    } else if (filter === "missing_ru") {
      keys = keys.filter((k) => {
        const ov = overrides[k]?.ru;
        return !ov && !BUNDLED.ru[k];
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      keys = keys.filter((k) => {
        if (k.toLowerCase().includes(q)) return true;
        const ov = overrides[k];
        if (ov?.uz?.toLowerCase().includes(q)) return true;
        if (ov?.ru?.toLowerCase().includes(q)) return true;
        if (BUNDLED.uz[k]?.toLowerCase().includes(q)) return true;
        if (BUNDLED.ru[k]?.toLowerCase().includes(q)) return true;
        if (BUNDLED.en[k]?.toLowerCase().includes(q)) return true;
        return false;
      });
    }

    return keys;
  }, [filter, search, overrides]);

  // Group the filtered keys
  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const key of filteredKeys) {
      const g = groupOf(key);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(key);
    }
    return map;
  }, [filteredKeys]);

  function toggleGroup(group: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function startEdit(target: EditTarget) {
    const current = overrides[target.key]?.[target.lang] ?? "";
    setEditing(target);
    setEditValue(current || BUNDLED[target.lang][target.key] || "");
  }

  function cancelEdit() {
    setEditing(null);
    setEditValue("");
  }

  async function saveEdit(key: string, lang: Lang, value: string) {
    const trimmed = value.trim();
    setEditing(null);

    if (!trimmed) {
      // Empty → delete override (revert to bundled)
      const res = await fetch("/api/translations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, language: lang }),
      });
      if (res.ok) {
        setOverrides((prev) => {
          const next = { ...prev };
          if (next[key]) {
            const entry = { ...next[key] };
            entry[lang] = "";
            next[key] = entry;
          }
          return next;
        });
        flashSaved(key, lang);
      } else {
        toast.error("Failed to revert");
      }
      return;
    }

    const res = await fetch("/api/translations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, language: lang, value: trimmed }),
    });

    if (res.ok) {
      setOverrides((prev) => {
        const next = { ...prev };
        if (!next[key]) next[key] = { uz: "", ru: "", en: "" };
        next[key] = { ...next[key], [lang]: trimmed };
        return next;
      });
      flashSaved(key, lang);
    } else {
      toast.error("Failed to save translation");
    }
  }

  function flashSaved(key: string, lang: Lang) {
    const flashKey = `${key}:${lang}`;
    setSavedFlash((prev) => new Set(prev).add(flashKey));
    setTimeout(() => {
      setSavedFlash((prev) => {
        const next = new Set(prev);
        next.delete(flashKey);
        return next;
      });
    }, 2000);
  }

  // Expand all groups that have filtered results (when searching)
  const allGroupNames = Array.from(groups.keys());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle={`${BUNDLED_KEYS.length} translation keys`}
      />

      <SettingsTabs />

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by key or text…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Filter pills */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          {(["all", "missing_uz", "missing_ru"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                filter === f ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              )}
            >
              {f === "all" ? "All" : f === "missing_uz" ? "Missing UZ" : "Missing RU"}
            </button>
          ))}
        </div>
      </div>

      {/* Expand / Collapse all */}
      {!loading && groups.size > 1 && (
        <div className="flex gap-3 text-xs">
          <button
            onClick={() => setCollapsedGroups(new Set())}
            className="text-blue-600 hover:underline"
          >
            Expand all
          </button>
          <button
            onClick={() => setCollapsedGroups(new Set(allGroupNames))}
            className="text-blue-600 hover:underline"
          >
            Collapse all
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filteredKeys.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {search ? `No keys match "${search}"` : "No missing translations — everything is covered! ✓"}
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(groups.entries()).map(([group, keys]) => {
            const collapsed = collapsedGroups.has(group);
            return (
              <div key={group} className="border border-gray-200 rounded-xl overflow-hidden">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  {collapsed ? (
                    <ChevronRight size={14} className="text-gray-400 shrink-0" />
                  ) : (
                    <ChevronDown size={14} className="text-gray-400 shrink-0" />
                  )}
                  <span className="text-sm font-semibold text-gray-700 capitalize">{group}</span>
                  <span className="text-xs text-gray-400 ml-1">({keys.length})</span>
                </button>

                {/* Keys table */}
                {!collapsed && (
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-100">
                      <tr className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                        <th className="px-4 py-2 text-left w-64">Key</th>
                        <th className="px-4 py-2 text-left">Uzbek</th>
                        <th className="px-4 py-2 text-left hidden md:table-cell">Russian</th>
                        <th className="px-4 py-2 text-left hidden lg:table-cell text-gray-300">English (ref)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {keys.map((key) => (
                        <tr key={key} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-2 font-mono text-xs text-gray-500 align-top pt-3 break-all">
                            {key.substring(group.length + 1) || key}
                          </td>
                          <td className="px-4 py-2 align-top pt-2">
                            <Cell
                              keyName={key}
                              lang="uz"
                              bundled={BUNDLED.uz[key] ?? ""}
                              override={overrides[key]?.uz || undefined}
                              canEdit={canEdit}
                              editing={editing}
                              onStartEdit={startEdit}
                              onSave={saveEdit}
                              onCancel={cancelEdit}
                              savedFlash={savedFlash}
                              editValue={editValue}
                              setEditValue={setEditValue}
                            />
                          </td>
                          <td className="px-4 py-2 align-top pt-2 hidden md:table-cell">
                            <Cell
                              keyName={key}
                              lang="ru"
                              bundled={BUNDLED.ru[key] ?? ""}
                              override={overrides[key]?.ru || undefined}
                              canEdit={canEdit}
                              editing={editing}
                              onStartEdit={startEdit}
                              onSave={saveEdit}
                              onCancel={cancelEdit}
                              savedFlash={savedFlash}
                              editValue={editValue}
                              setEditValue={setEditValue}
                            />
                          </td>
                          <td className="px-4 py-2 text-gray-300 text-sm italic hidden lg:table-cell align-top pt-3">
                            {BUNDLED.en[key] ?? ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
