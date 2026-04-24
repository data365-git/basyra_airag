@AGENTS.md

# Project Conventions

## Timezone
All date logic uses **Asia/Tashkent (UTC+5, no DST)**.
Use `getTodayInTashkent()` from `src/lib/sessionWindow.ts` to get today's date
string on the server — never use `new Date().toISOString().slice(0,10)` (gives UTC date).

## Session dates
`Session.sessionDate` is stored as a **plain `String` ("YYYY-MM-DD")**, not a Prisma
`DateTime`. Query by string equality: `where: { sessionDate: "2026-04-12" }`.
The migration that converted `DATE → TEXT` also corrected existing UTC-offset dates
to their correct Tashkent-local values.

## Session scan window
There is **no time-based scan window**. A session is scannable any time on its
calendar day (Tashkent). `getSessionState()` returns `active` when today's date
matches `sessionDate`, regardless of clock time. Late vs. present is determined
separately by `computeAttendanceStatus()` in `src/lib/lateDetection.ts`.

## Service worker
The PWA service worker is **intentionally disabled** (`disable: true` in `next.config.ts`).
`next-pwa 5.6.0` causes iOS standalone-PWA cache conflicts that crash the scanner
after any deploy. Offline scanning still works via IndexedDB (`queueScan` in
`src/lib/db/offline.ts`) — it does not use the service worker.
Do not re-enable the SW without replacing `next-pwa` with a custom worker.

## Scanner page
`src/app/(dashboard)/scanner/page.tsx` uses an explicit `ScannerUIState` type
(`loading | auto_ready | needs_training | needs_session | no_session_today |
no_active_training | override`). `renderSelectorBar()` is a `switch` on this
state — exactly one UI path renders. Do not add conditional rendering outside
this switch.

# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
