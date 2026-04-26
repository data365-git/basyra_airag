"use client";

import { PAGE_DEFS, type PageDef } from "@/lib/permissions";
import type { RolePermissions, PermAction } from "@/types";
import { cn } from "@/lib/utils";

const ALL_ACTIONS: PermAction[] = [
  "view",
  "create",
  "edit",
  "delete",
  "export",
  "conversations",
  "content",
  "broadcast",
  "settings",
];
const ACTION_LABELS: Record<PermAction, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  export: "Export",
  conversations: "Conversations",
  content: "Content",
  broadcast: "Broadcast",
  settings: "Settings",
};

function getVal(perms: RolePermissions, def: PageDef, action: PermAction): boolean | null {
  if (!def.actions.includes(action)) return null; // N/A
  if (def.page === "settings.users") return (perms.settings?.users as Record<string, boolean>)?.[action] ?? false;
  if (def.page === "settings.roles") return (perms.settings?.roles as Record<string, boolean>)?.[action] ?? false;
  const bucket = (perms as unknown as Record<string, Record<string, boolean>>)[def.page];
  return bucket?.[action] ?? false;
}

function setVal(perms: RolePermissions, def: PageDef, action: PermAction, value: boolean): RolePermissions {
  const p = JSON.parse(JSON.stringify(perms)) as RolePermissions;
  if (def.page === "settings.users") { p.settings.users[action as keyof typeof p.settings.users] = value; return p; }
  if (def.page === "settings.roles") { p.settings.roles[action as keyof typeof p.settings.roles] = value; return p; }
  (p as unknown as Record<string, Record<string, boolean>>)[def.page][action] = value;
  return p;
}

interface Props {
  permissions: RolePermissions;
  onChange?: (updated: RolePermissions) => void;
  readOnly?: boolean;
}

export function PermissionsTable({ permissions, onChange, readOnly = false }: Props) {
  const settingsDefs = PAGE_DEFS.filter((d) => d.parent === "settings");
  const topDefs = PAGE_DEFS.filter((d) => !d.parent);

  const toggleCell = (def: PageDef, action: PermAction) => {
    if (readOnly || !onChange) return;
    const cur = getVal(permissions, def, action);
    if (cur === null) return;
    onChange(setVal(permissions, def, action, !cur));
  };

  const toggleRow = (def: PageDef) => {
    if (readOnly || !onChange) return;
    const vals = def.actions.map((a) => getVal(permissions, def, a));
    const allOn = vals.every((v) => v === true);
    let p = permissions;
    for (const a of def.actions) p = setVal(p, def, a, !allOn);
    onChange(p);
  };

  const toggleAll = () => {
    if (readOnly || !onChange) return;
    const allOn = PAGE_DEFS.every((def) => def.actions.every((a) => getVal(permissions, def, a) === true));
    let p = permissions;
    for (const def of PAGE_DEFS) for (const a of def.actions) p = setVal(p, def, a, !allOn);
    onChange(p);
  };

  const allChecked = PAGE_DEFS.every((def) => def.actions.every((a) => getVal(permissions, def, a) === true));

  function renderRow(def: PageDef, indent = false) {
    const rowAllOn = def.actions.every((a) => getVal(permissions, def, a) === true);
    return (
      <tr key={def.page} className="border-b border-gray-100 hover:bg-gray-50">
        <td className="sticky left-0 bg-white hover:bg-gray-50 py-3 px-3 text-sm font-medium text-gray-800 whitespace-nowrap">
          {indent ? <span className="pl-5 text-gray-600">↳ {def.label}</span> : def.label}
        </td>
        {ALL_ACTIONS.map((action) => {
          const val = getVal(permissions, def, action);
          return (
            <td key={action} className="py-3 px-2 text-center">
              {val === null ? (
                <span className="text-gray-300 select-none">—</span>
              ) : (
                <input
                  type="checkbox"
                  checked={val}
                  onChange={() => toggleCell(def, action)}
                  disabled={readOnly}
                  className={cn(
                    "w-4 h-4 rounded text-blue-600 border-gray-300",
                    readOnly ? "cursor-default" : "cursor-pointer"
                  )}
                  style={{ minWidth: 44, minHeight: 44 }}
                />
              )}
            </td>
          );
        })}
        {/* All column */}
        <td className="py-3 px-2 text-center">
          <input
            type="checkbox"
            checked={rowAllOn}
            onChange={() => toggleRow(def)}
            disabled={readOnly}
            className={cn("w-4 h-4 rounded text-indigo-600 border-gray-300", readOnly ? "cursor-default" : "cursor-pointer")}
          />
        </td>
      </tr>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="border-b border-gray-200">
            <th className="sticky left-0 bg-gray-50 py-2.5 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
              Page
            </th>
            {ALL_ACTIONS.map((a) => (
              <th key={a} className="py-2.5 px-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {ACTION_LABELS[a]}
              </th>
            ))}
            <th className="py-2.5 px-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {readOnly ? "All" : (
                <label className="flex flex-col items-center gap-0.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded text-indigo-600 border-gray-300 cursor-pointer"
                  />
                  <span>All</span>
                </label>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {topDefs.map((def) => renderRow(def))}
          {/* Settings group header */}
          <tr className="border-b border-gray-100 bg-gray-50/60">
            <td colSpan={ALL_ACTIONS.length + 2} className="py-2 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Settings
            </td>
          </tr>
          {settingsDefs.map((def) => renderRow(def, true))}
        </tbody>
      </table>
    </div>
  );
}
