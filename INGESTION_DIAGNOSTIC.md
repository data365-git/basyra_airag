# BN 2.0 Lesson 2 — Ingestion Diagnostic

**Date:** 2026-04-29  
**Status:** Source files not found locally

---

## Ingestion scripts available

All scripts live in `/Users/bunyod365/secondbrain/github/Basyra/Basyra AI chatbot/`:

| Script | Purpose |
|---|---|
| `ingest.py` | Original pipeline — plain text/PDF, word-based chunking, `text-embedding-004` via `google.generativeai` |
| `ingest_lesson.py` | Improved pipeline — `.docx` only, timestamp-aware chunking `[HH:MM:SS]`, Cyrillic→Latin normalization, `gemini-embedding-001` |
| `ingest_v2.py` | Multi-cohort pipeline — `.docx` transcripts + PDF slides, cohort/lesson metadata, concept deduplication across courses, backfill migration |

For new BN 2.0 content, **`ingest_lesson.py`** or **`ingest_v2.py`** should be used (they support the `.docx` transcript format with timestamps and are on the newer `gemini-embedding-001` model).

---

## Local source files — what exists

The local Drive download at `/Users/bunyod365/Documents/drive-download-20260428T171855Z-3-001/` contains:

- `BN 1.0/` — lessons 1–16 as `.docx` files (numbered `1.docx` through `16.docx`)
- `Ideal Rop 2.0/` — 17 lessons (`Basyra iR 1.docx` … `Basyra iR 17.docx`)
- `Cambridge modul/` — Modules 1–6
- `Asoschilar va Marketologlarga videosi/`
- `Master darslik/`
- `Youtube/`

**There is no `BN 2.0/` folder.** BN 2.0 Lesson 2 source files were not found anywhere on the local machine.

---

## Command to ingest once files are available

Once the BN 2.0 Lesson 2 transcript `.docx` is obtained, run from inside the AI chatbot directory:

```bash
cd "/Users/bunyod365/secondbrain/github/Basyra/Basyra AI chatbot"

# Using ingest_lesson.py (single cohort):
python3 ingest_lesson.py \
    "/path/to/BN2_Lesson2.docx" \
    "BN 2.0 Lesson 2" \
    "<lesson title here>"

# Using ingest_v2.py (multi-cohort, recommended for consistency with new ingestion):
python3 ingest_v2.py transcript \
    "/path/to/BN2_Lesson2.docx" \
    --cohort "bn-2.0" --cohort-name "Business Navigator 2.0" \
    --lesson 2 --title "<lesson title here>"
```

The `DATABASE_URL` and `GEMINI_API_KEY` environment variables must be set (or in a `.env` file in the chatbot directory). The DB is on Railway — run this with Railway's DATABASE_URL from the project dashboard.

---

## Conclusion

**Source files not found — obtain BN 2.0 Lesson 2 transcript (.docx) from Basyra team.**

BN 1.0 lessons 1–16 are already downloaded locally and could be ingested. Only BN 2.0 content is missing.
