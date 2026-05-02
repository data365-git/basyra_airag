@AGENTS.md

---

# Project Reference

## 1. Project Summary

**Basyra LMSS** — a Learning Management System for corporate training programs in Uzbekistan. Tracks attendance via QR codes, manages homework assignments and grading, and runs a Telegram bot where participants query their status, submit homework, and ask AI-powered course Q&A. Includes a self-service portal for participants and supervisors, and a chatbot admin panel with inbox classification, ratings, and knowledge-base management.

---

## 2. Tech Stack

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
| AI / RAG | Separate Python FastAPI service (`../Basyra/Basyra AI chatbot/`), called via HTTP |
| Vector DB | pgvector on Railway — cohorts/lessons/chunks schema |
| Testing | Vitest |
| Deployment | Railway (`railway up`); migrations run via `preDeployCommand` in `railway.toml` |
| i18n | Custom JSON files (`uz` / `en` / `ru`) in `src/i18n/` via `LanguageProvider` context |

---

## 3. Folder Structure

```
src/
├── app/
│   ├── (auth)/login/           # Staff login page
│   ├── (dashboard)/            # Staff-facing admin panel
│   │   ├── scanner/            # QR attendance scanner (PWA, offline-capable)
│   │   ├── trainings/          # Training CRUD + sessions + homework
│   │   ├── participants/       # Participant CRUD + QR codes + activity
│   │   ├── homeworks/          # Homework list + inline edit modal
│   │   ├── reports/            # Attendance & performance reports
│   │   ├── ai-reviews/         # AI-generated homework review curator
│   │   ├── chat/               # Unified staff↔participant chat (multi-select broadcast)
│   │   ├── chatbot/            # Bot workspace admin panel
│   │   │   ├── page.tsx        # Overview
│   │   │   ├── conversations/  # Chat threads
│   │   │   ├── users/          # Bot users
│   │   │   ├── content/        # Knowledge base (Bilim bazasi)
│   │   │   ├── feedback/       # Feedback Kanban (4 status columns)
│   │   │   ├── ratings/        # 1★–2★ quality review drilldown
│   │   │   ├── inbox/          # Classified inbox (Shikoyatlar/Takliflar/Leadlar)
│   │   │   ├── broadcast/      # Legacy broadcast (being replaced by chat multi-select)
│   │   │   └── settings/       # Bot settings + redaction terms (Maxfiy nomlar)
│   │   └── settings/           # Roles, users, categories, translations, grading, system
│   ├── portal/                 # Participant & supervisor self-service portal
│   │   ├── me/                 # Participant scorecard + homework + materials
│   │   └── team/               # Supervisor hierarchy + employee detail view
│   ├── api/                    # All API route handlers (80+ endpoints)
│   ├── article/[id]/           # Long-form AI answer viewer (linked from Telegram)
│   └── offline/                # Offline placeholder page
│
├── components/
│   ├── ui/                     # Base components (Button, Card, Modal, Table, Badge…)
│   ├── layout/                 # Shell, Sidebar, Header, BottomNav, MobileHeader
│   ├── scanner/                # QRScanner, ScanResult, ScannerBottomSheet
│   ├── dashboard/              # StatsCard, TodaysSessions, AlertsPanel, ActivityFeed
│   └── roles/                  # PermissionsTable, RoleModal
│
├── lib/
│   ├── prisma.ts               # Prisma client singleton
│   ├── getUser.ts              # Extract StaffUser from JWT cookie
│   ├── portalAuth.ts           # Participant portal JWT (cookie: portal_token)
│   ├── permissions.ts          # hasPermission(), isSuperadmin(), PAGE_DEFS
│   ├── sessionWindow.ts        # getTodayInTashkent(), getSessionState()
│   ├── lateDetection.ts        # computeAttendanceStatus() — present vs. late
│   ├── gradingPolicy.ts        # Grading policy (5-min cached) + timeliness %
│   ├── scorecard.ts            # getParticipantScorecard() — combined attendance+HW
│   ├── aiClient.ts             # RAG HTTP client + stripBannedOpener + dedupeResponse + applyRedactionTerms
│   ├── intentRouter.ts         # 3-layer intent classification (keywords → Gemini Flash)
│   ├── inboxClassifier.ts      # Keyword + Gemini classifier for complaint/offer/lead
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
├── i18n/                       # uz.json, en.json, ru.json (all three must stay in sync)
├── hooks/                      # useAuth, usePermission, useOnlineStatus, useOfflineSync
└── providers/LanguageProvider  # i18n context

../Basyra/Basyra AI chatbot/    # Separate Python FastAPI RAG service (own Railway deploy)
```

---

## 4. Conventions & Patterns

### API serialization boundary
All HTTP responses use **`snake_case`** keys. Prisma models use `camelCase` internally.
Per-route serializer functions (`mapUser`, `serializeMaterial`, `mapHw`, `serializeHw`, etc.) handle conversion.
**Never return a raw Prisma object from a route.** Always serialize explicitly — prevents field leakage.

### Timezone — always Asia/Tashkent (UTC+5, no DST)
Use `getTodayInTashkent()` from `src/lib/sessionWindow.ts` on the server.
Never use `new Date().toISOString().slice(0, 10)` — that gives UTC date, 5 hours behind.

### Session dates are plain strings
`Session.sessionDate` stored as `"YYYY-MM-DD"` text, not `DateTime`.
Query with string equality: `where: { sessionDate: "2026-04-12" }`.

### No time-based scan window
A session is scannable any time on its calendar day. `getSessionState()` returns `active` when today === sessionDate regardless of clock time. `Training.scanWindowBefore` / `scanWindowAfter` exist in schema but are **not enforced**.

### Permission system
`hasPermission(user, page, action)` from `src/lib/permissions.ts`. Superadmins bypass all checks.
Pages: `"trainings" | "participants" | "scanner" | "reports" | "chatbot" | "settings.users" | "settings.roles" | "settings.categories" | "settings.translations"`.

### Grading — timeliness multiplier
`Homework.latePenaltyPercent` is a **display-only hint** — it does NOT affect grade calculations.
Real grading is in `src/lib/gradingPolicy.ts`. `GradingPolicy` table has one row, cached 5 min.

### Prisma new models — defensive cast pattern
If a new model hasn't been regenerated yet, use `(prisma as any).modelName?.` to avoid TS errors.
Fix properly by ensuring `prisma generate` runs before `next build` (already in build script).

### Scanner page state machine
`src/app/(dashboard)/scanner/page.tsx` uses `ScannerUIState`:
`loading | auto_ready | needs_training | needs_session | no_session_today | no_active_training | override`
`renderSelectorBar()` is a `switch` — exactly one UI path renders. No conditional rendering outside this switch.

### Service worker — intentionally disabled
`next-pwa` set to `disable: true` in `next.config.ts`. Causes iOS cache conflicts that crash the scanner.
Offline scanning works via IndexedDB (`queueScan`). Do not re-enable without replacing `next-pwa`.

### i18n
All user-facing strings go through `t()` from `LanguageProvider`. Missing keys render as the raw key string. When adding new UI text, add the key to all three files: `uz.json`, `en.json`, `ru.json`.

### Bot message pipeline (aiClient.ts)
After RAG returns, response goes through:
`joinAnswerParts → dedupeResponse → stripBannedOpener → await applyRedactionTerms`
Each step is independently tested. Don't short-circuit this chain.

### Bot cost logging
After every `askRag` or TTS call, call `logUsage()` from `src/lib/aiClient.ts` fire-and-forget. Writes to `BotUsageLog`.

### Inbox classifier (fire-and-forget)
After logging an incoming user message, call `classifyMessage(text)` from `inboxClassifier.ts` without awaiting. Saves to `InboxItem` table if kind is complaint/offer/lead (not question).

### Chatbot sidebar workspace
The sidebar has two modes — LMS and Bot workspace — toggled by `inBotWorkspace` (pathname starts with `/chatbot` or `/chat`). Workspace switcher links live in the lower section of `Sidebar.tsx`.

---

## 5. Running the Project

```bash
# Development
npm run dev

# Build (runs prisma generate first, then next build)
npm run build

# Production start
npm start

# Tests
npm test
npm run test:watch

# Seed database
npm run seed

# Deploy LMS to Railway
railway up --detach

# Deploy RAG service (from its own directory)
cd "../Basyra/Basyra AI chatbot" && railway up --detach
```

**Environment variables needed:** `DATABASE_URL`, `JWT_SECRET`, `TELEGRAM_BOT_TOKEN`, `RAG_SERVICE_URL`, `R2_*` bucket keys, `GEMINI_API_KEY`, `OPENAI_API_KEY`.

---

## 6. Important Notes

1. **`prisma generate` before `next build`** — the build script does this, but run it manually if you see "model not found" in `tsc --noEmit`.

2. **Migrations run on deploy** — `preDeployCommand` in `railway.toml` runs `prisma migrate deploy`. Add a new model locally with `npx prisma migrate dev --name <name>`, commit the migration SQL, and it deploys automatically. Failed migrations block the deploy (intentional).

3. **Next.js 16 App Router** — `params` in route handlers is `Promise<{...}>`. Always `const { id } = await params;`. Never destructure synchronously.

4. **`export const dynamic = "force-dynamic"`** — required on every GET route that reads from DB or auth cookies. Without it, Next.js may cache the response.

5. **Two separate Railway deployments** — LMS (this repo) and RAG service (`../Basyra/Basyra AI chatbot/`) deploy independently. Deploying one does not deploy the other.

6. **Portal auth vs. staff auth** — participants use `portalAuth.ts` (cookie: `portal_token`). Staff use `getUser.ts` (cookie: `token`). Never mix them.

7. **BigInt serialization** — `chatId` is `BigInt` in Prisma (Telegram IDs). Always `.toString()` before returning in JSON — `JSON.stringify` throws `TypeError` on BigInt.

8. **TelegramLink sync** — participants get a `TelegramLink` row on `/login`. If missing, they get "Telegram akkauntingiz ulanmagan". The portal calls `/api/portal/ensure-telegram-link` fire-and-forget on every load.

9. **RAG vector DB** — cohorts/lessons/chunks live in a pgvector schema on Railway. All cohorts must have `course_id` set or the RAG won't associate answers with a course. Use the `courses` + `cohorts` + `lessons` + `chunks` tables.

10. **No time-based session gating** — never add clock-time checks for scan eligibility.

---

## Updating This File

Review changes made. **Only update CLAUDE.md if something structurally meaningful changed** — new feature area, new dependency, changed convention, new folder.

Do NOT update for:
- Minor bug fixes or small tweaks
- Styling or copy changes
- Anything that wouldn't matter to someone understanding the project for the first time

Keep this file clean and focused on what actually matters.

---

## Parallel Agents

When making independent changes across multiple files, launch multiple subagents in parallel by including **ALL Task tool calls in a single message**. Do not serialize independent edits — spawn one subagent per independent change and run them simultaneously.

---

## Behavioral Guidelines (Karpathy Rules)

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that YOUR changes made unused.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
