@AGENTS.md

---

# Project Reference

## What This Project Is

**Basyra LMSS** — a Learning Management System built for corporate training programs in Uzbekistan. It tracks attendance via QR codes, manages homework assignments and grading, and runs a Telegram bot that participants use for status queries, homework submission, and AI-powered course Q&A. There is also a self-service portal for participants and supervisors.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2 (App Router, React 19) |
| Language | TypeScript 5 |
| Database | PostgreSQL via Prisma 7 |
| Styling | Tailwind CSS 4 (no UI library — custom components in `src/components/ui/`) |
| Telegram Bot | grammy 1.42 (webhook-based) |
| Auth | JWT via `jose` (bcryptjs for passwords) |
| File Storage | Cloudflare R2 (`@aws-sdk/client-s3`) with local disk fallback |
| Offline | Dexie.js (IndexedDB) for queueing scans when network is down |
| AI / RAG | Separate Python FastAPI service (in `Basyra/Basyra AI chatbot/`), called via HTTP |
| Testing | Vitest |
| Deployment | Railway (`railway up`), migrations run automatically at startup |
| i18n | Custom JSON files (`uz` / `en` / `ru`) via `LanguageProvider` context |

---

## Folder Structure

```
src/
├── app/
│   ├── (auth)/login/           # Staff login page
│   ├── (dashboard)/            # Dashboard layout group (staff-facing admin)
│   │   ├── scanner/            # QR attendance scanner (PWA, offline-capable)
│   │   ├── trainings/          # Training CRUD + sessions + homework
│   │   ├── participants/       # Participant CRUD + QR codes + activity
│   │   ├── homeworks/          # Homework management
│   │   ├── reports/            # Attendance & performance reports
│   │   ├── ai-reviews/         # AI-generated homework review curator
│   │   ├── chatbot/            # 7-tab admin panel (Overview, Conversations, Users, Content, Feedback, Broadcast, Settings)
│   │   └── settings/           # Roles, users, categories, translations, grading, system
│   ├── portal/                 # Participant & supervisor self-service portal
│   │   ├── me/                 # Participant scorecard + homework + materials
│   │   └── team/               # Supervisor hierarchy view
│   ├── api/                    # All API route handlers (70+ endpoints)
│   ├── article/[id]/           # Long-form AI answer viewer (linked from Telegram)
│   └── offline/                # Offline placeholder page
│
├── components/
│   ├── ui/                     # Base components (Button, Card, Modal, Table, Badge, Input, Skeleton…)
│   ├── layout/                 # Shell, Sidebar, Header, BottomNav, MobileHeader
│   ├── scanner/                # QRScanner, ScanResult, ScannerBottomSheet, ConfirmOverrideSheet
│   ├── dashboard/              # StatsCard, TodaysSessions, AlertsPanel, ActivityFeed
│   └── roles/                  # PermissionsTable, RoleModal
│
├── lib/
│   ├── prisma.ts               # Prisma client singleton
│   ├── getUser.ts              # Extract StaffUser from JWT cookie
│   ├── portalAuth.ts           # Participant portal JWT
│   ├── permissions.ts          # hasPermission(), isSuperadmin(), PAGE_DEFS
│   ├── sessionWindow.ts        # getTodayInTashkent(), getSessionState() — no time-gating
│   ├── lateDetection.ts        # computeAttendanceStatus() — present vs. late
│   ├── gradingPolicy.ts        # Grading policy (5-min cached) + timeliness % computation
│   ├── scorecard.ts            # getParticipantScorecard() — combined attendance+HW+activity
│   ├── aiClient.ts             # RAG service HTTP client + logUsage() (fire-and-forget)
│   ├── intentRouter.ts         # 3-layer intent classification (keywords → Gemini Flash)
│   ├── bot.ts                  # grammy bot initialization
│   ├── bot/handlers.ts         # All Telegram command + message handlers
│   ├── bot/ui.ts               # Telegram keyboards, message logging helpers
│   ├── bot/notify.ts           # Send notifications (individual, bulk, supervisors)
│   ├── r2Upload.ts             # Cloudflare R2 upload
│   ├── localUpload.ts          # Local disk fallback for uploads
│   ├── db/offline.ts           # Dexie.js IndexedDB (queueScan for offline attendance)
│   ├── qr/generate.ts          # QR code generation
│   └── export/excel.ts         # Excel export (attendance, bulk QR PDFs)
│
├── types/index.ts              # All shared TypeScript types (snake_case API shapes)
├── i18n/                       # uz.json, en.json, ru.json
├── hooks/                      # useAuth, usePermission, useOnlineStatus, useOfflineSync
└── providers/LanguageProvider  # i18n context
```

The RAG/AI service lives separately at `../Basyra/Basyra AI chatbot/` (Python, its own Railway deployment). The LMS calls it over HTTP.

---

## Key Patterns & Conventions

### API serialization boundary
All HTTP responses use **`snake_case`** keys. Prisma models use `camelCase` internally.
Per-route serializer functions (`mapUser`, `serializeMaterial`, `mapHw`, etc.) handle conversion.
**Never return a raw Prisma object from a route.** Always serialize explicitly — prevents field leakage.

### Timezone — always Asia/Tashkent (UTC+5, no DST)
Use `getTodayInTashkent()` from `src/lib/sessionWindow.ts` on the server.
Never use `new Date().toISOString().slice(0, 10)` — that gives UTC date, which is 5 hours behind.

### Session dates are plain strings
`Session.sessionDate` is stored as `"YYYY-MM-DD"` text, not a Prisma `DateTime`.
Query with string equality: `where: { sessionDate: "2026-04-12" }`.

### No time-based scan window
A session is scannable any time on its calendar day (Tashkent date). `getSessionState()` returns `active` when today === sessionDate regardless of clock time.
`Training.scanWindowBefore` / `scanWindowAfter` exist in schema but are **not enforced** — don't add logic that gates scans on them.

### Permission system
`hasPermission(user, page, action)` from `src/lib/permissions.ts`. Superadmins bypass all checks.
Permission pages: `"trainings" | "participants" | "scanner" | "reports" | "chatbot" | "settings.users" | "settings.roles" | "settings.categories" | "settings.translations"`.

### Grading — timeliness multiplier
`Homework.latePenaltyPercent` is a **display-only hint** — it does NOT affect grade calculations.
Real grading is in `src/lib/gradingPolicy.ts`: on-time bonus, same-day %, daily late penalty, floor %. The `GradingPolicy` table has one row, cached for 5 min.

### Prisma new models — defensive cast pattern
If a new Prisma model hasn't been regenerated into the client yet (e.g., during a deploy), cast to `(prisma as any).modelName?.` to prevent TS errors. Fix properly by ensuring `prisma generate` runs before `next build` (already in `package.json` build script).

### Scanner page state machine
`src/app/(dashboard)/scanner/page.tsx` uses `ScannerUIState`:
`loading | auto_ready | needs_training | needs_session | no_session_today | no_active_training | override`
`renderSelectorBar()` is a `switch` on this state — exactly one UI path renders.
Do not add conditional rendering outside this switch.

### Service worker — intentionally disabled
`next-pwa` is set to `disable: true` in `next.config.ts`. It causes iOS standalone-PWA cache conflicts that crash the scanner after deploys.
Offline scanning still works via IndexedDB (`queueScan` in `src/lib/db/offline.ts`).
Do not re-enable the SW without replacing `next-pwa` with a custom worker.

### i18n
All user-facing strings go through `t()` from `LanguageProvider`. If a key is missing from the JSON file, `t()` returns the raw key string — so "chatbot.tab_overview" appearing literally in the UI means the key is missing from `src/i18n/*.json`.

### Bot cost logging
After every `askRag` or TTS call, call `logUsage()` from `src/lib/aiClient.ts` fire-and-forget. It writes to `BotUsageLog`.

---

## How to Run

```bash
# Development
npm run dev

# Build (runs prisma generate first, then next build)
npm run build

# Production start (runs prisma migrate deploy first, then next start)
npm start

# Run tests
npm test
npm run test:watch

# Seed database
npm run seed

# Deploy to Railway
railway up --detach
```

**Environment variables needed:** `DATABASE_URL`, `JWT_SECRET`, `TELEGRAM_BOT_TOKEN`, `RAG_SERVICE_URL`, `R2_*` bucket keys, `GEMINI_API_KEY`, `OPENAI_API_KEY`.

---

## Important Things to Keep in Mind

1. **`prisma generate` must run before `next build`** — the `build` script already does this, but if you run `tsc --noEmit` directly and see "model not found" errors, run `npx prisma generate` first.

2. **Migrations run on boot** — `prestart: npx prisma migrate deploy`. When you add a new Prisma model, create a migration with `npx prisma migrate dev --name <name>` locally, commit the migration SQL file, and it deploys automatically.

3. **Next.js 16 App Router breaking change** — dynamic route `params` is now `Promise<{...}>`. Always: `const { id } = await params;`. Never destructure params synchronously.

4. **`export const dynamic = "force-dynamic"`** — add this to any GET route handler that reads from the DB or auth cookies. Without it, Next.js may cache the response.

5. **Two separate deployments** — the LMS (this repo) and the RAG service (`Basyra/Basyra AI chatbot/`) are separate Railway services. Deploying one does not deploy the other. The RAG service has no git remote; deploy it with `railway up --detach` from inside its directory.

6. **No time-based session gating** — sessions are always scannable on their calendar date. Do not add clock-time checks for scan eligibility.

7. **Portal auth vs. staff auth** — participants log in via `portalAuth.ts` (separate JWT cookie `portal_token`). Staff log in via `getUser.ts` (cookie `token`). Don't mix them.

8. **TelegramLink sync** — participants get a `TelegramLink` row when they run `/login` in the Telegram bot. If the row is missing (deleted, or user linked on a different DB), they get "Telegram akkauntingiz ulanmagan" errors. The portal calls `/api/portal/ensure-telegram-link` fire-and-forget on every load to re-sync.

---

# Project Conventions

## Timezone
All date logic uses **Asia/Tashkent (UTC+5, no DST)**.
Use `getTodayInTashkent()` from `src/lib/sessionWindow.ts` to get today's date
string on the server — never use `new Date().toISOString().slice(0,10)` (gives UTC date).

## Session dates
`Session.sessionDate` is stored as a **plain `String` ("YYYY-MM-DD")`, not a Prisma
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

## API serialization boundary
All HTTP responses use **`snake_case`** JSON keys. Prisma models use `camelCase` internally.
The conversion happens in per-route serializer functions (e.g., `mapUser`, `serializeMaterial`,
`mapHw`) — **never** return a raw Prisma object directly from a route. When adding a new field,
add it to the serializer explicitly. This prevents accidental leaking of internal fields.

## Dead schema fields (documented, not removed)
- `Training.scanWindowBefore` / `scanWindowAfter` — serialized in `GET /api/trainings/:id`
  but **not enforced** — per CLAUDE.md there is no time-based scan window. Do not add logic
  that reads these for scan gating.
- `Homework.latePenaltyPercent` — display-only hint shown in the homework detail UI.
  Does **not** affect any grade calculation. Do not wire it into scoring without a product decision.

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
