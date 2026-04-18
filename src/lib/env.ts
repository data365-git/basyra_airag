/**
 * Environment variable validation.
 *
 * `validateEnv()` is called once at server startup via src/instrumentation.ts.
 * It uses zod to assert required vars and performs a "all-or-nothing" check
 * on optional integration groups (R2, etc.) so partial misconfig crashes fast
 * rather than failing silently at feature-use time.
 */
import { z } from "zod";

// ─── Required vars — app literally cannot work without these ─────────────────

const requiredSchema = z.object({
  DATABASE_URL:        z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET:          z.string().min(20, "JWT_SECRET must be ≥ 20 chars"),
  TELEGRAM_BOT_TOKEN:  z.string().min(10, "TELEGRAM_BOT_TOKEN is required"),
});

// ─── R2 group — optional, but must be ALL present or ALL absent ──────────────

export const R2_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_URL",
] as const;

export type R2Key = (typeof R2_KEYS)[number];

/** Returns the subset of R2 env var names that are currently unset. */
export function r2MissingKeys(): R2Key[] {
  return R2_KEYS.filter((k) => !process.env[k]) as R2Key[];
}

/** True when every R2 env var is set. */
export function r2Configured(): boolean {
  return r2MissingKeys().length === 0;
}

// ─── Startup validator (called from instrumentation.ts once at boot) ─────────

export function validateEnv(): void {
  // 1. Required vars — crash with a clear list if any are absent
  const result = requiredSchema.safeParse(process.env);
  if (!result.success) {
    const lines = result.error.issues
      .map((i) => `  ✗  ${String(i.path[0])}: ${i.message}`)
      .join("\n");
    fatalEnv(
      "Required environment variables are missing or invalid",
      lines,
    );
  }

  // 2. R2 — partial config is always a misconfiguration (not a deliberate choice)
  const present = R2_KEYS.filter((k) => process.env[k]);
  const missing  = r2MissingKeys();

  if (present.length > 0 && missing.length > 0) {
    const lines =
      `  Present : ${present.join(", ")}\n` +
      `  Missing : ${missing.join(", ")}`;
    fatalEnv("R2 is partially configured — set all 5 vars or none", lines);
  }

  if (missing.length === R2_KEYS.length) {
    console.warn("[env] ⚠  R2 not configured — file uploads will be disabled");
  } else {
    console.log(`[env] ✓  R2 OK  bucket=${process.env.R2_BUCKET_NAME}`);
  }

  console.log("[env] ✓  Required vars OK");
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function fatalEnv(title: string, detail: string): never {
  const border = "═".repeat(60);
  console.error(`\n╔${border}╗\n║  [env] FATAL — ${title}\n╠${border}╣\n${detail}\n╚${border}╝\n`);
  process.exit(1);
}
