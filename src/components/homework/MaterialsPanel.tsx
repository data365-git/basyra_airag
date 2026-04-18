"use client";

import { useState, useEffect } from "react";
import {
  Plus, Trash2, Link2, Video, Mic, FileText, File as FileIcon, Image,
  MoreHorizontal, X, Upload, BookOpen,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { DropZone } from "@/components/ui/DropZone";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button } from "@/components/ui/Button";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Material {
  id:              string;
  kind:            "PDF" | "VIDEO" | "AUDIO" | "IMAGE" | "DOCUMENT" | "LINK";
  title:           string;
  description:     string | null;
  storage_url:     string | null;
  file_name:       string | null;
  file_size_bytes: number | null;
  url:             string | null;
  sort_order:      number;
}

interface Props {
  hwId:      string;
  materials: Material[];
  canManage: boolean;
  onUpdate:  () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mimeToKind(mime: string): Material["kind"] {
  if (mime.startsWith("video/"))  return "VIDEO";
  if (mime.startsWith("audio/"))  return "AUDIO";
  if (mime.startsWith("image/"))  return "IMAGE";
  if (mime === "application/pdf") return "PDF";
  return "DOCUMENT";
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024)          return `${bytes} B`;
  if (bytes < 1024 * 1024)   return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function urlDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

// ─── Kind chip config ─────────────────────────────────────────────────────────

const KIND: Record<Material["kind"], { icon: React.ReactNode; bg: string; text: string; label: string }> = {
  PDF:      { icon: <FileText size={15} />, bg: "bg-red-50",     text: "text-red-500",    label: "PDF"    },
  VIDEO:    { icon: <Video    size={15} />, bg: "bg-blue-50",    text: "text-blue-500",   label: "Video"  },
  AUDIO:    { icon: <Mic      size={15} />, bg: "bg-purple-50",  text: "text-purple-500", label: "Audio"  },
  IMAGE:    { icon: <Image    size={15} />, bg: "bg-green-50",   text: "text-green-500",  label: "Rasm"   },
  DOCUMENT: { icon: <FileIcon size={15} />, bg: "bg-gray-100",   text: "text-gray-500",   label: "Hujjat" },
  LINK:     { icon: <Link2    size={15} />, bg: "bg-indigo-50",  text: "text-indigo-500", label: "Havola" },
};

function KindChip({ kind }: { kind: Material["kind"] }) {
  const { icon, bg, text } = KIND[kind];
  return (
    <span className={cn("inline-flex items-center justify-center w-9 h-9 rounded-xl shrink-0", bg, text)}>
      {icon}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MaterialsPanel({ hwId, materials, canManage, onUpdate }: Props) {

  // ── Modal ──
  const [modalOpen, setModalOpen] = useState(false);
  const [mode,      setMode]      = useState<"file" | "link">("file");

  // ── File mode ──
  const [file,     setFile]     = useState<File | null>(null);
  const [fileKind, setFileKind] = useState<Material["kind"]>("DOCUMENT");

  // ── Shared form ──
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [url,         setUrl]         = useState("");

  // ── Upload ──
  const [progress, setProgress] = useState(-1); // -1 = idle
  const [saving,   setSaving]   = useState(false);

  // ── ⋯ menu ──
  const [menuId, setMenuId] = useState<string | null>(null);

  // ── Undo delete ──
  const [undoItem, setUndoItem] = useState<{
    id: string; title: string; timer: ReturnType<typeof setTimeout>
  } | null>(null);

  // Close ⋯ menu on any outside click
  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuId]);

  // ── Helpers ──

  function openModal(withFile?: File) {
    resetForm();
    if (withFile) {
      setFile(withFile);
      setFileKind(mimeToKind(withFile.type));
      setTitle(withFile.name.replace(/\.[^.]+$/, ""));
      setMode("file");
    }
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    resetForm();
  }

  function resetForm() {
    setFile(null);
    setTitle("");
    setDescription("");
    setUrl("");
    setProgress(-1);
    setMode("file");
  }

  function handleDropToPanel(files: File[]) {
    if (files[0]) openModal(files[0]);
  }

  function handleFileSelect(files: File[]) {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setFileKind(mimeToKind(f.type));
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  async function save() {
    if (!title.trim()) { toast.error("Sarlavha kiriting"); return; }

    // ── Link mode ──
    if (mode === "link") {
      if (!url.trim()) { toast.error("URL kiriting"); return; }
      setSaving(true);
      const res = await fetch(`/api/homeworks/${hwId}/materials`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          kind:        "LINK",
          title:       title.trim(),
          description: description.trim() || null,
          url:         url.trim(),
        }),
      });
      setSaving(false);
      if (res.ok) { toast.success("Material qo'shildi"); closeModal(); onUpdate(); }
      else        { toast.error("Xato yuz berdi"); }
      return;
    }

    // ── File mode ──
    if (!file) { toast.error("Fayl tanlang"); return; }

    setSaving(true);
    setProgress(0);

    const fd = new FormData();
    fd.append("file",  file);
    fd.append("title", title.trim());
    if (description.trim()) fd.append("description", description.trim());

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/homeworks/${hwId}/materials`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(xhr.responseText));
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(fd);
      });
      toast.success("Material qo'shildi");
      closeModal();
      onUpdate();
    } catch {
      toast.error("Xato yuz berdi");
      setProgress(-1);
    } finally {
      setSaving(false);
    }
  }

  function startDelete(id: string, matTitle: string) {
    setMenuId(null);
    // Cancel any existing pending deletion first
    if (undoItem) {
      clearTimeout(undoItem.timer);
      // Commit the previous deletion immediately since user deleted another item
      fetch(`/api/homeworks/${hwId}/materials/${undoItem.id}`, { method: "DELETE" })
        .then(() => onUpdate())
        .catch(() => {});
    }
    const timer = setTimeout(async () => {
      await fetch(`/api/homeworks/${hwId}/materials/${id}`, { method: "DELETE" });
      setUndoItem(null);
      onUpdate();
    }, 5000);
    setUndoItem({ id, title: matTitle, timer });
  }

  function undoDelete() {
    if (!undoItem) return;
    clearTimeout(undoItem.timer);
    setUndoItem(null);
    toast("Bekor qilindi");
  }

  const canSave = title.trim() !== "" && (mode === "link" ? url.trim() !== "" : file !== null);

  // Optimistically hide item pending deletion
  const visible = undoItem ? materials.filter((m) => m.id !== undoItem.id) : materials;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Panel header ── */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <BookOpen size={15} className="text-gray-400" />
          O&apos;quv materiallari
          {visible.length > 0 && (
            <span className="text-xs font-medium text-gray-400 tabular-nums">({visible.length})</span>
          )}
        </h3>
        {canManage && visible.length > 0 && (
          <button
            onClick={() => openModal()}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Plus size={13} />
            Qo&apos;shish
          </button>
        )}
      </div>

      {/* ── Empty state ── */}
      {visible.length === 0 && (
        canManage ? (
          <DropZone onFiles={handleDropToPanel} className="p-10">
            <div className="flex flex-col items-center gap-3 text-center pointer-events-none">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
                <Upload size={24} className="text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-600">Fayl yoki havola qo&apos;shing</p>
                <p className="text-xs text-gray-400 mt-1">PDF · Video · Audio · Rasm</p>
                <p className="text-xs text-gray-300 mt-0.5">Yoki faylni shu yerga sudrab keling</p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); openModal(); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-colors pointer-events-auto shadow-sm"
              >
                <Plus size={13} />
                Material qo&apos;shish
              </button>
            </div>
          </DropZone>
        ) : (
          <div className="py-8 text-center space-y-2">
            <p className="text-sm text-gray-400">Hali material qo&apos;shilmagan.</p>
          </div>
        )
      )}

      {/* ── Material list ── */}
      {visible.length > 0 && (
        <div className="space-y-0.5">
          {visible.map((m) => {
            const href = m.kind === "LINK" ? m.url : m.storage_url;
            const sub  = m.kind === "LINK" && m.url
              ? urlDomain(m.url)
              : m.file_size_bytes
              ? fmtBytes(m.file_size_bytes)
              : KIND[m.kind].label;

            return (
              <div
                key={m.id}
                className="group flex items-center gap-3 px-2 py-2.5 -mx-2 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <KindChip kind={m.kind} />

                <div className="flex-1 min-w-0">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors block truncate"
                    >
                      {m.title}
                    </a>
                  ) : (
                    <span className="text-sm font-medium text-gray-900 block truncate">{m.title}</span>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>
                </div>

                {/* ⋯ menu — admin only */}
                {canManage && (
                  <div className="relative shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuId(menuId === m.id ? null : m.id); }}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
                      aria-label="Amallar"
                    >
                      <MoreHorizontal size={15} />
                    </button>

                    {menuId === m.id && (
                      <div
                        className="absolute right-0 top-8 z-30 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[130px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {href && (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 w-full"
                            onClick={() => setMenuId(null)}
                          >
                            Ochish
                          </a>
                        )}
                        <button
                          onClick={() => startDelete(m.id, m.title)}
                          className="flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50 w-full text-left"
                        >
                          <Trash2 size={12} />
                          O&apos;chirish
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Compact bottom drop zone */}
          {canManage && (
            <DropZone onFiles={handleDropToPanel} className="mt-3">
              <div className="flex items-center justify-center gap-1.5 py-2.5 text-xs text-gray-400 pointer-events-none">
                <Upload size={12} />
                Faylni bu yerga sudrab keling
              </div>
            </DropZone>
          )}
        </div>
      )}

      {/* ── Add material modal ── */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title="Material qo'shish"
        size="sm"
        footer={
          <div className="flex gap-2 w-full">
            <Button variant="outline" onClick={closeModal} disabled={saving}>Bekor</Button>
            <Button
              onClick={save}
              disabled={!canSave || saving}
              loading={saving && progress === -1}
              className="flex-1"
            >
              Saqlash
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Mode switcher */}
          <SegmentedControl
            options={[
              { value: "file", label: <><span>📎</span><span>Fayl</span></> },
              { value: "link", label: <><span>🔗</span><span>Havola</span></> },
            ]}
            value={mode}
            onChange={(v) => { setMode(v); setFile(null); setProgress(-1); }}
          />

          {/* ── File mode ── */}
          {mode === "file" && (
            <>
              {!file ? (
                <DropZone onFiles={handleFileSelect} className="p-7">
                  <div className="flex flex-col items-center gap-2 text-center pointer-events-none">
                    <Upload size={26} className="text-gray-300" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Faylni bu yerga sudrab keling</p>
                      <p className="text-xs text-gray-400 mt-0.5">yoki tanlash uchun bosing</p>
                      <p className="text-xs text-gray-300 mt-1.5">PDF · Video · Audio · Rasm · Hujjat · Max 50 MB</p>
                    </div>
                  </div>
                </DropZone>
              ) : (
                /* File chip */
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <KindChip kind={fileKind} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{fmtBytes(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setFile(null); setProgress(-1); }}
                    className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                    aria-label="Faylni olib tashlash"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Upload progress bar */}
              {progress >= 0 && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Yuklanmoqda…</span>
                    <span className="tabular-nums">{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-1.5 rounded-full bg-blue-500 transition-all duration-150"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Link mode ── */}
          {mode === "link" && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-600">
                URL <span className="text-red-400">*</span>
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://youtu.be/…"
                autoFocus
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400">
                YouTube, Vimeo, Google Drive, Notion va boshqalar
              </p>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-600">
              Sarlavha <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Material nomi"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-600 flex items-center gap-1">
              Izoh
              <span className="font-normal text-gray-400">(ixtiyoriy)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Qo'shimcha izoh…"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </Modal>

      {/* ── Undo-delete snackbar ── */}
      {undoItem && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-full shadow-2xl text-sm whitespace-nowrap">
          <span className="opacity-80 max-w-[200px] truncate">
            &ldquo;{undoItem.title}&rdquo; o&apos;chirildi
          </span>
          <button
            onClick={undoDelete}
            className="font-semibold text-blue-300 hover:text-blue-200 transition-colors"
          >
            Qaytarish
          </button>
        </div>
      )}
    </>
  );
}
