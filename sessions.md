# Session — 2026-05-18 · Basyra bot diagnosis & full fix

## Initial problem

Bot returning `"AI yordamchim hozir band. Savolingizni murabbiyga yetkazaman 🙏"` (the FALLBACK_MESSAGE) for user queries. Earlier in the day, also returning `"Bu shaxs haqida kurs materiallarida ma'lumot topilmadi"` for person-name queries (abdulloh, Abdulboriy, Akbar aka) even though the chunks were present in pgvector.

## Chain of root causes discovered (in order)

1. **OpenAI account exhausted** — the Python RAG service (`basyra-ai-bot`) ran out of credits, returning 500 on every `/ask` call. *Pre-existing.*

2. **No Gemini fallback at the time of failure** — the original `aiClient.ts` only had a single code path (RAG → FALLBACK). Fixed earlier in the day with the saidumar branch rewrite (full Gemini RAG inside the LMS).

3. **Branch/deploy confusion** — `saidumar` branch had the fix but was being deployed via `railway up` (CLI), not via GitHub auto-deploy from `lasttry`. Local `D:\Data365 - work\BASYRA FULL\` copies were stale. The live code was on saidumar; lasttry was behind. The deploy directory is `C:\Users\User\AppData\Local\Temp\basyra_airag_live\` (on branch `saidumar`, tracking origin/saidumar).

4. **Gemini 429 (rate limit)** — the previous `GEMINI_API_KEY` hit free-tier limits with 40 students. Both `gemini-2.5-flash` (10 RPM) and `gemini-2.0-flash` (15 RPM) returned 429 simultaneously. Logs confirmed: `[aiClient] Gemini gemini-2.5-flash attempt 1 failed: 429` repeated 4× per request.
   - **Fix:** replaced with new key `AIzaSyDCuMSgYXmeLmmY7hwwnAqDYqpxxTyuRWE` (paid/higher quota) via Railway env var.

5. **Prompt conflict on person-name queries** — `ANSWER_BEHAVIOR_PROMPT`'s strict "Named entity precision (MUST follow)" section overrode the prepended "BIR MARTA eslatilsa = eslatildi" fix because it came LATER in the prompt. Specifically these two rules were forcing topilmadi:
   - "answer ONLY from chunks that explicitly mention that exact person's name"
   - "If no chunks mention the requested person by name, say so clearly"
   - **Fix:** rewrote the section to acknowledge spelling variants (Abdulboriy = Abdulboriy aka = Abdulbori aka) and brief mentions. Only say topilmadi when name is **genuinely absent from ALL chunks**.

6. **Long Telegram answers were too long** — user requested smaller thresholds so Telegram shows short answers + PDF button instead of walls of text.

## All changes deployed this session

**Commit `70e8885` on saidumar (deployed via Railway up `50133eed`):**

| File | Change |
|------|--------|
| `src/lib/aiClient.ts` | Relaxed `Named entity precision` rules — name variants count, brief mentions count, "topilmadi" only when genuinely absent from all chunks |
| `src/lib/bot/handlers.ts` | `SHORT_ANSWER_LIMIT`: 600 → 400 |
| `src/lib/bot/handlers.ts` | `resolveLongAnswerLimit` default: 1800 → 1000, bounds 800-1800 → 400-3000 |
| `src/lib/bot/handlers.ts` | `chooseDeliveryType` now uses articleThreshold as direct→article cutoff (previously ignored under 4096 chars) |
| `src/lib/bot/handlers.ts` | "split" delivery type removed entirely (no more 1/2, 2/2 message chains) |
| `src/lib/bot/handlers.ts` | Direct delivery now creates a `LongAnswer` record on-the-fly and adds `📄 PDF o'qish` as 3rd button alongside Manba + Tinglash |
| `src/lib/bot/handlers.ts` | Article preview text: "Telegramda o'qish noqulay → PDF" (clearer) |

**Effective new delivery behavior:**
- ≤ 400 chars → text only (no buttons)
- 400 – 1000 chars → text + `📚 Manba` + `🔊 Tinglash` + `📄 PDF o'qish` (3 buttons)
- > 1000 chars → short preview "Telegramda o'qish noqulay" + `📖 To'liq o'qish` + `📚 Manba` + `📄 PDF yuklab olish` (3 buttons)

## Current production state (end of session)

- **LMS service:** `basyra_lmss` on Railway, deploy `50133eed` = SUCCESS, health 200
- **Branch deployed:** `saidumar` (commit `70e8885`)
- **GEMINI_API_KEY in Railway:** `AIzaSyDCuMSgYXmeLmmY7hwwnAqDYqpxxTyuRWE` (the new key)
- **Python RAG service:** still returns 500 (OpenAI dead), LMS falls back to Gemini direct — by design, this is fine
- **`lasttry` branch on GitHub:** still NOT merged with saidumar → if Railway auto-deploys from `lasttry`, it'll overwrite the fix. **Do not push to `lasttry` until saidumar is merged in.**

## Cost estimate (Gemini, 2 months)

At stated max usage (40 students × 10 q/day × 60 days = 24,000 questions):
- Per question: ~$0.001 (3000 in × $0.15/M + 1000 out × $0.60/M)
- **Two-month max: ~$24**
- **Realistic average: $12-18**
- **Recommended deposit: $20** on Google AI Studio billing

Safety: `chatbot.monthly_cost_cap_usd` setting blocks new requests once cap is hit. `BotUsageLog` table logs every call for visibility.

## Key files / refs

- Deploy directory: `C:\Users\User\AppData\Local\Temp\basyra_airag_live\` (on `saidumar`, tracking `origin/saidumar`)
- Repo: `data365-git/basyra_airag`
- LMS Railway project: `d6e910ad-1b98-450e-8e55-a2bab7947465`, service `f3f2f1ed-fbb7-4713-81c2-f5ce20d338c6`
- Domain: `https://basyralmss-production.up.railway.app`
- Debug endpoint: `GET /api/debug/rag-search?q=<query>&t=7be3cd66f415845c4c7d32ddc7ab2725`
- Stale local repos to avoid: `D:\Data365 - work\BASYRA FULL\*` (these are old `master` snapshots)

## Things to avoid next time

1. **Don't analyze stale local code first** — always pull live code from GitHub (saidumar branch) and check live Railway logs before theorizing.
2. **Don't push to `lasttry`** until saidumar is explicitly merged into it (Railway auto-deploys from lasttry).
3. **Don't `railway up` from `D:\Data365 - work\BASYRA FULL\*`** — those are stale master copies. Use `C:\Users\User\AppData\Local\Temp\basyra_airag_live\` instead.
4. **Check Gemini API quotas / billing first** when seeing FALLBACK_MESSAGE — it's almost always the answer (after OpenAI exhaustion).
5. **The Python RAG service is dead** — don't waste time trying to fix it. Gemini-direct path is now the primary.

---

# Session — 2026-05-19 → 2026-05-21 · Bot recovery + structural fixes

## Span

Three calendar days of debugging-and-shipping. Each section is a distinct incident; later sections assume the earlier ones already shipped.

---

## Part 1 — Login 500 and "Basyra | Yordamchi bot hozir band" diagnosis (2026-05-19)

### Initial reports

- Client reported HTTP **500** on `POST /api/auth/login` (three retries, all failed).
- `/api/translations` showed **401** (red herring — proxy gates that route behind the auth cookie, which couldn't be obtained without login).
- Bot users seeing `"AI yordamchim hozir band. Savolingizni murabbiyga yetkazaman 🙏"` for every question.

### What we initially thought (and ruled out)

| Hypothesis | Reality |
|---|---|
| bcryptjs v3 default-import broken | False — version installed Apr 10, login was working until recently |
| Stuck Prisma migration | False — `_prisma_migrations` showed all rows finished |
| Corrupted password hashes in `staff_users` | False — confirmed via read-only DB inspection: 14 users, all `$2b$…`, length 60 |
| Schema drift on `staff_users` | False — columns and constraints all match the Prisma model |

### Actual root cause

**Wrong-URL routing.** The client was logging into `https://basyra-admin-production.up.railway.app` (and/or `https://basyra-ai-bot-production.up.railway.app`), not the real LMS at `https://basyralmss-production.up.railway.app`. The `basyra-admin` and `basyra-ai-bot` services in the **basyra-ai-bot Railway project** were both deploying from `data365-git/basyra_lmss` (i.e. the Next.js LMS code), but their `DATABASE_URL` pointed at the project's own Postgres (`basyradb`) which does **not** have `staff_users` table. So Prisma's `findUnique({where:{username:...}})` raised `PrismaClientKnownRequestError P2021 (TableDoesNotExist)` → unhandled in `route.ts` → Next.js returned 500.

Proof captured from `basyra-ai-bot` deployment logs:

```
⨯ Error [PrismaClientKnownRequestError]:
Invalid `prisma.staffUser.findUnique()` invocation:
The table `public.staff_users` does not exist in the current database.
code: 'P2021', modelName: 'StaffUser'
```

Direct probes confirmed:
- `POST https://basyralmss-production.up.railway.app/api/auth/login` → clean 401 with bogus creds ✅
- `POST https://basyra-admin-production.up.railway.app/api/auth/login` → 500
- `POST https://basyra-ai-bot-production.up.railway.app/api/auth/login` → 500

### Architecture clarification (recorded for future Claude sessions)

| Component | Lives in | Purpose |
|---|---|---|
| LMS bot + webhook | `basyra_lmss` project / `basyra_lmss` service | Next.js, the working LMS |
| LMS Postgres (`staff_users`, `bot_messages`, etc.) | `basyra_lmss` project / `Postgres-ftPU` | Authoritative for staff + bot data |
| pgvector course chunks | `basyra-ai-bot` project / `Postgres` (`basyradb`) | The lesson chunks RAG searches |
| LMS → pgvector connection | `RAG_DATABASE_URL` on LMS service | Working |
| Python FastAPI RAG service | `basyra-ai-bot` project / `basyra-ai-bot` service | **DEAD — overwritten with Next.js LMS code via accidental `railway up` from the LMS dir** |
| `basyra-admin` service | `basyra-ai-bot` project | Also Next.js LMS (same misdeploy pattern) |

### Bot "hozir band" cause (independent of login)

Two-layer failure on the bot's AI path:

1. **Layer 1: RAG service down** (per architecture issue above). LMS calls `${RAG_SERVICE_URL}/ask` → 307 → `/login` → fallback path triggers.
2. **Layer 2: Gemini API key revoked.** The `GEMINI_API_KEY` env var on LMS had been **publicly exposed** (user pushed it to a repo or pasted somewhere indexed). Google's automated scanners detected the leak and auto-revoked the key. Logs showed:
   ```
   [aiClient] Gemini gemini-2.5-flash attempt 1 failed: 403
   [aiClient] Gemini gemini-2.0-flash attempt 1 failed: 403
   [aiClient] Gemini embed failed: 403
   ```
   All three of chat, fallback chat, and embedding returned **403 Forbidden** → with no Gemini, no fallback path → `FALLBACK_MESSAGE`.

### Fix

- **Logged-in path:** told user to point client at the correct URL. The two basyra-ai-bot project URLs returning 500 remain deferred (need RAG service restoration).
- **Bot AI path:** user rotated Gemini key in Cloud Console, updated `GEMINI_API_KEY` and `GOOGLE_TTS_API_KEY` env vars on `basyra_lmss` service.

### Railway env-var-change trap discovered

Changing env vars via Railway dashboard triggered an **auto-deploy from the connected GitHub source** — which is `data365-git/basyra_airag` → `master` branch. **Master is an orphan branch with no common ancestor to saidumar.** Master's `aiClient.ts` lacks the `askGeminiDirect` function entirely (no Gemini fallback path). So every env-var edit rolled the bot back to broken master code.

Detected via `railway deployment list --json`:
```
b027c1b6 SUCCESS  branch=master  commitHash=3ca8449  "fix: improve chatbot answer quality and reliability"
```

vs. the previous saidumar deploy:
```
50133eed REMOVED  cliMessage="name-variant matching + shorter delivery thresholds + PDF button"
   (no commitHash → CLI deploy from C:\Users\User\AppData\Local\Temp\basyra_airag_live)
```

**Countermeasure (still in place):** after every env-var change, immediately `railway up` from the saidumar dir to overwrite the master auto-deploy.

---

## Part 2 — Model cascade rewrite + embed unpolluting (2026-05-20)

### Two bugs found together

1. **Old cascade (`gemini-2.5-flash → gemini-2.0-flash`) had no path forward.** After the key rotation, the new Google Cloud project did NOT have paid billing → all Pro models 429'd, AND `gemini-2.0-flash` returned `"Quota exceeded for generate_content_free_tier_requests, limit: 0"`. So when `2.5-flash` hit a 503 overload, the cascade fell to 2.0-flash → 429 → `FALLBACK_MESSAGE`.

2. **Conversation memory was poisoning the pgvector embedding query.** `handlers.ts` builds the question via `buildConversationAwareQuestion(ragText, replyContext, memory)` which prepends up to 14 prior chat messages as `"Short-term conversation memory:\n...\n---\n\nNew user message: ${ragText}"`. This entire blob was passed to `embedQueryGemini`, so the embedding represented **chat history** instead of the current question. For bare-term queries like `utp`, pgvector returned chunks from past topics (L62/L72/L51) instead of USP lessons (L43/L45/L85).

### Model probing (testing what's actually available on the key)

Tested via `railway run` against `models?key=…&pageSize=200` and direct `:generateContent` calls. Findings on the new project's free tier:

| Model | Status |
|---|---|
| `gemini-3.0-pro` / `gemini-3.0-flash` (literal names) | **404 — don't exist** |
| `gemini-3-pro-preview`, `gemini-3.1-pro-preview`, `gemini-2.5-pro`, `gemini-pro-latest` | All **429 free-tier quota = 0** (Pro models require paid billing) |
| `gemini-3.5-flash` | ✅ 200 |
| `gemini-3-flash-preview` | ✅ 200 |
| `gemini-flash-latest` | ✅ 200 |
| `gemini-2.5-flash` | ✅ 200 |

**Decision:** Flash-only 3-tier cascade. To get Pro, billing must be enabled on the Google Cloud project owning `GEMINI_API_KEY`.

### Fixes shipped (commit `c316f1d` on saidumar, deploy `a080a453`)

**`src/lib/aiClient.ts`:**

1. New cascade:
   ```ts
   const GEMINI_CHAT_MODELS = [
     "gemini-3.5-flash",        // newest, primary
     "gemini-3-flash-preview",  // 3.0 Flash, secondary fallback
     "gemini-2.5-flash",        // proven stable, last-resort
   ] as const;
   ```
   2 attempts per model, first 2xx wins. On non-429 4xx, skip to next model.
2. `usedModel` typed as `typeof GEMINI_CHAT_MODELS[number]` so the for-loop can reassign across the union.
3. Embed-query unpolluting:
   ```ts
   const embedQuery = (() => {
     const marker = "New user message:";
     const idx = question.lastIndexOf(marker);
     return idx >= 0 ? question.slice(idx + marker.length).trim() : question;
   })();
   const vector = await embedQueryGemini(embedQuery);
   ```

### Bonus delta same session (commit `3c0370f`)

- Added `UTP` to `ABBR_EXPANSIONS` in `handlers.ts`.
- Simplified long-answer keyboard to `📚 Manba · 📄 PDF o'qish` (dropped `📖 To'liq o'qish` and `📄 PDF yuklab olish`).
- Direct-answer keyboard reordered to `📚 Manba · 📄 PDF o'qish · 🔊 Tinglash`.

### Verification

E2E test (`test_utp_e2e.cjs`, `test_utp_full.cjs`) via `railway run`:
- expansion: `utp` → `"UTP (unique selling proposition, noyob sotuv taklifi, уникальное торговое предложение)"`
- pgvector top-8: L85/L43/L85/L43/L45/L43/L43/L45 (sim 0.74–0.80) — all USP-related
- `gemini-3.5-flash` returned 200 on first attempt, full answer about USP

---

## Part 3 — Tester feedback: NOA single-path + comprehensive coverage (2026-05-21 morning)

### Feedback received

From tester Shakhzoda:
> `NOA uchun raqamlar yo'q bo'lsa nima qilsam bo'ladi?` → bot answered ONLY the "join another business" path. Shakhzoda noted that the lesson also teaches "if you don't have numbers, start measuring them" — bot missed it.

### Investigation findings

- **NOA is real** — chunk L80 literally says `"NO bu Number-Oriented Analysis"`. Not hallucination, just bare 3-letter "NOA" had weak embedding without expansion.
- **"Start measuring" passage exists** — L87 contains `"Qancha raqamlar ko'proroq o'lchalsa, shuncha bizda aniqroq bo'ladi. Endi tasavvur qilamiz, bizda mana shu raqamlar yo'q hech qaysi…"`. Sim 0.72 on the raw NOA query → ranked #11 in pgvector results → fell **below the old top-8 cutoff**.
- L41 chunk about "collect data while auditing" also ranked outside top-8.

### Fixes shipped (commit `e4e35f8` on saidumar, deploy `e82ec2c6`)

1. **`handlers.ts` ABBR_EXPANSIONS** — added course-specific methodology acronyms:
   ```ts
   [/\b(NOA|NO-HOW|NOHOW)\b/gi, "NOA / NO-HOW (Number-Oriented Analysis — Basyra kursida raqamlarga asoslangan audit/tahlil metodologiyasi)"],
   [/\bJoA\b/gi, "JoA (Job-Oriented Analysis, ish/vazifaga asoslangan tahlil)"],
   ```
2. **`aiClient.ts` top-K bumped 8 → 12** (both `searchPgvectorChunks` default and call site).
3. **`aiClient.ts` systemInstruction** — added explicit comprehensive-coverage rule:
   ```
   Agar savol "X yo'q bo'lsa nima qilsam bo'ladi?" yoki "X bo'lmasa qanday yondashish kerak?" kabi muqobil yo'llarni so'rasa, javobda kurs matnlarida tilga olingan BARCHA yo'llarni / strategiyalarni sanab bering — faqat bittasini emas… Agar matnlarda faqat bitta yo'l tilga olingan bo'lsa, faqat shu yo'lni bering — ammo o'zingiz qo'shimcha tavsiyalar uydirmang.
   ```

### Verification (immediately after deploy)

E2E test gave 2-path NOA answer: ① join another business, ② convert qualitative observations to numbers. **But the live Telegram bot still gave a single-path answer** when Shakhzoda retested. Investigation in Part 4.

---

## Part 4 — Final round: `utp → "qizil takliflar:"` and `MAX_TOKENS` at 449 chars (2026-05-21 afternoon)

### Symptoms

Two more bugs reported via Saidumar's test:
1. `utp` returned 449 chars starting with `"qizil takliflar:* Texnik jihatdan…"` — fragment from the middle of a previous answer. `finish_reason: MAX_TOKENS`.
2. `NOA uchun raqamlar yo'q bo'lsa…` still gave 1 path despite the Part 3 prompt fix. `finish_reason: STOP`, `memory_used: true`.

### Root causes (from DB inspection of `bot_messages` table)

**Bug 1 — conv-memory leakage into Gemini chat prompt.** The Part 2 embed-unpolluting fix only stripped the conv-memory wrapper for `embedQueryGemini(...)`. But `askGeminiDirect` was still passing the wrapped `question` to Gemini's chat `contents[0].parts[0].text`:
```ts
const userMessage = contextBlock + `Savol: ${question}`;
```
So Gemini saw the prior assistant turns and interpreted new identical queries as continuations of truncated answers. The prior `utp` answer (2026-05-20 07:06) was 1430 chars with `MAX_TOKENS` truncation, ending mid section-4. When user typed `utp` again the next day, Gemini decided to continue from where it left off → started with `"qizil takliflar:"` (section 4's "red proposals" subsection).

**Bug 2 — `thinkingConfig.thinkingBudget` consuming output budget.** Gemini 3.x models (3-flash-preview, 3.5-flash) have a hidden "thinking" phase that counts toward `maxOutputTokens`. With `maxOutputTokens: 4000` and no `thinkingConfig`, the model spent ~3500+ tokens on internal reasoning, leaving only ~150 tokens (~449 chars in Uzbek/Russian) for visible output. Hence the early `MAX_TOKENS` firing.

### Fixes shipped (commit `c2aa3b0` on saidumar, deploy `60886add`)

**`src/lib/aiClient.ts`:**

1. **Pass `embedQuery` instead of `question` to Gemini chat too** (mirrors the embed fix from Part 2):
   ```ts
   const userMessage = contextBlock + `Savol: ${embedQuery}`;
   ```

2. **`thinkingConfig.thinkingBudget: 0`**:
   ```ts
   generationConfig: {
     temperature: 0.3,
     maxOutputTokens: 4000,
     thinkingConfig: { thinkingBudget: 0 },
   }
   ```

**`src/lib/bot/handlers.ts`:**

3. **Added `🔊 Tinglash` to long-answer keyboard** so Listen button is consistent across direct + long delivery types:
   ```ts
   const kb = new InlineKeyboard()
     .text("📚 Manba", `manba_${msgId ?? "0"}`)
     .url("📄 PDF o'qish", `${appUrl}/article/${longAnswer.id}?print=1`)
     .text("🔊 Tinglash", `tts_${msgId ?? "0"}`);
   ```

### Verification (`test_both_fixes.cjs`)

| Metric | Before (49 → 449 chars) | After |
|---|---|---|
| `utp` finish_reason | MAX_TOKENS | **STOP** |
| `utp` visible chars | 449 | **2644** (6× more) |
| `utp` opening text | `"qizil takliflar:* Texnik…"` | `"### 1. UTP nima?\nUTP — bu isteʼmolchiga…"` |
| NOA paths returned | 1 ("join another business") | **4 paths**: ① join, ② start with available data, ③ begin daily reporting (the "start measuring" message), ④ identify gaps during audit |
| NOA chars | 581 | 1746 |

---

## Tradeoff explicitly chosen for Part 4 Fix A

Stripping conversation memory from Gemini's chat prompt means **explicit follow-up questions like `"misollar ko'proq?"` lose their context** — Gemini no longer knows what previous topic to give more examples of. The user accepted this tradeoff because the "Gemini continues prior truncated answer" failure mode was much more visible and damaging than the loss of follow-up coherence. Follow-up queries now need to be self-contained (`"UTP bo'yicha misollar ko'proq"` instead of `"misollar ko'proq?"`).

---

## Deferred items (next session)

1. **Restore the Python FastAPI RAG service** to the `basyra-ai-bot` Railway service. Current state: that service runs Next.js LMS code instead of Python FastAPI, breaking every `${RAG_SERVICE_URL}/*` endpoint the LMS calls (`/ask`, `/content`, `/content/upload`, `/content/<src>/reindex`, `/content/<src>/toggle`, **`/tts`**). The LMS falls back to Gemini direct for chat (working), but admin chatbot panel shows "Bilim bazasiga ulanib bo'lmadi" and the **🔊 Tinglash button always 405s**.

2. **Decide what to do with the `basyra-admin` service** (currently also a Next.js LMS deploy pointed at the wrong DB → login on that URL returns 500).

3. **Lock down Railway source tracking** — change the `basyra_lmss` Railway service's GitHub branch from `master` → `saidumar`, OR disconnect GitHub source entirely. Until this happens, every env-var edit triggers a master auto-deploy that must be immediately overwritten via `railway up` from the saidumar dir.

4. **Master branch hygiene** — `master` on `data365-git/basyra_airag` is an orphan with no shared history to saidumar. Either delete it, or force-push saidumar onto it (after #3 is done so it doesn't trigger surprise deploys).

5. **TTS endpoint** — implementing TTS directly in the LMS using Google Cloud Text-to-Speech API (we have `GOOGLE_TTS_API_KEY`) would unblock the Listen button without needing the RAG service restored. Verify `GOOGLE_TTS_API_KEY` has Text-to-Speech API enabled on its project first.

6. **Pro models** — if the Google Cloud project ever gets paid billing enabled, prepend a Pro model (e.g. `gemini-3-pro-preview`) to `GEMINI_CHAT_MODELS` for higher answer quality.

---

## Commit graph on saidumar (chronological)

```
60886add deploy SUCCESS · c2aa3b0  fix(bot): unpoison Gemini chat prompt + disable thinking + always show Tinglash
e82ec2c6 deploy SUCCESS · e4e35f8  fix(bot): NOA acronym + top-K=12 + comprehensive-coverage rule
a080a453 deploy SUCCESS · c316f1d  fix(aiClient): type usedModel as union to accept all cascade members
9a97582d deploy FAILED  · e350818  fix(aiClient): Flash-only model cascade + embed-query unpolluting   (TS error, superseded by c316f1d)
1ae053c6 deploy SUCCESS · 3c0370f  feat(bot): UTP expansion + cleaner button layout
282d5784 deploy SUCCESS · (CLI from saidumar dir, env-var-trap countermeasure)
77533dad deploy SUCCESS · (CLI from saidumar dir, initial restoration)
```

---

## Things to avoid (additions to the 2026-05-18 list)

6. **Don't change Railway env vars via dashboard without immediately running `railway up` from the saidumar dir** — the dashboard change auto-triggers a deploy from GitHub master, rolling the bot back to broken code. Either fix the source-branch setting (preferred), or always counter immediately.

7. **Don't pass the conversation-wrapped question to either embed OR Gemini chat** — both paths must use the bare `embedQuery` (post-`New user message:` slice). Polluting embedding gives wrong chunks; polluting Gemini chat gives "continue prior answer" behavior.

8. **For Gemini 3.x models, always set `thinkingConfig.thinkingBudget = 0`** when you want all of `maxOutputTokens` to go to visible output. Without it, ~80% of the budget gets eaten by hidden thinking.

9. **Don't rely on `gemini-2.0-flash` on free-tier projects** — `generate_content_free_tier_requests` quota is 0 there. Use 3.x and 2.5 Flash variants only.

10. **Don't commit/share API keys** — Google's automated scanners revoke leaked keys within hours. Always API-restrict newly issued keys (Cloud Console → Credentials → key → API restrictions → only "Generative Language API") immediately after creation, regardless of where they'll be used.

