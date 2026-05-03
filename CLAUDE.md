@AGENTS.md

---

# Project Reference

## 1. Project Summary

**Basyra LMSS** — a Learning Management System for corporate training programs in Uzbekistan. Tracks attendance via QR codes, manages homework assignments and grading, and runs a Telegram bot where participants query their status, submit homework, and ask AI-powered course Q&A. Includes a self-service portal for participants and supervisors, and a chatbot admin panel with inbox classification, ratings, and knowledge-base management.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2 (App Router, React 19) |
| Language | TypeScript 5 |
| Database | PostgreSQL via Prisma 7 |
| Styling | Tailwind CSS 4 (no UI library — custom components in `src/components/ui/`) |
| Auth | JWT via `jose` (bcryptjs for passwords) |
| Hosting | Railway (`railway up --detach`) |
| Telegram Bot | grammy 1.42 (webhook-based) |
| File Storage | Cloudflare R2 (`@aws-sdk/client-s3`) with local disk fallback |
| Offline | Dexie.js (IndexedDB) for queueing scans when network is down |
| AI / RAG | Separate Python FastAPI service (`../Basyra/Basyra AI chatbot/`), called via HTTP |
| Vector DB | pgvector on Railway — cohorts/lessons/chunks schema |
| Testing | Vitest |
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

## 4. Environment Variables

```bash
# Required — LMS
DATABASE_URL=          # PostgreSQL connection string (Railway)
JWT_SECRET=            # Staff auth token signing key
TELEGRAM_BOT_TOKEN=    # grammy webhook bot token
RAG_SERVICE_URL=       # URL of the Python FastAPI RAG service
GEMINI_API_KEY=        # Used by intentRouter + inboxClassifier fallback
OPENAI_API_KEY=        # Used for TTS

# Required — File storage (Cloudflare R2)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=         # Public base URL for stored files

# Required — Python RAG service (separate .env in Basyra AI chatbot/)
DATABASE_URL=          # Same Railway pgvector DB
GEMINI_API_KEY=
RAG_SECRET_TOKEN=      # Shared secret for internal API calls (redaction terms etc.)
```

---

## 5. Running the Project

```bash
# Install
npm install

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

# Deploy RAG service (run from its own directory)
cd "../Basyra/Basyra AI chatbot" && railway up --detach
```

---

## 6. Conventions & Patterns

### API serialization boundary
All HTTP responses use **`snake_case`** keys. Prisma models use `camelCase` internally.
Per-route serializer functions (`mapUser`, `serializeMaterial`, `serializeHw`, etc.) handle conversion.
**Never return a raw Prisma object from a route.** Always serialize explicitly — prevents field leakage.

### Timezone — always Asia/Tashkent (UTC+5, no DST)
Use `getTodayInTashkent()` from `src/lib/sessionWindow.ts` on the server.
Never use `new Date().toISOString().slice(0, 10)` — that gives UTC date, 5 hours behind.

### Homework date fields are plain strings
`dueDate`, `startDate`, `hardCloseAt` all stored as `"YYYY-MM-DD"` text, not `DateTime`.
Compare with string inequality: `today > homework.hardCloseAt`.

### Homework submission gate (three layers)
1. `acceptingSubmissions = false` → 403 (manual admin close)
2. `hardCloseAt` passed → 403 (absolute cutoff, no exceptions)
3. `allowLateSubmission = false` AND `dueDate` passed → 403 (soft deadline, no late allowed)
If `allowLateSubmission = true` and past `dueDate`, submission is accepted and marked `isLate = true`.

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
Don't short-circuit this chain.

### Bot cost logging
After every `askRag` or TTS call, call `logUsage()` from `src/lib/aiClient.ts` fire-and-forget. Writes to `BotUsageLog`.

### Inbox classifier (fire-and-forget)
After logging an incoming user message, call `classifyMessage(text)` from `inboxClassifier.ts` without awaiting. Saves to `InboxItem` table if kind is complaint/offer/lead (not question).

### Chatbot sidebar workspace
The sidebar has two modes — LMS and Bot workspace — toggled by `inBotWorkspace` (pathname starts with `/chatbot` or `/chat`). Workspace switcher links live in the lower section of `Sidebar.tsx`.

---

## 7. Important Notes

1. **`prisma generate` before `next build`** — the build script does this, but run it manually if you see "model not found" in `tsc --noEmit`.

2. **Migrations run on deploy** — `preDeployCommand` in `railway.toml` runs `prisma migrate deploy`. Add a new model locally with `npx prisma migrate dev --name <name>`, commit the migration SQL, and it deploys automatically. Failed migrations block the deploy (intentional).

3. **Next.js 16 App Router** — `params` in route handlers is `Promise<{...}>`. Always `const { id } = await params;`. Never destructure synchronously.

4. **`export const dynamic = "force-dynamic"`** — required on every GET route that reads from DB or auth cookies. Without it, Next.js may cache the response.

5. **Two separate Railway deployments** — LMS (this repo) and RAG service (`../Basyra/Basyra AI chatbot/`) deploy independently. Deploying one does not deploy the other.

6. **Portal auth vs. staff auth** — participants use `portalAuth.ts` (cookie: `portal_token`). Staff use `getUser.ts` (cookie: `token`). Never mix them.

7. **BigInt serialization** — `chatId` is `BigInt` in Prisma (Telegram IDs). Always `.toString()` before returning in JSON — `JSON.stringify` throws `TypeError` on BigInt.

8. **TelegramLink sync** — participants get a `TelegramLink` row on `/login`. If missing, they get "Telegram akkauntingiz ulanmagan". The portal calls `/api/portal/ensure-telegram-link` fire-and-forget on every load.

9. **RAG vector DB** — cohorts/lessons/chunks live in a pgvector schema on Railway. All cohorts must have `course_id` set or the RAG won't associate answers with a course.

10. **No time-based session gating** — never add clock-time checks for scan eligibility.

---

## Keeping This File Current

Update CLAUDE.md when something **structurally meaningful** changes:
- New feature area or major dependency added
- Folder structure or naming convention changed
- New required environment variable
- Deployment process changed

**Do NOT update for:** bug fixes, style changes, copy tweaks, or anything that wouldn't matter to someone reading the project for the first time.

---

## Working in Parallel

When making **independent** changes across multiple files, launch all Agent tool calls in a **single message** so they run concurrently. Do not serialize work that can be parallelized — one agent per independent change, all dispatched at once.

---

## Behavioral Guidelines

These rules reduce common LLM coding mistakes. They bias toward caution — use judgment on trivial tasks.

### 1. Think Before Coding

**Don't assume. Surface tradeoffs. Ask when unclear.**

- State your assumptions explicitly before implementing.
- If multiple interpretations exist, name them — don't pick silently.
- If a simpler approach exists, say so and push back.
- If something is genuinely unclear, stop and ask. Don't guess.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "extensibility" that wasn't requested.
- No error handling for scenarios that can't happen.
- If you wrote 200 lines and it could be 50, rewrite it.

> Ask: "Would a senior engineer call this overcomplicated?" If yes — simplify.

### 3. Surgical Changes

**Touch only what you must.**

When editing existing code:
- Don't improve adjacent code, comments, or formatting unless asked.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you spot unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports, variables, and functions that **your** changes made unused.
- Don't remove pre-existing dead code unless explicitly asked.

> Test: every changed line should trace directly to the user's request.

### 4. Verify Before Reporting Done

**Define success criteria upfront. Loop until verified.**

For multi-step tasks, state a brief plan first:
```
1. [What] → verify: [how to confirm it worked]
2. [What] → verify: [how to confirm it worked]
3. [What] → verify: [how to confirm it worked]
```

Run the check before saying "done." If you can't verify (e.g. needs a browser), say so explicitly and describe what the user should check.

---

**These guidelines are working when:** diffs are clean, rewrites are rare, and questions come before implementation — not after.
