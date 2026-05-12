/**
 * E.164 phone normalization.
 *
 * Converts any string that looks like a phone number into canonical E.164
 * form ("+998901234567"). Throws if the result doesn't pass the basic regex.
 *
 * Rules applied in order:
 *   1. Strip all non-digit/non-plus chars (spaces, dashes, parentheses, …)
 *   2. Leading "00"  → "+"   (international prefix)
 *   3. 12-digit "998…" with no leading "+" → "+998…" (Uzbekistan)
 *   4. 11-digit "7…"  with no leading "+" → "+7…"    (Russia / Kazakh)
 *   5. Anything else with no "+" → prepend "+"
 *   6. Validate: /^\+[1-9]\d{7,14}$/
 */
export function normalizePhone(raw: string): string {
  if (!raw) throw new Error("Phone is empty");

  let d = raw.replace(/[^\d+]/g, "");

  // Step 2 — strip 00 international prefix
  if (d.startsWith("00")) d = "+" + d.slice(2);

  if (!d.startsWith("+")) {
    if (d.startsWith("998") && d.length === 12) {
      d = "+" + d;
    } else if (d.startsWith("7") && d.length === 11) {
      d = "+" + d;
    } else {
      // Step 5: unknown format — prepend "+" and let the regex below validate.
      // If the number is truly invalid, the validation throw below will surface it.
      // Log so we know when unexpected formats arrive.
      console.warn(`[phone] unrecognized format, prepending +: "${raw}" → "${d}"`);
      d = "+" + d;
    }
  }

  if (!/^\+[1-9]\d{7,14}$/.test(d)) {
    throw new Error(`Invalid phone: "${raw}" → "${d}"`);
  }

  return d;
}

/** Normalize or return null — useful for try/catch-free optional fields. */
export function tryNormalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.includes("@")) return null; // emails are not phones — skip normalize
  try { return normalizePhone(raw); }
  catch { return null; }
}
