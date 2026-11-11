import { Chess } from 'chess.js'
import type { BookBlock, BookColor, Chapter, SanToken } from '@shared/book'
import { looksLikeMove } from './moveSlots.ts'

export type TextLine = { page: number; text: string; y: number; x: number; size: number }

export type MoveCandidate = {
  san: string
  moveNumber: number | null
  color: BookColor | null
  variationDepth: number
  explicit: boolean
}

const FIGURINES: Record<string, string> = {
  '♔': 'K', '♕': 'Q', '♖': 'R', '♗': 'B', '♘': 'N',
  '♚': 'K', '♛': 'Q', '♜': 'R', '♝': 'B', '♞': 'N'
}

const MOVE_BODY = /^(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?$/
const MOVE_NUMBER = /^(\d+)\.(\.\.)?(.*)$/

export function figurineToLetter(text: string): string {
  return text.replace(/[♔♕♖♗♘♚♛♜♝♞]/g, (glyph) => FIGURINES[glyph] ?? glyph)
}

function cleanWord(word: string): string {
  return figurineToLetter(word).replace(/^[("'“”‘’]+/, '').replace(/[)"'“”‘’]+$/, '')
}

function sanOf(word: string, lenient = false): string | null {
  const stripped = word.replace(/[!?]+$/, '').replace(/^[("'“”‘’]+/, '').replace(/[,;:.)\]"'“”‘’]+$/, '')
  if (!stripped) return null
  const candidate = stripped.replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O')
  // a scan corrupts single characters inside a move, so the shape is judged by what could repair it
  if (lenient) return looksLikeMove(candidate) ? candidate : null
  if (!MOVE_BODY.test(candidate)) return null
  if (!/[a-h][1-8]/.test(candidate) && !candidate.startsWith('O-O')) return null
  return candidate
}

export function scanMoveCandidates(text: string, lenient = false): MoveCandidate[] {
  const parts = text.match(/\(|\)|[^\s()]+/g) ?? []
  const candidates: MoveCandidate[] = []
  let depth = 0
  let pending: { moveNumber: number; color: BookColor } | null = null

  for (const part of parts) {
    if (!part.trim()) continue
    if (part === '(') {
      depth += 1
      pending = null
      continue
    }
    if (part === ')') {
      depth = Math.max(0, depth - 1)
      pending = null
      continue
    }

    const clean = cleanWord(part)
    if (!clean) continue

    const numbered = MOVE_NUMBER.exec(clean)
    let word = clean
    let moveNumber: number | null = null
    let color: BookColor | null = null
    let explicit = false

    if (numbered) {
      moveNumber = Number(numbered[1])
      color = numbered[2] ? 'b' : 'w'
      explicit = true
      word = numbered[3] ?? ''
      if (!word) {
        pending = { moveNumber, color }
        continue
      }
    } else if (lenient) {
      // Scans drop the dot after a move number, so "21Hd2" arrives as one word.
      const glued = /^(\d{1,2})(?=[A-Za-z])/.exec(clean)
      if (glued) {
        moveNumber = Number(glued[1])
        explicit = true
        word = clean.slice(glued[1].length)
      }
    }

    const san = word ? sanOf(word, lenient) : null
    if (!san) {
      pending = null
      continue
    }

    const attached = pending
    pending = null
    candidates.push({
      san,
      moveNumber: moveNumber ?? attached?.moveNumber ?? null,
      color: color ?? attached?.color ?? null,
      variationDepth: depth,
      explicit: explicit || attached !== null
    })
  }

  return candidates
}

export type ReplayResult = { tokens: SanToken[]; fen: string }

export function replayTokens(candidates: MoveCandidate[], startFen: string): ReplayResult {
  const chess = new Chess(startFen)
  const tokens: SanToken[] = []

  for (const candidate of candidates) {
    const expectedColor = candidate.color
    const turnMatches = !expectedColor || expectedColor === chess.turn()
    if (!turnMatches) {
      tokens.push({ san: candidate.san, moveNumber: candidate.moveNumber, color: candidate.color, variationDepth: candidate.variationDepth, fenAfter: chess.fen(), flagged: true })
      continue
    }
    try {
      const move = chess.move(candidate.san)
      tokens.push({ san: move.san, moveNumber: candidate.moveNumber, color: move.color, variationDepth: candidate.variationDepth, fenAfter: chess.fen() })
    } catch {
      tokens.push({ san: candidate.san, moveNumber: candidate.moveNumber, color: candidate.color, variationDepth: candidate.variationDepth, fenAfter: chess.fen(), flagged: true })
    }
  }

  return { tokens, fen: chess.fen() }
}

const FEN_PATTERN = /(?:[rnbqkpRNBQKP1-8]+\/){7}[rnbqkpRNBQKP1-8]+\s+[wb]\s+[KQkq-]+\s+[a-h1-8-]+\s+\d+\s+\d+/
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const CHAPTER_WORDS = /^(chapter|part|section|introduction|contents|preface|appendix|conclusion)\b/i

function isMoveLine(text: string, lenient = false): boolean {
  if (lenient) {
    // Scanned pages lose the dots and spaces that mark a move, so a numbered move is the signal.
    return scanMoveCandidates(text, true).some((candidate) => candidate.explicit)
  }
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 2) return false
  let moves = 0
  let others = 0
  for (const word of words) {
    if (word === '(' || word === ')') continue
    const clean = cleanWord(word)
    if (!clean) continue
    if (MOVE_NUMBER.test(clean) || sanOf(clean)) moves += 1
    else others += 1
  }
  return moves >= 2 && others <= 1
}

type Paragraph = { page: number; lines: TextLine[]; text: string; size: number }

const OCR_HEADING_JUNK = /@|©|\bisbn\b|photocop|reserved|\d{3}-\d/i
const TITLE_TOKEN = /^[A-Za-z][A-Za-z'’-]*$/
const TITLE_NUMBER = /^\d+[.)]?$/
const MIN_FURNITURE_PAGES = 3
const MIN_MOVE_SHARE = 0.5
const MAX_TITLE_TOKENS = 5
/** A title ends on a content word; a sentence cut off by the column edge does not. */
const TITLE_TAIL_WORD = /^(the|of|a|an|and|by|is|for|to|in|with|as|that|this|from|on|at|it|be|are|was|were|not|but|or)$/i
const VOWEL = /[aeiouy]/i

/**
 * A scan renders board fragments as very large glyphs, so glyph height alone cannot mark a
 * heading in the OCR pipeline: the text has to look like a title, hold no moves, and not be
 * the running header repeated across the book.
 */
function isOcrHeading(paragraph: Paragraph, pages: Map<string, Set<number>>): boolean {
  const text = paragraph.text
  if (OCR_HEADING_JUNK.test(text)) return false
  const tokens = text.split(/\s+/).filter(Boolean)
  if (tokens.length === 0 || tokens.length > MAX_TITLE_TOKENS) return false
  if (!tokens.every((token) => TITLE_TOKEN.test(token) || TITLE_NUMBER.test(token))) return false
  if (!/[A-Za-z]{4,}/.test(text)) return false
  if (!/^[A-Z]/.test(tokens[0])) return false
  if (/[.!?;:,%]$/.test(text)) return false
  if (tokens.some((token) => token.endsWith('-'))) return false
  if (TITLE_TAIL_WORD.test(tokens[tokens.length - 1])) return false
  // damaged glyphs lose their vowels, and a real title has no consonant-only word
  if (tokens.some((token) => token.length >= 3 && /^[A-Za-z]+$/.test(token) && !VOWEL.test(token))) return false
  if (scanMoveCandidates(text, true).length > 0) return false
  if ((pages.get(text.toLowerCase())?.size ?? 0) >= MIN_FURNITURE_PAGES) return false
  return true
}

/**
 * The rail is a table of contents, not a transcript. One entry per page keeps the title page and
 * the contents listing out, and a title that appears again later hands its chapter to the later
 * heading so the front-matter mention does not swallow the body text.
 */
function railHeadings(paragraphs: Paragraph[], headings: boolean[]): Set<number> {
  const picked: number[] = []
  for (const [index, paragraph] of paragraphs.entries()) {
    if (!headings[index]) continue
    const previous = picked.length > 0 ? paragraphs[picked[picked.length - 1]] : null
    if (previous) {
      if (previous.text.toLowerCase() === paragraph.text.toLowerCase()) {
        picked[picked.length - 1] = index
        continue
      }
      if (previous.page === paragraph.page) continue
    }
    picked.push(index)
  }
  return new Set(picked)
}

function pagesByText(paragraphs: Paragraph[]): Map<string, Set<number>> {
  const pages = new Map<string, Set<number>>()
  for (const paragraph of paragraphs) {
    const key = paragraph.text.toLowerCase()
    const found = pages.get(key)
    if (found) found.add(paragraph.page)
    else pages.set(key, new Set([paragraph.page]))
  }
  return pages
}

function roundSize(size: number): number {
  return Math.round(size * 2) / 2
}

function median(values: number[]): number {
  if (values.length === 0) return 10
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function paragraphize(lines: TextLine[], bodySize: number, lenient: boolean): Paragraph[] {
  const paragraphs: Paragraph[] = []
  const ordered = [...lines].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)
  let current: TextLine[] = []

  const flush = (): void => {
    if (current.length === 0) return
    paragraphs.push({
      page: current[0].page,
      lines: current,
      text: current.map((line) => line.text.trim()).join(' ').replace(/\s+/g, ' ').trim(),
      size: roundSize(median(current.map((line) => line.size)))
    })
    current = []
  }

  for (const line of ordered) {
    if (!line.text.trim()) continue
    const previous = current[current.length - 1]
    const gap = previous && previous.page === line.page ? previous.y - line.y : 0
    const sameBlock = previous && previous.page === line.page && gap <= bodySize * 1.8 && Math.abs(line.size - previous.size) < 1
    const moveBoundary = previous ? isMoveLine(previous.text, lenient) !== isMoveLine(line.text, lenient) : false
    if (previous && (!sameBlock || moveBoundary)) flush()
    current.push(line)
  }
  flush()
  return paragraphs
}

export type BuildOptions = { lenient?: boolean }

export function buildBlocks(lines: TextLine[], options: BuildOptions = {}): { blocks: BookBlock[]; outline: Chapter[] } {
  const lenient = options.lenient === true
  const bodySize = median(lines.map((line) => roundSize(line.size)))
  const paragraphs = paragraphize(lines, bodySize, lenient)
  const furniture = lenient ? pagesByText(paragraphs) : new Map<string, Set<number>>()
  const headingFlags = paragraphs.map((paragraph) => {
    const big = paragraph.size >= bodySize * 1.15
    return lenient ? (big || CHAPTER_WORDS.test(paragraph.text)) && isOcrHeading(paragraph, furniture) : big || CHAPTER_WORDS.test(paragraph.text)
  })
  const rail = lenient ? railHeadings(paragraphs, headingFlags) : null
  const blocks: BookBlock[] = []
  const outline: Chapter[] = []
  let cursorFen = START_FEN
  let chapterId: string | null = null
  let order = 0

  for (const [index, paragraph] of paragraphs.entries()) {
    const heading = headingFlags[index]
    const blockId = `b${order}`

    if (heading) {
      const level = paragraph.size >= bodySize * 1.6 ? 1 : 2
      const inRail = rail === null || rail.has(index)
      if (inRail) chapterId = `c${outline.length}`
      blocks.push({ id: blockId, page: paragraph.page, order, chapterId, kind: 'heading', level, text: paragraph.text })
      if (inRail) outline.push({ id: chapterId as string, title: paragraph.text.slice(0, 120), level, page: paragraph.page, startBlockId: blockId })
      order += 1
      continue
    }

    if (lenient) {
      const shape = scanMoveCandidates(paragraph.text, true)
      const words = paragraph.text.split(/\s+/).filter(Boolean).length
      const numbered = paragraph.lines.some((line) => isMoveLine(line.text, true))
      // commentary that merely mentions a move stays a sentence: a moves block is mostly moves
      const kind: 'moves' | 'paragraph' =
        shape.length >= 2 && shape.length >= words * MIN_MOVE_SHARE && numbered ? 'moves' : 'paragraph'
      blocks.push({ id: blockId, page: paragraph.page, order, chapterId, kind, text: paragraph.text })
      order += 1
      continue
    }

    const fenInText = FEN_PATTERN.exec(paragraph.text)
    if (fenInText) cursorFen = fenInText[0]
    cursorFen = cursorFen.trim()

    const candidates = scanMoveCandidates(paragraph.text)
    const firstNumbered = candidates.find((candidate) => candidate.explicit && candidate.moveNumber === 1 && candidate.color === 'w')
    const startFen = firstNumbered ? START_FEN : cursorFen
    const replayed = candidates.length > 0 ? replayTokens(candidates, startFen) : { tokens: [], fen: startFen }
    const valid = replayed.tokens.filter((token) => !token.flagged)
    const explicit = valid.some((token) => token.moveNumber !== null)
    const isMoveBlock = valid.length >= 2 && (explicit || valid.length >= 4)

    if (isMoveBlock) {
      const moves = replayed.tokens.filter((token) => !token.flagged || token.moveNumber !== null)
      const lastValid = [...moves].reverse().find((token) => !token.flagged)
      if (lastValid) cursorFen = lastValid.fenAfter
      blocks.push({ id: blockId, page: paragraph.page, order, chapterId, kind: 'moves', text: paragraph.text, moves })
    } else {
      blocks.push({ id: blockId, page: paragraph.page, order, chapterId, kind: 'paragraph', text: paragraph.text })
    }
    order += 1
  }

  return { blocks, outline }
}
