# Book Study — AI reader for scanned books

Date: 2026-11-08
Status: approved for implementation (project owner: "approve by yourself and proceed")
Extends `2026-11-08-book-ocr-design.md`. The OCR pipeline stays; it becomes the fallback.

## Problem

The OCR pipeline reads the scan but cannot read the book. Measured over 91 pages of
`mastering-chess-strategy-…compress.pdf` after this session's repair work:

```
blocks 4349 · move blocks 171 · rail entries 75 (was 212)
57 moves replay · 39 repaired · 51 unclear · 520 unreadable
```

520 unreadable tokens means five of every nine moves on a page cannot be clicked, and the
positions still come from a human pasting a FEN (`Manual anchor per example`). The reason is
structural: tesseract sees characters, not a board. The starting position of every Hellsten
example lives in a diagram, and no amount of text repair recovers it.

An AI reader that sees the page image can do all three things the parser guesses at: tell a
chapter title from a sentence fragment, keep the prose in reading order, and read the position
off the diagram.

## Decisions taken with the project owner

| Question | Decision |
|---|---|
| Where does the model run? | Cloud vision + LLM |
| Replace or layer? | AI primary, OCR as automatic fallback |
| Cost model | Structure pass first, detail pass on demand |
| What may the model change? | Nothing — verbatim text plus structure |
| Provider | OpenRouter, free models |
| Free quota | Batch pages per request, cache per page, pause on quota |
| How does it see boards? | Whole page image, one answer per page (option A) |

## Constraints from the existing app

- Every outbound call in this app is main-process (`src/main/openings/openingsFetch.ts:3`,
  `src/main/tablebase/tablebaseFetch.ts:3`). The renderer CSP is `connect-src 'self'`
  (`src/renderer/index.html:8`), so the model call cannot live in the renderer.
- pdf.js only runs in the renderer (`document.createElement('canvas')`,
  `src/renderer/src/books/rasterPdf.ts:9`). So the renderer rasterises and the main process
  talks to the network; the page bytes cross the bridge once per batch.
- The reader already treats a stored `ParsedBook` as the only source of truth
  (`src/main/book/bookStore.ts:245`), and anchors already override positions at render time
  (`src/renderer/src/books/anchorMoves.ts`). Both stay.

## Architecture

```
renderer                                   main
--------                                   ----
aiReader.ts  ── rasterise+JPEG batch ──►   aiManager.ts ─► aiFetch.ts ─► OpenRouter
   │  validate + cache per page            (key/model settings, safeStorage)
   ▼
aiValidate.ts (chess.js gate)
   │
   ▼
bookStore.saveParsed  ──►  parsed.json (schemaVersion 3, source 'ai')
```

New modules:

- `src/main/ai/aiFetch.ts` — one `chat/completions` call with image parts. Takes
  `fetchImpl` as a default parameter, exactly like `fetchOpening`
  (`src/main/openings/openingsFetch.ts:8`), so tests inject a fake transport and no test needs
  network.
- `src/main/ai/aiManager.ts` — IPC handlers, key/model/budget settings. The key is written with
  `safeStorage.encryptString` to `ai.json` in userData when encryption is available, plaintext
  otherwise; it is never sent back to the renderer — handlers return `{ hasKey, model, budget }`.
- `src/renderer/src/books/aiReader.ts` — the pass runner. Mirrors `ocrPages`
  (`src/renderer/src/books/ocrPdf.ts:56`): `deps`, `options`, per-item `outcome`, `shouldStop`,
  `onRecord`, abort on consecutive failures.
- `src/renderer/src/books/aiValidate.ts` — the gate that turns model JSON into `BookBlock[]`
  and `Chapter[]`.
- `src/main/book/bookStore.ts` gains `readAiPage` / `saveAiPage` / `listAiPages` and
  `readAiBatch` / `saveAiBatch`, validated in the same reject-don't-repair style as
  `normaliseOcrPage` (`src/main/book/bookStore.ts:69`).

## Two passes

**Structure pass** — 5 page images per request at 120 DPI, JPEG quality 0.6. The prompt asks
only for chapter titles with levels and start pages, plus which pages hold an example:

```json
{ "pages": [ { "page": 45, "chapters": [ { "title": "Example 31", "level": 2 } ],
  "examples": [ { "label": "Example 31", "diagrams": 1 } ] } ] }
```

The answer is cached per batch as `ai/structure/<firstPage>-<count>.json`. One book of 491 pages is
about 99 requests. The rail becomes correct immediately after this pass.

**Detail pass** — 2 page images per request at 200 DPI, triggered when a chapter is opened (or
by "read the whole book"). A chapter's page range is `[startPage, nextStartPage - 1]` from the
structure pass, so the request is bounded by what is on screen. The prompt asks for the page's
blocks in reading order: verbatim prose, SAN lists, and one entry per board diagram with the FEN
read off it and the caption it belongs to. Validated per page, cached as `ai/pages/<page>.json`.

Nothing is bought twice: a page present in the cache is skipped by both passes, and a pass that
is stopped, crashes, or loses the network resumes from the cache on the next run.

**Merging engines.** A book is assembled page by page: a page with an `ai/pages` entry renders
from the AI, any other page with an `ocr` entry renders from the OCR path, and AI wins where both
exist. The header names both counts, e.g. `AI 128 pages · OCR 363 pages`. `ParsedBook.source`
records which engine produced the majority, and `schemaVersion 3` blocks carry `origin: 'ai' |
'ocr'` so a mixed book is auditable block by block.

## Data contract

The model is told to answer with JSON only, and the app trusts nothing it did not check:

```json
{ "pages": [ { "page": 45,
  "blocks": [
    { "kind": "heading", "text": "Example 31", "level": 2 },
    { "kind": "prose",   "text": "Black's pieces are passive…" },
    { "kind": "diagram", "fen": "r1bq… w - - 0 21", "caption": "Example 31",
      "box": [12, 30, 46, 40] },
    { "kind": "moves",   "text": "21…e5 22.Re1", "moves": ["21...e5", "22.Re1"] }
  ] } ] }
```

Rules enforced in `aiValidate.ts`:

- `page` must be one of the pages in the request; unknown pages are dropped.
- Text is taken verbatim, capped at 4000 characters per block and 200 blocks per page.
- A FEN must parse in chess.js. A missing castling/counter half is normalised to `- - 0 1`
  before the attempt; a FEN that still fails marks the diagram `no-position`.
- SAN must replay from that FEN. Tokens that fail stay in the block, `flagged`, exactly as the
  OCR path marks them today.
- A `moves` block with no replayable token and no usable diagram on the page is kept as prose.

**Which position a move list starts from**, stated once because it is the whole point: a `moves`
block takes the FEN of the nearest preceding `diagram` block on the same page; if the page has no
diagram above it, it takes the last verified position of the chapter, replayed forward from the
chapter's first diagram; if neither exists the block is rendered as text with
`positionState: 'no-position'` and its moves are not clickable. The reader never guesses a
position from the initial array.

`BookSource` gains `'ai'`, `ParsedBook.schemaVersion` gains `3`, and `BookBlock` gains
`fen?: string`, `origin?: 'ai' | 'ocr'` and `positionState?: 'verified' | 'replay-failed' |
'no-position'`. Manual anchors keep priority over any model FEN.

**Transport.** Pages travel as base64 JPEG inside one IPC call per batch — 5 pages at 120 DPI is
roughly 0.3-0.6 MB, which is well inside the `MAX_BOOK_BYTES` scale the store already handles,
and it keeps pdf.js in the renderer where canvas exists. The main process never touches the PDF.

## Quota, batching, budget

- 429 and 5xx: three attempts, 2 s / 8 s / 20 s, then the pass stops with state `quota` and the
  message "Free quota reached — cached pages are kept and this run resumes later."
- Settings holds a pages-per-run budget, default 100, so a full 491-page book can never be read
  by an accidental click. The reader header shows `ai 128/491 pages · budget 100/run`.
- No model id is hard-coded. Settings lists vision-capable models from OpenRouter's
  `/api/v1/models` (cached 24 h) filtered to free ones, with a text field for any other id.
  Free model names change; the app must not die with them.

## UI

- Settings → new **AI reader** card: key (masked, save/clear, `hasKey` state), model picker,
  pages-per-run budget, "test connection".
- Reader header line shows which engine produced the text: `AI read` · `OCR` · `Text`, plus
  cached/total pages and the current pass.
- A chapter whose detail pass has not run shows one inline card — "Read this chapter with AI
  (≈12 pages)" — instead of OCR noise.
- Page margin keeps a "re-read this page" action that overwrites that page's cache entry.
- The chapter rail keeps its current markup; only its source changes.
- The anchor editor stays and remains the manual override.

## Error handling

| Failure | Behaviour |
|---|---|
| No key configured | Silent fallback to the OCR pass, one notice naming the reason |
| 401 from OpenRouter | Pass stops, key field marked rejected, cache intact |
| Offline / DNS | Pass stops and resumes from cache; pages with no AI detail render from the OCR cache |
| Malformed JSON or missing pages | Retry the batch once at 2 pages, then mark those pages failed and continue |
| FEN rejected by chess.js | Text still renders; moves stay unclickable and say why |
| App quits mid-pass | Next run resumes from cache |

## Testing

Unit harnesses in `.shots/`, same style as the existing 126 checks:

1. `books-ai-store-unit.mjs` — cache normalisation and rejection, resume listing.
2. `books-ai-validate-unit.mjs` — FEN gate, SAN replay, flags, caps, unknown pages dropped.
3. `books-ai-fetch-unit.mjs` — fake transport: 200 / 401 / 429 / garbage body, backoff schedule,
   batch size, no key.
4. `books-ai-reader-unit.mjs` — batching, cache skip, budget stop, quota pause, resume.
5. `books-ai-ui.mjs` (CDP) — runs against a local mock OpenRouter server reached through the
   Settings base-URL field, so no production code path exists for stubs. Asserts the two passes,
   the rail from structure, positions from diagrams, and the OCR fallback when the key is empty.
6. Existing suites must stay green: 126 unit checks, `books-ocr-ui` 28, `books-workspace-ui` 22,
   `npm run typecheck`.

Milestones land in that order. The last one is a real-key run over a 20-page slice, reviewed by
the project owner in the reader, before any full-book pass is offered.

## Out of scope

- Diagram cropping (approach B) — only reconsidered if validation failures cluster on pages with
  several boards.
- AI commentary or rewritten prose.
- Paid models, streaming, other providers' native formats.
- Deleting the OCR pipeline.
