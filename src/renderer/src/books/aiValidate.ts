import { Chess } from 'chess.js'
import type { AiChapterHint, AiRawBlock, AiRawPage } from '@shared/ai'
import type { AiBatchRecord, AiPageRecord, BookBlock, BookColor, BookOcrPage, Chapter, ParsedBook, SanToken } from '@shared/book'
import { bookFromOcrPages } from './ocrPdf.ts'
import { replayTokens, scanMoveCandidates, START_FEN, type MoveCandidate, type ReplayResult } from './parseText.ts'

const FEN_WITH_COUNTS = /(?:[rnbqkpRNBQKP1-8]+\/){7}[rnbqkpRNBQKP1-8]+\s+[wb]\s+[KQkq-]+\s+[a-h1-8-]+\s+\d+\s+\d+/
const FEN_PLACEMENT = /(?:[rnbqkpRNBQKP1-8]+\/){7}[rnbqkpRNBQKP1-8]+\s+[wb]\s+[KQkq-]+\s+[a-h1-8-]+/
/** The detail prompt asks for placement + side only, because castling and en passant cannot be read off a scan. */
const FEN_BARE = /(?:[rnbqkpRNBQKP1-8]+\/){7}[rnbqkpRNBQKP1-8]+\s+[wb]/
const NUMBERED_SAN = /^(\d{1,3})(\.\.\.|\.)\s*(\S.*)$/

function loads(fen: string): boolean {
  try {
    new Chess(fen)
    return true
  } catch {
    return false
  }
}

/** A scan loses the move counters more often than the placement, so a short FEN is completed rather than refused. */
export function usableFen(value: string | undefined): string | null {
  const text = (value ?? '').trim().replace(/\s+/g, ' ')
  const full = FEN_WITH_COUNTS.exec(text)?.[0]
  if (full && loads(full)) return full
  const short = FEN_PLACEMENT.exec(text)?.[0]
  if (short) {
    const completed = `${short} 0 1`
    return loads(completed) ? completed : null
  }
  const bare = FEN_BARE.exec(text)?.[0]
  if (!bare) return null
  const completed = `${bare} - - 0 1`
  return loads(completed) ? completed : null
}

function withTurn(fen: string, color: BookColor): string {
  const parts = fen.split(' ')
  if (parts[1] === color) return fen
  const aligned = [parts[0], color, ...parts.slice(2)].join(' ')
  return loads(aligned) ? aligned : fen
}

function toCandidate(san: string): MoveCandidate | null {
  const text = san.trim().replace(/^[-–•*]\s*/, '')
  if (!text) return null
  const numbered = NUMBERED_SAN.exec(text)
  if (numbered) {
    return { san: numbered[3].trim(), moveNumber: Number(numbered[1]), color: numbered[2] === '...' ? 'b' : 'w', variationDepth: 0, explicit: true }
  }
  return { san: text, moveNumber: null, color: null, variationDepth: 0, explicit: false }
}

function candidates(moves: string[] | undefined, text: string): MoveCandidate[] {
  if (Array.isArray(moves) && moves.length > 0) {
    return moves.map(toCandidate).filter((candidate): candidate is MoveCandidate => candidate !== null)
  }
  return scanMoveCandidates(text, true)
}

export function validatePages(pages: AiRawPage[], requested: number[], model: string, ms: number, tokens: number): AiPageRecord[] {
  const wanted = new Set(requested)
  const records: AiPageRecord[] = []
  for (const entry of pages) {
    if (!Number.isInteger(entry?.page) || !wanted.has(entry.page)) continue
    const blocks = (entry.blocks ?? []).filter((block): block is AiRawBlock => !!block && typeof block.kind === 'string')
    records.push({ page: entry.page, model, ms, tokens, blocks })
  }
  return records
}

export function chapterHints(batches: AiBatchRecord[]): AiChapterHint[] {
  const hints: AiChapterHint[] = []
  const seen = new Set<string>()
  for (const batch of batches) {
    for (const page of batch.pages ?? []) {
      if (!Number.isInteger(page?.page)) continue
      for (const chapter of page.chapters ?? []) {
        const title = typeof chapter?.title === 'string' ? chapter.title.trim().replace(/\s+/g, ' ').slice(0, 120) : ''
        if (!title) continue
        const key = `${title.toLowerCase()}@${page.page}`
        if (seen.has(key)) continue
        seen.add(key)
        const level = Number.isFinite(chapter?.level) ? Math.min(3, Math.max(1, Math.round(chapter.level as number))) : 2
        hints.push({ title, level, page: page.page })
      }
    }
  }
  return hints.sort((a, b) => a.page - b.page || a.title.localeCompare(b.title))
}

function diagramOf(block: AiRawBlock): { fen: string; caption: string } | null {
  if (block.kind !== 'diagram') return null
  const fen = usableFen(block.fen)
  if (!fen) return null
  return { fen, caption: (block.caption ?? block.text ?? '').trim() }
}

function flaggedTokens(list: MoveCandidate[]): SanToken[] {
  return list.map((candidate) => ({ san: candidate.san, moveNumber: candidate.moveNumber, color: candidate.color, variationDepth: candidate.variationDepth, fenAfter: START_FEN, flagged: true }))
}

export function assembleBook(input: { pageCount: number; aiPages: AiPageRecord[]; ocrPages: BookOcrPage[]; chapters: AiChapterHint[] }): ParsedBook {
  const aiByPage = new Map(input.aiPages.map((record) => [record.page, record]))
  const covered = new Set(aiByPage.keys())
  const ocrBook = bookFromOcrPages(input.ocrPages.filter((record) => !covered.has(record.page)), input.pageCount)
  const ocrByPage = new Map<number, BookBlock[]>()
  for (const block of ocrBook.blocks) {
    const list = ocrByPage.get(block.page) ?? []
    list.push(block)
    ocrByPage.set(block.page, list)
  }
  const ocrChapters = new Map(ocrBook.outline.map((chapter) => [chapter.startBlockId, chapter]))

  const hintsByPage = new Map<number, AiChapterHint[]>()
  for (const hint of input.chapters) {
    const list = hintsByPage.get(hint.page) ?? []
    list.push(hint)
    hintsByPage.set(hint.page, list)
  }

  const titleKey = (title: string): string => title.trim().replace(/\s+/g, ' ').toLowerCase()
  /* Punctuation drifts between retries ("21 g5" against "21.g5"), so compare the words only. */
  const proseFingerprint = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  /* Move annotations drift the same way ("g6" against "g6!"); the move itself is what repeats. */
  const moveFingerprint = (list: MoveCandidate[]): string =>
    JSON.stringify(list.map((candidate) => [candidate.moveNumber, candidate.color, candidate.san.replace(/[!?]+$/, ''), candidate.variationDepth]))

  /* How often the transcription repeats a line tells us whether it is page overlap or book structure:
     a repeated body paragraph or move line appears on two pages, while exercise prompts and result lines
     recur on many pages and must survive. */
  const pagesWithProse = new Map<string, Set<number>>()
  const pagesWithMoveLine = new Map<string, Set<number>>()
  const pagesWithTitle = new Map<string, Set<number>>()
  const notePage = (map: Map<string, Set<number>>, key: string, page: number): void => {
    const set = map.get(key) ?? new Set<number>()
    set.add(page)
    map.set(key, set)
  }
  for (const record of input.aiPages) {
    for (const raw of record.blocks ?? []) {
      const text = (raw.text ?? '').trim()
      if (raw.kind === 'prose' && text.length >= 40) notePage(pagesWithProse, proseFingerprint(text), record.page)
      if (raw.kind === 'heading' && text) notePage(pagesWithTitle, titleKey(text), record.page)
      if (raw.kind === 'moves') {
        const list = candidates(raw.moves, text)
        if (list.length > 0) notePage(pagesWithMoveLine, moveFingerprint(list), record.page)
      }
    }
  }
  /* A title printed on a large share of pages is a running header, not a new chapter. */
  const runningTitlePages = Math.max(4, Math.ceil(input.pageCount * 0.02))

  /* A page that shares a run of body paragraphs with the page before it is a second transcription of that
     page. Prompt-like lines are excluded by their high document frequency, so exercise pages are never
     mistaken for a re-read. */
  const proseByPage = new Map<number, string[]>()
  for (const [fingerprint, pages] of pagesWithProse) {
    if (pages.size > 2) continue
    for (const page of pages) {
      const list = proseByPage.get(page) ?? []
      list.push(fingerprint)
      proseByPage.set(page, list)
    }
  }
  const reReadPages = new Set<number>()
  const transcribedPages = [...proseByPage.keys()].sort((a, b) => a - b)
  for (let index = 1; index < transcribedPages.length; index += 1) {
    const previous = proseByPage.get(transcribedPages[index - 1]) ?? []
    const current = proseByPage.get(transcribedPages[index]) ?? []
    const seen = new Set(previous)
    const shared = current.filter((fingerprint) => seen.has(fingerprint)).length
    if (shared >= 2) reReadPages.add(transcribedPages[index])
  }

  const blocks: BookBlock[] = []
  const outline: Chapter[] = []
  let order = 0
  let chapterId: string | null = null
  let cursorFen: string | null = null
  let titlesOnPage = new Set<string>()
  const headingBlocks = new Set<string>()
  const lastProsePage = new Map<string, number>()
  const lastMovePage = new Map<string, number>()
  const lastTitlePage = new Map<string, number>()

  const repeatedOnNearbyPage = (map: Map<string, number>, key: string, page: number): boolean => {
    const seen = map.get(key)
    return seen !== undefined && page - seen <= 1
  }

  const isRunningTitle = (key: string, page: number): boolean => {
    const seen = lastTitlePage.get(key)
    if (seen === undefined || seen >= page) return false
    const pages = pagesWithTitle.get(key)
    if ((pages?.size ?? 0) >= runningTitlePages) return true
    if (page - seen <= 5) return true
    /* Repetitions inside one chapter's page range are its page headers; a few repeats across a whole book are sections. */
    if (pages && pages.size >= 2 && Math.max(...pages) - Math.min(...pages) <= 20) return true
    return false
  }

  const openChapter = (title: string, level: number, page: number, startBlockId: string): void => {
    const clean = title.trim().replace(/\s+/g, ' ').slice(0, 120) || 'Untitled'
    chapterId = `c${outline.length}`
    outline.push({ id: chapterId, title: clean, level, page, startBlockId })
    titlesOnPage.add(titleKey(clean))
    lastTitlePage.set(titleKey(clean), page)
    cursorFen = null
  }

  const push = (block: Omit<BookBlock, 'id' | 'order' | 'chapterId'>): BookBlock => {
    const full: BookBlock = { ...block, id: `b${order}`, order, chapterId }
    blocks.push(full)
    order += 1
    return full
  }

  /* A structure-only pass has hints but no blocks yet, so hint pages have to be visited too or the map stays invisible. */
  const pages = new Set([...covered, ...ocrByPage.keys(), ...hintsByPage.keys()])
  for (const page of [...pages].sort((a, b) => a - b)) {
    titlesOnPage = new Set<string>()
    const hints = hintsByPage.get(page) ?? []
    const ai = aiByPage.get(page)
    const ocrBlocks = ocrByPage.get(page) ?? []

    /* Nothing transcribed here yet, so the heading the structure pass read is the page's only content.
       Pushing it gives the rail a real anchor; a later detail pass supplies its own heading instead. */
    if (!ai && ocrBlocks.length === 0) {
      for (const hint of hints) {
        if (isRunningTitle(titleKey(hint.title), page)) continue
        openChapter(hint.title, hint.level, page, `b${order}`)
        push({ page, kind: 'heading', level: hint.level, text: hint.title, origin: 'ai' })
      }
      continue
    }

    for (const hint of hints) {
      if (isRunningTitle(titleKey(hint.title), page)) continue
      openChapter(hint.title, hint.level, page, `b${order}`)
    }

    if (!ai) {
      for (const block of ocrBlocks) {
        const chapter = block.kind === 'heading' ? ocrChapters.get(block.id) : undefined
        if (chapter && !titlesOnPage.has(chapter.title.toLowerCase())) openChapter(chapter.title, chapter.level, page, `b${order}`)
        push({ page, kind: block.kind, level: block.level, text: block.text, moves: block.moves, origin: 'ocr' })
      }
      continue
    }

    let pageFen: string | null = cursorFen
    for (const raw of ai.blocks) {
      const diagram = diagramOf(raw)
      if (diagram) {
        pageFen = diagram.fen
        push({ page, kind: 'paragraph', text: diagram.caption || 'Diagram', origin: 'ai', fen: diagram.fen, positionState: 'verified' })
        continue
      }
      const text = (raw.text ?? '').trim()
      if (raw.kind === 'moves') {
        const list = candidates(raw.moves, text)
        if (list.length === 0) continue
        const signature = moveFingerprint(list)
        if ((pagesWithMoveLine.get(signature)?.size ?? 0) <= 2) {
          if (repeatedOnNearbyPage(lastMovePage, signature, page)) continue
          lastMovePage.set(signature, page)
        }
        const base: string | null = pageFen ?? cursorFen
        const firstColour = list.find((candidate) => candidate.color)?.color
        const start: string | null = base ? withTurn(base, firstColour ?? (new Chess(base).turn() as BookColor)) : null
        const replayed: ReplayResult = start ? replayTokens(list, start) : { tokens: flaggedTokens(list), fen: START_FEN }
        const positionState: BookBlock['positionState'] = start ? (replayed.tokens.some((token) => !token.flagged) ? 'verified' : 'replay-failed') : 'no-position'
        if (positionState === 'verified') cursorFen = replayed.fen
        push({ page, kind: 'moves', text, moves: replayed.tokens, origin: 'ai', fen: start ?? undefined, positionState })
        continue
      }
      if (!text) continue
      if (raw.kind === 'heading') {
        const key = titleKey(text)
        if (isRunningTitle(key, page)) continue
        if (!titlesOnPage.has(key)) openChapter(text, raw.level ?? 2, page, `b${order}`)
        headingBlocks.add(key)
        lastTitlePage.set(key, page)
        push({ page, kind: 'heading', level: raw.level, text, origin: 'ai' })
        continue
      }
      if (headingBlocks.has(titleKey(text))) continue
      if (text.length >= 40) {
        const key = proseFingerprint(text)
        /* A line repeated on many pages is structural (prompt, result, refrain); keep every copy. */
        if ((pagesWithProse.get(key)?.size ?? 0) <= 2) {
          const nearby = repeatedOnNearbyPage(lastProsePage, key, page)
          if (nearby && (reReadPages.has(page) || text.length >= 45)) continue
          lastProsePage.set(key, page)
        }
      }
      push({ page, kind: 'paragraph', text, origin: 'ai' })
    }
    cursorFen = pageFen ?? cursorFen
  }

  const source: ParsedBook['source'] = covered.size >= ocrByPage.size ? 'ai' : 'ocr'
  return { schemaVersion: 3, pageCount: input.pageCount, source, outline, blocks }
}
