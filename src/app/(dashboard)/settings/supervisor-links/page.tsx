"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import toast from "react-hot-toast";

type SupervisorLink = {
  id: string;
  boss_id: string;
  boss_name: string;
  report_id: string;
  report_name: string;
  training_id: string | null;
  training_name: string | null;
  created_at: string;
};

type Participant = {
  id: string;
  full_name: string;
  phone: string;
};

const emptyAddForm = {
  boss_query: "",
  boss_id: "",
  boss_name: "",
  report_query: "",
  report_id: "",
  report_name: "",
};

export default function SupervisorLinksPage() {
  const [links, setLinks] = useState<SupervisorLink[]>([]);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [bossResults, setBossResults] = useState<Participant[]>([]);
  const [reportResults, setReportResults] = useState<Participant[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch("/api/supervisor-links")
      .then((r) => r.json())
      .then((data) => {
        setLinks(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, []);

  async function searchParticipants(query: string, type: "boss" | "report") {
    if (query.length < 2) {
      type === "boss" ? setBossResults([]) : setReportResults([]);
      return;
    }
    const res = await fetch(`/api/participants/search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      type === "boss" ? setBossResults(data) : setReportResults(data);
    }
  }

  function openAdd() {
    setAddForm(emptyAddForm);
    setBossResults([]);
    setReportResults([]);
    setAddOpen(true);
  }

  async function handleAdd() {
    if (!addForm.boss_id || !addForm.report_id) {
      toast.error("Boss va report ishtirokchini tanlang");
      return;
    }
    setAdding(true);
    const res = await fetch("/api/supervisor-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boss_id: addForm.boss_id, report_id: addForm.report_id }),
    });
    setAdding(false);
    if (res.ok) {
      const newLink = await res.json();
      setLinks((prev) => [newLink, ...prev]);
      toast.success("Bog'lanish qo'shildi");
      setAddOpen(false);
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Xatolik yuz berdi");
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/supervisor-links/${id}`, { method: "DELETE" });
    if (res.ok) {
      setLinks((prev) => prev.filter((l) => l.id !== id));
      toast.success("O'chirildi");
    } else {
      toast.error("O'chirishda xatolik");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sozlamalar"
        subtitle="Nazoratchlar bog'lanishlari"
        actions={
          <Button size="sm" onClick={openAdd}>
            <Plus size={14} /> Qo'shish
          </Button>
        }
      />

      <SettingsTabs />

      {loading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>Boss</Th>
              <Th>Hisobot beruvchi</Th>
              <Th>Trening</Th>
              <Th>Qo'shilgan</Th>
              <Th>Amallar</Th>
            </tr>
          </Thead>
          <Tbody>
            {links.length === 0 ? (
              <EmptyRow cols={5} message="Bog'lanishlar mavjud emas" />
            ) : (
              links.map((link) => (
                <Tr key={link.id}>
                  <Td className="font-medium">{link.boss_name}</Td>
                  <Td>{link.report_name}</Td>
                  <Td>{link.training_name ?? "–"}</Td>
                  <Td className="text-gray-500 text-sm">
                    {new Date(link.created_at).toLocaleDateString("uz-UZ")}
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleDelete(link.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Yangi bog'lanish"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Bekor qilish
            </Button>
            <Button onClick={handleAdd} loading={adding}>
              Qo'shish
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Boss search */}
          <div className="relative">
            <Input
              label="Boss (nazoratchi)"
              value={addForm.boss_query}
              onChange={(e) => {
                const q = e.target.value;
                setAddForm((f) => ({ ...f, boss_query: q, boss_id: "", boss_name: "" }));
                searchParticipants(q, "boss");
              }}
              placeholder="Ism bo'yicha qidiring..."
            />
            {addForm.boss_id && (
              <p className="text-xs text-green-600 mt-1">Tanlandi: {addForm.boss_name}</p>
            )}
            {bossResults.length > 0 && !addForm.boss_id && (
              <ul className="absolute z-10 bg-white border border-gray-200 rounded-lg shadow-md mt-1 w-full max-h-48 overflow-y-auto">
                {bossResults.map((p) => (
                  <li
                    key={p.id}
                    className="px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                    onClick={() => {
                      setAddForm((f) => ({
                        ...f,
                        boss_id: p.id,
                        boss_name: p.full_name,
                        boss_query: p.full_name,
                      }));
                      setBossResults([]);
                    }}
                  >
                    <span className="font-medium">{p.full_name}</span>
                    <span className="text-gray-400 ml-2 text-xs">{p.phone}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Report search */}
          <div className="relative">
            <Input
              label="Hisobot beruvchi (ishtirokchi)"
              value={addForm.report_query}
              onChange={(e) => {
                const q = e.target.value;
                setAddForm((f) => ({ ...f, report_query: q, report_id: "", report_name: "" }));
                searchParticipants(q, "report");
              }}
              placeholder="Ism bo'yicha qidiring..."
            />
            {addForm.report_id && (
              <p className="text-xs text-green-600 mt-1">Tanlandi: {addForm.report_name}</p>
            )}
            {reportResults.length > 0 && !addForm.report_id && (
              <ul className="absolute z-10 bg-white border border-gray-200 rounded-lg shadow-md mt-1 w-full max-h-48 overflow-y-auto">
                {reportResults.map((p) => (
                  <li
                    key={p.id}
                    className="px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                    onClick={() => {
                      setAddForm((f) => ({
                        ...f,
                        report_id: p.id,
                        report_name: p.full_name,
                        report_query: p.full_name,
                      }));
                      setReportResults([]);
                    }}
                  >
                    <span className="font-medium">{p.full_name}</span>
                    <span className="text-gray-400 ml-2 text-xs">{p.phone}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
