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
