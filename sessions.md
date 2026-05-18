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
