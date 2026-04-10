import Dexie, { type Table } from "dexie";
import type { PendingScan } from "@/types";

class AttendanceDB extends Dexie {
  pendingScans!: Table<PendingScan>;

  constructor() {
    super("AttendanceDB");
    this.version(1).stores({
      pendingScans: "++id, sessionId, qrToken, scannedAt, synced",
    });
  }
}

export const db = typeof window !== "undefined" ? new AttendanceDB() : null;

export async function queueScan(scan: Omit<PendingScan, "id" | "synced">) {
  if (!db) return;
  await db.pendingScans.add({ ...scan, synced: false });
}

export async function getPendingScans(): Promise<PendingScan[]> {
  if (!db) return [];
  return db.pendingScans.where("synced").equals(0).toArray();
}

export async function markSynced(ids: number[]) {
  if (!db) return;
  await db.pendingScans.where("id").anyOf(ids).modify({ synced: true });
}

export async function clearSynced() {
  if (!db) return;
  await db.pendingScans.where("synced").equals(1).delete();
}

export async function getPendingCount(): Promise<number> {
  if (!db) return 0;
  return db.pendingScans.where("synced").equals(0).count();
}
