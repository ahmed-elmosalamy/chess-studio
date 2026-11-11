# Book Study — OCR for scanned books

Date: 2026-11-08
Status: approved for implementation (design approved by the project owner with "approve by yourself then proceed")
Supersedes nothing; extends `2026-11-07-book-study-design.md` (OCR was listed there as pending).

## Problem

The Books workspace parses text-layer PDFs. A real scanned book fails with
`No readable text found in this PDF` (`src/renderer/src/books/parsePdf.ts:67`).

Measured on `mastering-chess-strategy-…compress.pdf` (491 pages, 9.2 MB):

```
/Font refs 0    /Image 981    numPages 491
first 40 pages: pagesWithText 0, totalChars 0
each page: chars=0 items=0 imageOps=1  (one JBIG2 bitmap per page)
```

So the file genuinely has no text layer. Two further measurements shaped this design.

**Decode and OCR are feasible in-app.** pdfjs rasterized the JBIG2 pages inside Electron
once `jbig2.wasm` was reachable, and tesseract.js read them:

```
raster: 115–508 ms/page at 200–250 DPI, ink ratio 0.04–0.55 (real content)
OCR:    1.7–5.4 s/page, confidence 68–93, prose readable
```

**Moves cannot be anchored from text.** Across 12 sampled pages:

```
110 move pairs found: 44% clean SAN, 26% fixable by glyph map, 30% unrecognizable
sequences starting at move 1: 0 of 12 pages
```

This Everyman book continues each example mid-game (`37.WdaEa2+` on page 45); the
position lives in the page diagram, not in text. Figurine pieces OCR as letters
(`♕→W`, `♞→H`, `♖→E`, `♝→&`).

**The legality gate itself is trustworthy.** Synthetic test — real game moves, piece
letters corrupted, position known:

```
{ "total": 40, "repairedUnique": 16, "ambiguous": 4, "wrongGuess": 0, "unfixable": 0 }
```

Every corrupted move was repaired to the true SAN, ambiguous ones were refused, and
**no wrong move was ever accepted**. The missing piece is not OCR quality; it is a
starting position.

## Decision

Build OCR for scanned books, and get the starting position from the reader: one manual
anchor per move sequence. Automatic diagram→FEN is explicitly out of scope.

## Architecture

```
openReader(id)
  └─ readSource → parsePdf (text layer)
       ├─ text found  → buildBlocks → parsed.json                     (unchanged)
       └─ no text     → ocrPdf
            for page 1…N:
              ocr/<page>.json exists → reuse                          (resume)
              else pdfjs raster @250 DPI → ocrPage → words[{text,bbox}]
                   → columns.ts: column split + line rebuild → TextLine[]
                   → write ocr/<page>.json
              every 10 pages → buildBlocks(lines so far) → saveParsed  (reader fills in live)
            final → buildBlocks(all lines) → parsed.json (source 'ocr')
         anchors applied at render time by anchorMoves.ts (parsed text stays raw)
```

`parseText.ts`, `buildBlocks`, `BookReader` block rendering and the note/scroll model are
reused unchanged. OCR emits the same `TextLine { page, text, y, x, size }` shape.

## Units

| File | Job | Depends on |
| --- | --- | --- |
| `books/ocrEngine.ts` | own the tesseract worker; local `workerPath`/`corePath`/`langPath`; `ocrPage(bytes) → { words, confidence }` | tesseract.js |
| `books/columns.ts` | `words → TextLine[]`: cluster words into lines by y, find the vertical whitespace band, order columns left→right | nothing |
| `books/ocrPdf.ts` | page loop, raster via pdfjs, resume cache, progress, partial saves | ocrEngine, columns, `parseText.buildBlocks` |
| `books/anchorMoves.ts` | given blocks + anchors, replay each sequence from its anchor with glyph repair; return tokens with `fenAfter`/`flagged` | chess.js |
| `shared/book.ts` | schema v2, `MoveAnchor`, anchor channels | — |
| `main/book/bookStore.ts` | `ocr/<page>.json` + `anchors.json` read/write, schema check | — |

## Data model

```ts
export type MoveAnchor = { blockId: string; fen: string }          // anchors.json
export type ParsedBook = {
  schemaVersion: 2                                                  // was 1
  pageCount: number
  source: BookSource                                                // 'text' | 'ocr'
  outline: Chapter[]
  blocks: BookBlock[]
}
```

- Anchors live in `anchors.json`, never in `parsed.json`: they are user input and must
  survive re-OCR.
- `bookStore.isParsedBook` accepts `schemaVersion` 1 or 2; a v1 book simply starts with no
  anchors and keeps today's behaviour.
- New channels: `book:read-anchors`, `book:save-anchor`, `book:read-ocr-page`,
  `book:save-ocr-page`.
- OCR page cache entry: `{ page, confidence, lines: TextLine[] }`, one file per page,
  written atomically like every other book file.

### Anchor replay rules (`anchorMoves.ts`)

Walk blocks in document order with a running FEN.

1. Block has an anchor → running FEN = anchor FEN.
2. No anchor and no running position (OCR books) → tokens render as plain text, not
   clickable.
3. For each candidate SAN: try the raw string, then glyph-mapped variants
   (`W→Q, H→N, D→N, E→R, L→B, F→R, &→B, £→R, @→K`, plus dropping the leading glyph).
   Accept only when exactly one variant is legal. Unique → `fenAfter`, position advances.
   Zero or several → `flagged: true`, position unchanged.
4. Text-layer books keep auto-anchoring: a sequence starting `1.` from the start position
   sets the running FEN implicitly, exactly as `buildBlocks` does today.

## Reader UX

- Scanned book opens → progress line `OCR page 120 of 491 · ~3 s/page` in the existing
  `reader-analysing` slot; blocks appear every 10 pages.
- Library card shows a `scanned` badge plus the existing confidence counts.
- A `moves` block with no reachable position gets one inline control:
  **[ set position ]** → FEN field plus the existing Study palette. Saving writes
  `anchors.json` and immediately makes that block and every following block clickable.
- Flagged tokens keep the dotted-underline style already shipped.

## Bundling

No binary is committed to git and nothing is fetched at runtime.

- deps: `tesseract.js`, `tesseract.js-core`, `@tesseract.js-data/eng` (MIT traineddata),
  plus `jbig2.wasm` already inside `pdfjs-dist`.
- `ocrEngine.ts` / `parsePdf.ts` reference them with Vite `?url` imports, so the build
  copies them into `out/renderer/assets/`.
- `src/main/index.ts` MIME map gains `.wasm`, `.gz`, `.mjs` so `chessstudio://app/…`
  serves them; asar needs no unpacking because the handler reads through `fs`.
- `NOTICE.md` gains Apache-2.0 (tesseract.js, tesseract.js-core), MIT (traineddata) and
  the pdf.js JBIG2/OpenJPEG notices.

## Failure handling

- One page fails to OCR → record it, continue; the book still opens.
- More than 20% of pages fail → error banner, no partial book.
- Text parse returns 0 characters **and** OCR finds no words → "no readable text and no
  picture text either" message instead of the current bare error.
- Anchor FEN that does not parse → rejected in the store, message in the reader.
- App closed mid-OCR → already-cached pages are reused on the next open.

## Testing

1. `columns.ts` unit: synthetic word boxes from a two-column page → lines in reading
   order, single-column page untouched, band threshold respected.
2. `anchorMoves.ts` unit: the synthetic corruption test above as a real test — 0 wrong
   moves accepted, ambiguous refused, glyph map repaired.
3. `ocrPdf.ts` unit with a stub engine: resume skips cached pages, partial save every 10
   pages, >20% failure aborts with an error.
4. `bookStore` unit: anchors round-trip, invalid FEN rejected, v1 parsed.json still loads.
5. CDP UI harness against the real scanned book **only when the file exists locally**
   (copyrighted, never committed): progress advances, cached resume, set-position flow
   makes a mid-game move clickable and the board FEN matches.
6. Existing suites (store/parser/PDF/reader, 22 checks) must stay green.

## Out of scope

Diagram→FEN recognition, page-image viewer, OCR languages other than English, full-book
OCR for text-layer PDFs, search, and any cloud OCR.
