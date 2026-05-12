"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Check, X, GripVertical } from "lucide-react";
import { PageHeader } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmModal } from "@/components/ui/Modal";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { usePermission } from "@/hooks/usePermission";
import { useTranslation } from "@/providers/LanguageProvider";
import type { TrainingCategory } from "@/types";
import toast from "react-hot-toast";

interface CategoryForm {
  name_uz: string;
  name_ru: string;
  name_en: string;
  sort_order: number;
}

const emptyForm = (): CategoryForm => ({ name_uz: "", name_ru: "", name_en: "", sort_order: 0 });

export default function CategoriesPage() {
  const router = useRouter();
  const canCreate = usePermission("settings.categories", "create");
  const canEdit   = usePermission("settings.categories", "edit");
  const canDelete = usePermission("settings.categories", "delete");
  const { t } = useTranslation();

  const [categories, setCategories] = useState<TrainingCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Add row
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<CategoryForm>(emptyForm());
  const [adding, setAdding] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CategoryForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  // Delete
  const [deletingCat, setDeletingCat] = useState<TrainingCategory | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/training-categories");
    const data = await res.json();
    setCategories(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.name_uz.trim()) return;
    setAdding(true);
    const res = await fetch("/api/training-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    setAdding(false);
    if (res.ok) {
      toast.success(t("settings.categories.added"));
      setAddOpen(false);
      setAddForm(emptyForm());
      await load();
      router.refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? t("settings.categories.add_failed"));
    }
  }

  function startEdit(cat: TrainingCategory) {
    setEditingId(cat.id);
    setEditForm({
      name_uz: cat.name_uz,
      name_ru: cat.name_ru ?? "",
      name_en: cat.name_en ?? "",
      sort_order: cat.sort_order,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm());
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    const res = await fetch("/api/training-categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingId, ...editForm }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(t("settings.categories.saved"));
      setEditingId(null);
      await load();
      router.refresh();
    } else {
      toast.error(t("settings.categories.save_failed"));
    }
  }

  async function handleDelete() {
    if (!deletingCat) return;
    setDeleting(true);
    const res = await fetch("/api/training-categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deletingCat.id }),
    });
    setDeleting(false);
    if (res.ok) {
      toast.success(t("settings.categories.deleted"));
      setDeletingCat(null);
      await load();
      router.refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? t("settings.categories.delete_failed"));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.settings")}
        subtitle={t("settings.categories.subtitle")}
        actions={
          canCreate && (
            <Button size="sm" onClick={() => { setAddForm(emptyForm()); setAddOpen(true); }}>
              <Plus size={14} /> {t("settings.categories.add")}
            </Button>
          )
        }
      />

      <SettingsTabs />

      {/* Add form */}
      {addOpen && (
        <form
          onSubmit={handleAdd}
          className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3"
        >
          <p className="text-sm font-semibold text-blue-700">{t("settings.categories.new_category")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label={`${t("settings.categories.name_uz")} *`}
              value={addForm.name_uz}
              onChange={(e) => setAddForm((f) => ({ ...f, name_uz: e.target.value }))}
              required
              autoFocus
            />
            <Input
              label={t("settings.categories.name_ru")}
              value={addForm.name_ru}
              onChange={(e) => setAddForm((f) => ({ ...f, name_ru: e.target.value }))}
            />
            <Input
              label={t("settings.categories.name_en")}
              value={addForm.name_en}
              onChange={(e) => setAddForm((f) => ({ ...f, name_en: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-32">
              <Input
                label={t("settings.categories.sort_order")}
                type="number"
                min={0}
                value={addForm.sort_order}
                onChange={(e) => setAddForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div className="flex gap-2 mt-5">
              <Button type="submit" size="sm" loading={adding}>{t("common.save")}</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setAddOpen(false)}>{t("common.cancel")}</Button>
            </div>
          </div>
        </form>
      )}

      {/* Category list */}
      {loading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : categories.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">{t("settings.categories.no_categories")}</p>
          {canCreate && (
            <button
              className="mt-2 text-sm text-blue-600 hover:underline"
              onClick={() => setAddOpen(true)}
            >
              {t("settings.categories.add_first")}
            </button>
          )}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-8"></th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("settings.categories.uz_col")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">{t("settings.categories.ru_col")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">{t("settings.categories.en_col")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-20 text-center hidden sm:table-cell">{t("settings.categories.order_col")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-20 text-center hidden sm:table-cell">{t("settings.categories.trainings_col")}</th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.map((cat) => {
                const isEditing = editingId === cat.id;
                return (
                  <tr key={cat.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-300">
                      <GripVertical size={14} />
                    </td>

                    {isEditing ? (
                      <>
                        <td className="px-2 py-2">
                          <input
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={editForm.name_uz}
                            onChange={(e) => setEditForm((f) => ({ ...f, name_uz: e.target.value }))}
                            autoFocus
                          />
                        </td>
                        <td className="px-2 py-2 hidden sm:table-cell">
                          <input
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={editForm.name_ru}
                            onChange={(e) => setEditForm((f) => ({ ...f, name_ru: e.target.value }))}
                          />
                        </td>
                        <td className="px-2 py-2 hidden md:table-cell">
                          <input
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={editForm.name_en}
                            onChange={(e) => setEditForm((f) => ({ ...f, name_en: e.target.value }))}
                          />
                        </td>
                        <td className="px-2 py-2 hidden sm:table-cell">
                          <input
                            type="number"
                            min={0}
                            className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={editForm.sort_order}
                            onChange={(e) => setEditForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                          />
                        </td>
                        <td className="px-4 py-2 text-center text-gray-500 text-xs hidden sm:table-cell">
                          {cat.training_count ?? 0}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={saveEdit}
                              disabled={saving}
                              className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                              title="Save"
                            >
                              <Check size={15} />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
                              title="Cancel"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-gray-900">{cat.name_uz}</td>
                        <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{cat.name_ru ?? <span className="text-gray-300 italic text-xs">—</span>}</td>
                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{cat.name_en ?? <span className="text-gray-300 italic text-xs">—</span>}</td>
                        <td className="px-4 py-3 text-center text-gray-500 hidden sm:table-cell">{cat.sort_order}</td>
                        <td className="px-4 py-3 text-center hidden sm:table-cell">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            (cat.training_count ?? 0) > 0
                              ? "bg-blue-50 text-blue-700"
                              : "bg-gray-100 text-gray-400"
                          }`}>
                            {cat.training_count ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 justify-end">
                            {canEdit && (
                              <button
                                onClick={() => startEdit(cat)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                title="Edit"
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => setDeletingCat(cat)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmModal
        open={!!deletingCat}
        onClose={() => setDeletingCat(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title={t("settings.categories.delete_title")}
        message={
          deletingCat
            ? t("settings.categories.delete_message", { name: deletingCat.name_uz })
            : ""
        }
        confirmLabel={t("common.delete")}
        danger
      />
    </div>
  );
}
