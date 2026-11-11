import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, List, Minus, Plus, RefreshCw, ScanText, Square, X } from 'lucide-react'
import BookContents from './BookContents.tsx'
import type { BookBlock, BookNote, ParsedBook, SanToken } from '@shared/book'
import type { AiErrorKind } from '@shared/ai'
import ChessBoard from './board/ChessBoard.tsx'
import { applyAnchors, isValidFen, type AnchorStats } from '../books/anchorMoves.ts'
import { applyAiAnchors } from '../books/aiAnchors.ts'
import { chapterPageRange, type OpenBook } from '../hooks/useBooks.ts'
import type { ChessGame } from '../hooks/useChessGame.ts'

type Props = {
  book: OpenBook
  error: string | null
  aiPaused: AiErrorKind | null
  game: ChessGame
  onClose: () => void
  onAnalyse: () => void
  onStop: () => void
  onNote: (note: BookNote) => void
  onShowPosition: (fen: string) => void
  onAnchor: (blockId: string, fen: string) => void
  onClearAnchor: (blockId: string) => void
  onReadChapter: (chapterId: string) => void
  onRereadPage: (page: number) => void
}

const iconButton = 'icon-btn shrink-0 disabled:cursor-not-allowed disabled:opacity-40'

const EMPTY_STATS: AnchorStats = { sequences: 0, accepted: 0, repaired: 0, ambiguous: 0, unfixable: 0 }

function loadFontSize(): number {
  try {
    const saved = Number(window.localStorage.getItem('books:fontSize'))
    if (saved >= 13 && saved <= 20) return saved
  } catch {
    // ignore storage failures
  }
  return 16
}

function moveLabel(token: SanToken): string {
  if (token.moveNumber === null) return token.san
  return `${token.moveNumber}${token.color === 'w' ? '.' : '...'}${token.san}`
}

function MoveLine({
  blockId,
  tokens,
  positionState,
  activeIndex,
  onMove
}: {
  blockId: string
  tokens: SanToken[]
  positionState: BookBlock['positionState']
  activeIndex: number | null
  onMove: (blockId: string, index: number, fen: string) => void
}) {
  const parts: ReactNode[] = []
  let depth = 0
  tokens.forEach((token, index) => {
    if (token.variationDepth > depth) {
      for (let level = depth; level < token.variationDepth; level += 1) {
        parts.push(
          <span key={`open-${index}-${level}`} className="text-muted">
            (
          </span>
        )
      }
    } else if (token.variationDepth < depth) {
      for (let level = token.variationDepth; level < depth; level += 1) {
        parts.push(
          <span key={`close-${index}-${level}`} className="text-muted">
            )
          </span>
        )
      }
    }
    depth = token.variationDepth

    if (token.moveNumber !== null && (token.color === 'w' || index === 0)) {
      parts.push(
        <span key={`num-${index}`} className="font-mono text-[0.8em] text-muted">
          {token.moveNumber}
          {token.color === 'w' ? '.' : '...'}
        </span>
      )
    }

    const active = index === activeIndex
    const reason = positionState === 'no-position' ? 'No position on this page — set one above the line' : `${token.san} cannot be replayed from the previous main-line position`
    parts.push(
      <button
        key={`move-${index}`}
        type="button"
        data-testid="reader-move"
        data-active={active}
        data-flagged={token.flagged ? 'true' : undefined}
        disabled={positionState === 'no-position'}
        title={token.flagged ? reason : `Show the position after ${token.san}`}
        onClick={() => onMove(blockId, index, token.fenAfter)}
        className={`min-h-6 rounded px-1.5 font-mono text-[1em] leading-relaxed transition-colors ${
          active ? 'bg-accent font-semibold text-bg' : token.flagged ? 'text-muted underline decoration-dotted underline-offset-2 hover:bg-surface-2' : 'text-accent hover:bg-surface-2'
        } ${positionState === 'no-position' ? 'cursor-not-allowed' : ''}`}
      >
        {token.san}
      </button>
    )
  })
  if (depth > 0) {
    for (let level = 0; level < depth; level += 1) {
      parts.push(
        <span key={`trail-close-${level}`} className="text-muted">
          )
        </span>
      )
    }
  }

  return <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">{parts}</div>
}

const blockFrame = (active: boolean): string =>
  `border-l-2 pl-3 transition-colors ${active ? 'border-accent bg-accent/5' : 'border-transparent'}`

const chipButton =
  'btn no-drag min-h-6 shrink-0 px-2 py-0.5 text-2xs disabled:cursor-not-allowed disabled:opacity-40'

const pausedLabel: Record<AiErrorKind, string> = {
  'no-key': 'no API key saved',
  'no-model': 'the model was not accepted',
  unauthorized: 'the key was rejected',
  quota: 'the free quota is used up',
  offline: 'provider or network unavailable, or request timed out',
  'bad-response': 'the answer could not be read'
}

function engineLabel(parsed: ParsedBook, book: OpenBook): string {
  if (parsed.source === 'ai') return `AI read ${book.aiPages.length}/${parsed.pageCount} pages`
  if (parsed.source === 'ocr') return `OCR ${book.ocrPages.length}/${parsed.pageCount} pages`
  return 'Text'
}

function stageLabel(book: OpenBook): string {
  if (book.stage === 'ai') return book.pass === 'structure' ? 'AI mapping the chapters' : 'AI reading pages'
  if (book.stage === 'ocr') return 'Reading scanned pages'
  return 'Reading PDF'
}

function AnchorBar({
  blockId,
  anchor,
  boardFen,
  onSet,
  onClear
}: {
  blockId: string
  anchor: string | undefined
  boardFen: string
  onSet: (blockId: string, fen: string) => void
  onClear: (blockId: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(anchor ?? '')

  if (!editing) {
    return (
      <div className="flex items-center justify-end gap-1.5 pb-1">
        {anchor && (
          <span data-testid="reader-anchor-fen" className="min-w-0 truncate font-mono text-2xs text-accent" title={anchor}>
            {anchor.split(/\s+/).slice(0, 2).join(' ')}
          </span>
        )}
        <button
          type="button"
          data-testid="reader-anchor-edit"
          title={anchor ? 'Change the starting position of this example' : 'The moves in this line are only clickable from its starting position'}
          onClick={() => {
            setValue(anchor ?? '')
            setEditing(true)
          }}
          className={chipButton}
        >
          {anchor ? 'position set' : 'set position'}
        </button>
      </div>
    )
  }

  const clean = value.trim()
  const valid = isValidFen(clean)
  return (
    <div className="flex flex-wrap items-center gap-1.5 pb-1">
      <input
        data-testid="reader-anchor-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && valid) {
            onSet(blockId, clean)
            setEditing(false)
          }
          if (event.key === 'Escape') setEditing(false)
        }}
        aria-label="Starting position of this example (FEN)"
        placeholder="Starting position of this example (FEN)"
        className="no-drag min-w-0 flex-1 rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-text outline-none focus:border-accent"
      />
      <button type="button" data-testid="reader-anchor-board" title="Use the position on the board" onClick={() => setValue(boardFen)} className={chipButton}>
        use board
      </button>
      <button
        type="button"
        data-testid="reader-anchor-save"
        disabled={!valid}
        onClick={() => {
          onSet(blockId, clean)
          setEditing(false)
        }}
        className={chipButton}
      >
        save
      </button>
      {anchor && (
        <button
          type="button"
          data-testid="reader-anchor-clear"
          title="Forget this position"
          aria-label="Forget this position"
          onClick={() => {
            onClear(blockId)
            setValue('')
            setEditing(false)
          }}
          className={chipButton}
        >
          <X size={9} />
        </button>
      )}
      {clean.length > 0 && !valid && <span className="text-2xs text-danger">Enter a valid FEN</span>}
    </div>
  )
}

export default function BookReader({
  book,
  error,
  aiPaused,
  game,
  onClose,
  onAnalyse,
  onStop,
  onNote,
  onShowPosition,
  onAnchor,
  onClearAnchor,
  onReadChapter,
  onRereadPage
}: Props) {
  const [fontSize, setFontSize] = useState(loadFontSize)
  const [contentsOpen, setContentsOpen] = useState(false)
  const contentsTrigger = useRef<HTMLButtonElement | null>(null)
  const [activeBlockId, setActiveBlockId] = useState<string | null>(book.note.lastBlockId)
  const [activeToken, setActiveToken] = useState<{ blockId: string; index: number } | null>(null)
  const [lastMove, setLastMove] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)
  const noteTimer = useRef<number | null>(null)
  const interacted = useRef(false)
  const noteRef = useRef(book.note)
  noteRef.current = book.note

  const parsed = book.parsed
  // Text PDFs already carry replayed FENs. A scan is replayed from the positions the reader trusts:
  // a hand-set anchor for the AI pages, the previous main line for the OCR pages.
  const anchored = useMemo(() => {
    if (!parsed) return { blocks: [] as BookBlock[], stats: EMPTY_STATS }
    if (parsed.source === 'ai') {
      const result = applyAiAnchors(parsed.blocks, book.anchors)
      return { blocks: result.blocks, stats: result.stats }
    }
    if (parsed.source === 'ocr') return applyAnchors(parsed.blocks, book.anchors)
    return { blocks: parsed.blocks, stats: EMPTY_STATS }
  }, [parsed, book.anchors])
  const blocks = anchored.blocks
  const blockIndex = useMemo(() => new Map<string, BookBlock>(blocks.map((block) => [block.id, block])), [blocks])
  const activeChapterId = activeBlockId ? blockIndex.get(activeBlockId)?.chapterId ?? null : null
  const activeChapter = activeChapterId ? parsed?.outline.find((candidate) => candidate.id === activeChapterId) : undefined
  const activePage = (activeBlockId ? blockIndex.get(activeBlockId)?.page : undefined) ?? book.note.lastPage ?? 1
  const unreadChapter = !!parsed && !!activeChapter && chapterPageRange(parsed, activeChapter.id).some((page) => !book.aiPages.includes(page))

  useEffect(() => {
    try {
      window.localStorage.setItem('books:fontSize', String(fontSize))
    } catch {
      // ignore storage failures
    }
  }, [fontSize])

  useEffect(
    () => () => {
      if (noteTimer.current !== null) window.clearTimeout(noteTimer.current)
    },
    []
  )

  useEffect(() => {
    if (!parsed) return
    const container = scroller.current
    if (!container) return
    // A click that lands before analysis finishes must win over the saved position.
    if (interacted.current) return
    const targetId = book.note.lastBlockId ?? parsed.outline[0]?.startBlockId ?? parsed.blocks[0]?.id
    const target = targetId ? container.querySelector<HTMLElement>(`[data-block-id="${targetId}"]`) : null
    if (target) container.scrollTop = target.offsetTop
    setActiveBlockId(targetId ?? null)
    // Restore only when the book or the parse version changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.meta.id, book.meta.parsedAt])

  const persistScroll = (): void => {
    if (noteTimer.current !== null) window.clearTimeout(noteTimer.current)
    noteTimer.current = window.setTimeout(() => {
      const container = scroller.current
      if (!container) return
      const blocks = Array.from(container.querySelectorAll<HTMLElement>('[data-block-id]'))
      if (blocks.length === 0) return
      const top = container.scrollTop + 32
      let visible = blocks[0]
      for (const element of blocks) {
        if (element.offsetTop <= top) visible = element
        else break
      }
      const id = visible.dataset.blockId
      const block = id ? blockIndex.get(id) : undefined
      if (!block) return
      setActiveBlockId(block.id)
      onNote({ ...noteRef.current, lastBlockId: block.id, lastPage: block.page, scrollTop: container.scrollTop })
    }, 500)
  }

  const cancelPendingScrollSave = (): void => {
    if (noteTimer.current !== null) {
      window.clearTimeout(noteTimer.current)
      noteTimer.current = null
    }
  }

  const jumpToChapter = (id: string): void => {
    const target = parsed?.outline.find((candidate) => candidate.id === id)
    if (!target) return
    interacted.current = true
    cancelPendingScrollSave()
    const element = scroller.current?.querySelector<HTMLElement>(`[data-block-id="${target.startBlockId}"]`)
    setActiveBlockId(target.startBlockId)
    if (!element) return
    element.scrollIntoView({ block: 'start' })
    onNote({ ...noteRef.current, lastBlockId: target.startBlockId, lastPage: target.page })
  }

  const showMove = (blockId: string, index: number, fen: string): void => {
    interacted.current = true
    cancelPendingScrollSave()
    const token = blockIndex.get(blockId)?.moves?.[index]
    setActiveBlockId(blockId)
    setActiveToken({ blockId, index })
    setLastMove(token ? `${moveLabel(token)}${token.flagged ? ' · not replayable from here' : ''}` : null)
    onShowPosition(fen)
  }

  const closeContents = (): void => {
    setContentsOpen(false)
    contentsTrigger.current?.focus()
  }

  const showDiagram = (block: BookBlock): void => {
    if (!block.fen) return
    interacted.current = true
    cancelPendingScrollSave()
    setActiveBlockId(block.id)
    setActiveToken(null)
    setLastMove(`Diagram · PDF page ${block.page}`)
    onShowPosition(block.fen)
  }

  const pageCount = parsed?.pageCount ?? book.meta.pageCount

  const statsLine = (stats: AnchorStats): string =>
    `${stats.accepted} moves replay${stats.accepted === 1 ? 's' : ''}` +
    (stats.repaired ? ` · ${stats.repaired} repaired` : '') +
    (stats.ambiguous ? ` · ${stats.ambiguous} unclear` : '') +
    (stats.unfixable ? ` · ${stats.unfixable} unreadable` : '')

  return (
    <div data-testid="reader" className="book-reader flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <header className="card shrink-0">
        <div className="flex items-center gap-3 px-3 py-3">
          <button type="button" data-testid="reader-back" onClick={onClose} className={iconButton} title="Back to book library" aria-label="Back to book library">
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 data-testid="reader-title" className="truncate text-lg font-semibold text-text" title={book.meta.title}>
              {book.meta.title}
            </h1>
            <div data-testid="reader-page" className="mt-0.5 text-xs tabular-nums text-muted">
              PDF page {activePage}{pageCount ? ` of ${pageCount}` : ''}
            </div>
          </div>
          <div className="flex max-w-[45%] flex-wrap items-center justify-end gap-2">
            <span data-testid="reader-engine" className="chip">
              {book.analysing
                ? `${stageLabel(book)}${book.progress && book.progress.total > 0 ? `… page ${book.progress.page} of ${book.progress.total}` : '…'}`
                : parsed ? engineLabel(parsed, book) : 'Not analysed yet'}
            </span>
            {parsed && parsed.source !== 'text' && (
              <details data-testid="reader-details" className="book-reader-details text-xs text-muted">
                <summary className="min-h-8 cursor-pointer content-center rounded-control px-2 hover:bg-surface-2">
                  Reading details{anchored.stats.unfixable > 0 ? ' · needs attention' : ''}
                </summary>
                <div className="card absolute right-0 top-full z-30 mt-1 w-72 p-3 shadow-xl">
                  <p>{statsLine(anchored.stats)}</p>
                  <p className="mt-2 leading-relaxed">Pages processed and moves replayed do not guarantee a faithful transcription. Compare uncertain positions with the book.</p>
                </div>
              </details>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
          <button
            ref={contentsTrigger}
            type="button"
            data-testid="reader-contents-toggle"
            aria-expanded={contentsOpen}
            aria-controls="book-contents"
            onClick={() => contentsOpen ? closeContents() : setContentsOpen(true)}
            className="btn min-h-8"
          >
            <List size={15} /> Contents
          </button>
          <span className="min-w-0 flex-1 truncate px-1 text-xs text-muted" title={activeChapter?.title}>
            {activeChapter?.title ?? 'Follow the author’s line'}
          </span>
          <div className="flex items-center rounded-control border border-line" role="group" aria-label="Reading text size">
            <button type="button" data-testid="reader-font-down" onClick={() => setFontSize((size) => Math.max(13, size - 1))} disabled={fontSize <= 13} className={iconButton} title="Smaller text" aria-label="Smaller text">
              <Minus size={14} />
            </button>
            <span className="w-10 text-center text-xs tabular-nums text-muted" aria-live="polite">{fontSize}px</span>
            <button type="button" data-testid="reader-font-up" onClick={() => setFontSize((size) => Math.min(20, size + 1))} disabled={fontSize >= 20} className={iconButton} title="Larger text" aria-label="Larger text">
              <Plus size={14} />
            </button>
          </div>
          {parsed && parsed.source !== 'text' && (
            <button type="button" data-testid="reader-reread" onClick={() => onRereadPage(activePage)} disabled={book.analysing} className="btn btn-ghost min-h-8" title={`Read page ${activePage} again with the AI`}>
              <ScanText size={14} /> Read page {activePage} with AI
            </button>
          )}
          <button type="button" data-testid="reader-reanalyse" onClick={onAnalyse} disabled={book.analysing} className="btn btn-ghost min-h-8" title="Read the PDF again">
            <RefreshCw size={14} /> Read PDF again
          </button>
        </div>
      </header>

      {book.analysing && (
        <div data-testid="reader-analysing" className="shrink-0">
          <div className="h-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: book.progress && book.progress.total > 0 ? `${Math.round((book.progress.page / book.progress.total) * 100)}%` : '8%' }}
            />
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="flex-1 text-2xs text-muted">
              {book.stage === 'ai'
                ? 'The AI reads the picture of each page, so its boards become positions. Finished pages are kept — stopping and reopening resumes here.'
                : book.stage === 'ocr'
                  ? 'This book is scanned, so each page is read by OCR. Finished pages are kept — stopping and reopening resumes here.'
                  : 'First read can take a few seconds for large books.'}
            </span>
            {(book.stage === 'ocr' || book.stage === 'ai') && (
              <button type="button" data-testid="reader-stop" onClick={onStop} className={chipButton}>
                <Square size={8} className="mr-1 inline" />
                stop
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div data-testid="reader-error" className="shrink-0 rounded-md border border-danger bg-surface px-3 py-1.5 text-[11px] leading-snug text-danger">
          {error}
        </div>
      )}

      {aiPaused && !book.analysing && (
        <div data-testid="reader-ai-paused" className="shrink-0 rounded-md border border-line bg-surface px-3 py-1.5 text-[11px] leading-snug text-muted">
          AI pass paused: {pausedLabel[aiPaused]}. Pages already read are kept — run it again once the cause is fixed.
        </div>
      )}

      <div className="book-reader-layout" data-contents-open={contentsOpen}>
        <BookContents
          outline={parsed?.outline ?? []}
          activeChapterId={activeChapterId}
          open={contentsOpen}
          onClose={closeContents}
          onDismiss={() => setContentsOpen(false)}
          onSelect={(id) => {
            jumpToChapter(id)
            closeContents()
          }}
        />
        <div ref={scroller} onScroll={persistScroll} data-testid="reader-scroll" className="book-reader-scroll card relative min-h-0 min-w-0 overflow-y-auto">
          <div className="book-reader-prose mx-auto px-6 py-7" style={{ fontSize }}>
            {!parsed && !book.analysing && !error && <div className="py-3 text-[12px] text-muted">Opening book…</div>}
            {parsed && blocks.length === 0 && (
              <div className="py-3 text-[12px] text-muted">No readable text was found on these pages. Try reading the book again.</div>
            )}
            {parsed && unreadChapter && activeChapter && (
              <button
                type="button"
                data-testid="reader-ai-chapter"
                onClick={() => onReadChapter(activeChapter.id)}
                disabled={book.analysing}
                className="mb-3 w-full rounded-lg border border-accent bg-surface px-3 py-2 text-left text-[11px] leading-snug text-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Read “{activeChapter.title}” with the AI ({chapterPageRange(parsed, activeChapter.id).length} pages) — it reads the boards, so the moves
                become clickable.
              </button>
            )}
            {blocks.map((block) => {
              const active = block.id === activeBlockId
              if (block.kind === 'heading') {
                return (
                  <div
                    key={block.id}
                    data-block-id={block.id}
                    data-testid="reader-heading"
                    className={`mb-2 font-semibold leading-snug text-text first:mt-0 ${
                      (block.level ?? 1) <= 1 ? 'mt-6 border-t border-line pt-4 text-[18px] first:border-t-0 first:pt-0' : 'mt-4 text-[15px]'
                    }`}
                    style={{ scrollMarginTop: 8 }}
                  >
                    {block.text || parsed?.outline.find((item) => item.startBlockId === block.id)?.title || 'Chapter'}
                  </div>
                )
              }
              if (block.kind === 'moves') {
                return (
                  <div
                    key={block.id}
                    data-block-id={block.id}
                    data-testid="reader-block"
                    data-active={active}
                    className={`group mb-3 rounded-r-md py-1 ${blockFrame(active)}`}
                    style={{ scrollMarginTop: 8 }}
                  >
                    {(parsed?.source === 'ocr' || (parsed?.source === 'ai' && (block.positionState !== 'verified' || book.anchors[block.id]))) &&
                      (block.moves?.length ?? 0) > 0 && (
                        <AnchorBar
                          blockId={block.id}
                          anchor={book.anchors[block.id]}
                          boardFen={game.fen}
                          onSet={onAnchor}
                          onClear={onClearAnchor}
                        />
                      )}
                    <MoveLine
                      blockId={block.id}
                      tokens={block.moves ?? []}
                      positionState={block.positionState}
                      activeIndex={activeToken?.blockId === block.id ? activeToken.index : null}
                      onMove={showMove}
                    />
                  </div>
                )
              }
              return (
                <p
                  key={block.id}
                  data-block-id={block.id}
                  data-testid="reader-block"
                  data-active={active}
                  className={`mb-3 leading-relaxed text-text/90 ${blockFrame(active)}`}
                  style={{ fontSize, scrollMarginTop: 8 }}
                >
                  {block.text}
                  {block.fen && block.positionState === 'verified' && (
                    <button
                      type="button"
                      data-testid="reader-position"
                      title="Show the position the reader found on this page"
                      onClick={() => showDiagram(block)}
                      className={`${chipButton} ml-2 align-middle`}
                    >
                      position
                    </button>
                  )}
                </p>
              )
            })}
          </div>
        </div>
        <section className="book-reader-position flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto" aria-label="Book position">
          <div data-testid="reader-board" className="card aspect-square w-full shrink-0 overflow-hidden p-2">
            <ChessBoard game={game} />
          </div>
          <div className="card px-4 py-3">
            <div className="section-label">Position from the book</div>
            <div data-testid="reader-last-move" className="mt-2 font-mono text-sm font-semibold text-text">
              {lastMove ?? 'Select a move or diagram'}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              {parsed?.source === 'ocr' && Object.keys(book.anchors).length === 0
                ? 'Set the starting position above an example to follow its moves here.'
                : parsed?.source === 'ai' && anchored.stats.unfixable > 0
                  ? 'Some moves need a starting position. Use “set position” above the line to check it.'
                  : 'Select a move in the text to follow the author’s line on the board.'}
            </p>
          </div>
          <p className="px-1 text-2xs leading-relaxed text-muted">Your reading place is saved on this device.</p>
        </section>
      </div>
    </div>
  )
}
