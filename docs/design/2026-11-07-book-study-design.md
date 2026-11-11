# Book Study — design

Date: 2026-11-07
Status: approved (sections 1–4), pending implementation plan

## Goal

Import any chess book PDF into Chess Studio and study it with a live board: the
book's own text, chapter structure, move sequences, and diagrams presented in a
clean reading view. Diagrams stay where the book puts them (above or beside the
text they explain), and each example the author discusses has playback controls
that drive the board. Entirely local and deterministic — no cloud, no LLM, no
API keys.

## Scope

In scope:
- PDF import (digital text PDFs and scanned/image PDFs).
- Offline text extraction, OCR fallback, move-sequence parsing, diagram → FEN
  recognition.
- Chapter structure preserved from the book (PDF outline, else heading
  heuristics) with a chapter navigator.
- Clean reflowed reading view with diagrams placed where the book places them
  (inline, left, or right of the text they explain).
- Playback controls for every author line: step through the author's moves,
  auto-play, jump to a diagram, TOC of examples per chapter.
- Reading preferences (font size, line width, theme, focus mode) and a
  "show original page" view.
- Books tab inside the existing Game Library workspace with a reader view.
- Local book library, parse cache, reading progress, in-book search, manual FEN
  fixes.

Out of scope (v1):
- EPUB, MOBI, DJVU, ChessBase formats.
- Cloud/AI extraction or summaries.
- Automatic engine annotation of book positions (reader board is analysis-free;
  users can still open a position in the existing workspaces later).
- Multi-language OCR (English only; other languages can be added by shipping
  additional traineddata).
- DRM/encrypted PDFs.

## Architecture

Pipeline runs in the renderer:

```
PDF file ──(main: copy + sha256)──> source.pdf
   └─ renderer parse worker
        ├─ pdfjs-dist: text layer + page raster
        ├─ tesseract.js worker: OCR when text layer is unusable
        ├─ block segmentation (headings / paragraphs / moves / diagrams)
        ├─ SAN tokenizer + chess.js replay  -> fenAfter per token
        └─ diagram recognizer (canvas CV + template match) -> FEN
   └─ parsed.json (immutable, keyed by sha256) via IPC
   └─ notes.json (progress, FEN overrides) via IPC
```

Rationale: no native modules (packaging unchanged), OCR off the UI thread,
per-page streaming keeps memory bounded for 300+ page books.

## Data model

Storage under `%APPDATA%/Chess Studio/books/`:

- `index.json` — book list
- `<bookId>/source.pdf` — copied original
- `<bookId>/parsed.json` — immutable parse output
- `<bookId>/notes.json` — mutable: progress, manual FEN fixes

Shared types in `src/shared/book.ts`:

```ts
BookMeta {
  id, title, author, pageCount, sha256, sizeBytes, importedAt,
  source: 'text' | 'ocr', parsedAt, lastPage,
  confidence: { high: number; low: number }
}

ParsedBook {
  schemaVersion: 1,
  outline: Chapter[],        // chapter tree, from PDF bookmarks or headings
  blocks: BookBlock[],
  examples: Example[]
}

Chapter { id, title, level, page, startBlockId, childIds: string[] }

BookBlock {
  id, page, order, chapterId,
  kind: 'heading' | 'paragraph' | 'moves' | 'diagram' | 'caption' | 'unparsed',
  text,
  layout: { rect: Rect, flow: 'inline' | 'float-left' | 'float-right' },
  moves?: SanToken[],
  exampleId?: string,
  diagram?: { fen: string; confidence: number; orientation: 'w' | 'b' }
}

Example {
  id, chapterId, title,        // e.g. "Game 12 — Capablanca–Marshall"
  startFen, tokens: SanToken[],
  blockIds: string[],          // source blocks in reading order
  diagramIds: string[]
}

// Example.tokens is the ordered concatenation of tokens from its move blocks;
// blocks stay the source of truth, the example is a reading/playback view.

SanToken {
  san, moveNumber?, color?, variationDepth,
  fenAfter: string,
  flagged?: boolean   // replay failed / gap
}

BookNote {
  lastBlockId, lastPage, scrollTop,
  fenOverrides: Record<string, string>   // blockId -> corrected FEN
}
```

Moves are replayed at parse time, so every token carries its resulting FEN.
Click-to-board needs no runtime replay.

## IPC

`BookChannel` added to `src/shared/ipc.ts`:

- `list`, `import`, `delete`, `rename`, `read`, `saveParse`, `saveNote`,
  `cancelParse`, `search`
- `book:progress` streamed main → renderer: `{ bookId, page, totalPages, phase }`

Boundary: main owns files, hashing, JSON store, progress relay. Renderer owns
PDF extraction, OCR, recognition. `parsed.json` is written once and never
patched; user fixes live in `notes.json`.

## Parsing pipeline

Per page:

1. **Text** — `pdfjs-dist` `getTextContent()`; lines rebuilt by Y coordinate,
   columns by X, paragraphs by line gap, headings by font size.
2. **OCR fallback** — if a page yields no text items, or fewer than 30% of its
   characters are alphanumeric: rasterize at 300 DPI and run `tesseract.js` in a
   worker. English data bundled. A book is tagged `source: 'ocr'` if any page
   needed OCR.
3. **Block segmentation** — emit `BookBlock`s: heading, paragraph, move run,
   diagram caption, diagram image, unparsed.

**Chapter structure (document level)**
- Primary source: `pdfjs` document outline (PDF bookmarks) → chapter tree with
  levels and destination pages.
- Fallback when no outline: heading blocks ranked by font size and numbering
  patterns ("Chapter 4", "Part II") → levels assigned by size clustering.
- Every block gets `chapterId`; reading order within a chapter is
  `(page, order)`.

**Layout (where diagrams sit)**
- Each block keeps its normalized page rect.
- A diagram whose rect vertically overlaps a paragraph and sits left/right of
  it becomes `float-left`/`float-right` and renders beside that paragraph;
  otherwise `inline` above/below the following text.
- Original page image is always retrievable for the "show original page" view.

**Examples (author lines)**
- A run of `moves` blocks sharing one game header/FEN, plus the paragraphs
  around it, form one `Example`; contiguous runs separated by a new game
  header, a diagram with a different FEN, or a heading start a new example.
- Tokens are ordered across the example; auto-play and step controls operate on
  that one sequence. Variations keep `variationDepth` so the reader can show or
  hide them.

Move detection:
- Tokenizer handles SAN, move numbers (`12.`, `12...`), nested variation
  parentheses, figurine glyphs (`♘`→`N`), `0-0`→`O-O`, trailing `!?`.
- Replay with `chess.js` from a tracked sequence FEN; each validated token
  stores `fenAfter`.
- A move that fails replay becomes an `unparsed` gap token; position unchanged;
  resync on the next move-number/color marker. Never guess.
- New Game header or standalone FEN resets the sequence.

Diagram → FEN:
- Locate board bitmap (embedded image objects; scans via grid projection).
- Normalize to 64 cells; classify each cell by template matching against the
  bundled cbrunett SVGs, cell-center weighted so arrows/highlights are ignored.
  A cell is accepted only if the best template similarity ≥ 0.55 and exceeds the
  runner-up by ≥ 0.1; otherwise the diagram is low confidence.
- Orientation from pawn placement (pawns move one way); flip when Black is at
  the bottom.
- Anything other than a clean 8×8 grid gets low confidence and requires manual
  FEN input.
- "Diagram 42" / "see page 142" captions are attached to the nearest diagram
  block as its caption (they do not become standalone caption blocks).

Confidence:
- High: all moves replayed cleanly, all 64 cells above margin, clean 8×8 grid.
- Low: flagged in the UI with inline fix.

Throughput: text book ≈ seconds; scanned ≈ 1–2 s/page (300 pp ≈ 5–10 min),
cancellable, cached by hash.

## UI

Library workspace tabs: `Games` (existing) | `Books` (new).

Books list: title, author, pages, `Text`/`OCR` badge, progress %, low-confidence
count; actions open, rename, delete (confirm), Import PDF.

Import: native PDF picker → copy + hash → progress (page x/y, phase: text → OCR
→ diagrams) with Cancel → reader. Cache hit skips parsing.

Reader (Flow mode default):
- Left sidebar: chapter tree (collapsible, from book outline), per-chapter
  progress, and an examples list for the current chapter.
- Center: reflowed book text. Headings styled by level; paragraphs plain; move
  runs rendered as clickable tokens; active token highlighted. Diagrams render
  inline or floated left/right per their original page position.
- Right: sticky board using its own `useReaderBoard` state (independent of Game
  Review), flip and reset-to-diagram controls.
- Example cards: a moves run plus its surrounding paragraphs renders as one
  card with playback controls — play/pause, step back/forward, jump to start,
  auto-advance speed, show/hide variations. The board follows the card's active
  token, so the author's line is played exactly as written.
- Clicking any token jumps the board to that `fenAfter` and pins surrounding
  paragraphs as "context" above the board.
- Diagram blocks: `Diagram N — Show board`; low-confidence ones show an amber
  badge and an inline `Fix FEN` input validated with `chess.js`, saved to
  `notes.json`.
- Board is freely playable for side lines (legal moves only, not persisted).
- Reading preferences: font size, line width, theme (app themes), focus mode
  (hide sidebar/toolbar).
- "Show original page" opens the rasterized PDF page for the current block.
- Toolbar: in-book search — case-insensitive substring over block text, plus
  SAN lookup that normalizes a query like `Nf3` or `12.Nf3` and lists tokens
  whose SAN matches (all occurrences, with page/chapter); prev/next move token,
  page jump, "show only flagged" filter.
- Keyboard: `←/→` previous/next token, `Space` play/pause active example,
  `PageUp/PageDown` page, `F` flip, `Esc` clear selection.
- Reopen restores last block and scroll.

Empty/error states: no books (import CTA), parse failed (retry/delete),
encrypted PDF (clear message), PDF without chess content ("no moves or diagrams
found").

## Error handling

- Corrupt/encrypted PDF → typed error (`encrypted`, `corrupt`, `unsupported`)
  with actionable message.
- OCR page failure → page marked `unparsed`, parse continues, filterable.
- Diagram below margin → block kept with `confidence: 0`; board opens only after
  a valid manual FEN.
- Worker crash → respawn once, then surface error.
- Store writes atomic (tmp + rename); `parsed.json` immutable.
- Cancel → discard partial parse, allow restart.
- PDF > 200 MB → warn before copying.

## Testing

Unit:
- SAN/figurine/variation tokenizer cases.
- Block segmentation.
- Chapter tree from outline and from heading fallback.
- Layout classification: inline vs float-left/right from synthetic page rects.
- Example grouping across pages and headers.
- Replay FEN correctness (validated tokens, gap resync).
- Diagram classifier against synthetic boards rendered from known FENs,
  including flipped, partial, and arrow-overlaid boards.
- OCR fixture page.
- Cache key / immutability.

Integration:
- Committed fixture text PDF (authored in-repo, multi-chapter, with inline and
  floated diagrams, multiple examples) → expected chapters, blocks, tokens,
  FENs, and example boundaries.

E2E:
- CDP harness in `.shots/`: import fixture PDF, verify chapter count and
  navigation, open an example, press play, sample the reader board, assert FEN.

Gates:
- `npm run typecheck` clean.
- Existing workspaces, engine, review, library, openings, and tablebase
  behaviors unchanged.

## Acceptance criteria

- A text PDF imports and opens in the Books tab with its chapter tree matching
  the book's outline (or heading-derived chapters when no outline exists).
- Every parsed move token yields the correct board position; clicking it moves
  the board there.
- Example cards play the author's line start to finish, with working
  play/pause, step, and variation toggle.
- Diagrams render where the book places them (inline or beside the relevant
  text) and open the correct FEN; low-confidence ones require a manual fix.
- A scanned PDF imports via OCR and yields usable chapters, text, and diagram
  positions.
- Reading preferences persist; reopening a book restores the last block and
  scroll.
- Unparseable fragments are flagged, never guessed or dropped silently.
- `npm run typecheck` passes and existing workspaces, engine, review, library,
  openings, and tablebase behavior are unchanged.

## Performance targets

- 300-page text PDF parse < 10 s.
- OCR ≤ 2 s/page.
- Reader scroll at 60 fps.
- Cached parse < 15 MB per typical book.

## Dependencies and licensing

- `pdfjs-dist` — Apache-2.0.
- `tesseract.js` — Apache-2.0, plus bundled `eng` traineddata.
- GPL-3.0-compatible; `NOTICE.md` updated. No runtime network calls.

## Risks

- Diagram recognition accuracy is the main risk; mitigated by confidence
  flags and required manual fixes.
- OCR quality on low-resolution scans; same mitigation.
- Books are user-supplied and stay local; the app performs no DRM
  circumvention.
