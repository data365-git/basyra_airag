/**
 * Uzbek date formatting helpers — ALWAYS Tashkent time (UTC+5, no DST).
 *
 * Use these for every user-facing date in the UI. Never reach for
 * `toLocaleDateString` (locale drift) or `toISOString().slice(0,10)`
 * (UTC, off by 5 hours after midnight Tashkent).
 *
 * Server-side date math (e.g. queries on Session.sessionDate) should keep
 * using `getTodayInTashkent()` from `src/lib/sessionWindow.ts`.
 */

const UZ_MONTHS = [
  "Yanvar", "Fevral", "Mart",     "Aprel",   "May",    "Iyun",
  "Iyul",   "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr",
];

/** Shift a Date into Tashkent and return a "YYYY-MM-DD" string. */
function toTashkentISODate(d: Date): string {
  // +5h offset, no DST
  return new Date(d.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Format a date as "17 Aprel 2026".
 * Accepts:
 *   - "YYYY-MM-DD" string (e.g. Session.sessionDate, Homework.dueDate)
 *   - ISO datetime string (e.g. submittedAt)
 *   - Date object
 *   - null/undefined → "—"
 */
export function fmtUzDate(input: string | Date | null | undefined): string {
  if (input === null || input === undefined || input === "") return "—";

  let ymd: string;
  if (typeof input === "string") {
    // Already "YYYY-MM-DD..." — take the first 10 chars
    ymd = input.slice(0, 10);
  } else {
    ymd = toTashkentISODate(input);
  }

  const parts = ymd.split("-");
  if (parts.length !== 3) return String(input);
  const [y, m, d] = parts.map((s) => Number(s));
  if (!y || !m || !d || m < 1 || m > 12) return String(input);

  return `${d} ${UZ_MONTHS[m - 1]} ${y}`;
}

/** Format as "17 Aprel 2026, 14:30" — for timestamps with meaningful time. */
export function fmtUzDateTime(input: string | Date | null | undefined): string {
  if (input === null || input === undefined || input === "") return "—";
  const dt = typeof input === "string" ? new Date(input) : input;
  if (isNaN(dt.getTime())) return String(input);

  const tashkent = new Date(dt.getTime() + 5 * 60 * 60 * 1000);
  const datePart = fmtUzDate(tashkent.toISOString().slice(0, 10));
  const hh = String(tashkent.getUTCHours()).padStart(2, "0");
  const mm = String(tashkent.getUTCMinutes()).padStart(2, "0");
  return `${datePart}, ${hh}:${mm}`;
}

/** Tashkent time only — "14:30". */
export function fmtUzTime(input: string | Date | null | undefined): string {
  if (input === null || input === undefined || input === "") return "—";
  const dt = typeof input === "string" ? new Date(input) : input;
  if (isNaN(dt.getTime())) return String(input);
  const tashkent = new Date(dt.getTime() + 5 * 60 * 60 * 1000);
  const hh = String(tashkent.getUTCHours()).padStart(2, "0");
  const mm = String(tashkent.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Compact "17 Apr" for tight UI cells. */
export function fmtUzDateShort(input: string | Date | null | undefined): string {
  if (input === null || input === undefined || input === "") return "—";
  const full = fmtUzDate(input);
  if (full === "—") return "—";
  // "17 Aprel 2026" → "17 Apr"
  const [d, month] = full.split(" ");
  return `${d} ${month.slice(0, 3)}`;
}
