import type { BookOcrPage, OcrWord } from '@shared/book'
import { scanMoveCandidates, type TextLine } from './parseText.ts'

export type OcrPage = BookOcrPage

type Row = { centre: number; words: OcrWord[] }

const MIN_COLUMN_GAP = 20

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function centreY(word: OcrWord): number {
  return (word.bbox.y0 + word.bbox.y1) / 2
}

function rowsOf(words: OcrWord[]): Row[] {
  const tolerance = median(words.map((word) => word.bbox.y1 - word.bbox.y0)) * 0.65
  const rows: Row[] = []
  for (const word of [...words].sort((a, b) => centreY(a) - centreY(b))) {
    const centre = centreY(word)
    const row = rows.find((candidate) => Math.abs(candidate.centre - centre) <= tolerance)
    if (row) {
      row.words.push(word)
      row.centre = (row.centre * (row.words.length - 1) + centre) / row.words.length
    } else rows.push({ centre, words: [word] })
  }
  return rows.sort((a, b) => a.centre - b.centre)
}

function lineText(row: Row, gapUnit: number): { text: string; x0: number; x1: number; height: number } {
  const ordered = [...row.words].sort((a, b) => a.bbox.x0 - b.bbox.x0)
  let text = ''
  let previousEnd: number | null = null
  for (const word of ordered) {
    if (previousEnd !== null && word.bbox.x0 - previousEnd > gapUnit && !text.endsWith(' ')) text += ' '
    text += word.text
    previousEnd = word.bbox.x1
  }
  return {
    text: text.replace(/\s+/g, ' ').trim(),
    x0: ordered[0].bbox.x0,
    x1: ordered[ordered.length - 1].bbox.x1,
    height: median(ordered.map((word) => word.bbox.y1 - word.bbox.y0))
  }
}

/**
 * Board diagrams and page furniture OCR as rows of isolated glyphs. A row is content when it
 * holds a real word or a move, so label rows never reach the parser as prose or headings.
 * The word test runs per word: joined together, the file labels of a diagram spell a word.
 */
function isContent(words: OcrWord[], text: string): boolean {
  return words.some((word) => /[A-Za-z]{3,}/.test(word.text)) || scanMoveCandidates(text, true).length > 0
}

/**
 * OCR y grows downwards while PDF y grows upwards, and buildBlocks orders blocks by
 * descending y. Flipping here keeps the parser unaware of which pipeline produced a line.
 */
export function pageLines(input: OcrPage, pointsPerPixel: number): TextLine[] {
  const words = input.words.filter((word) => word.text.trim().length > 0)
  if (words.length === 0) return []

  const gapUnit = median(words.map((word) => word.bbox.y1 - word.bbox.y0)) * 0.35
  const occupied = new Uint8Array(Math.max(1, Math.ceil(input.width)))
  for (const word of words) {
    for (let x = Math.max(0, Math.floor(word.bbox.x0)); x < Math.min(occupied.length, Math.ceil(word.bbox.x1)); x += 1) {
      occupied[x] = 1
    }
  }

  let bestStart = -1
  let bestRun = 0
  let run = 0
  let runStart = 0
  const from = Math.floor(input.width * 0.32)
  const to = Math.floor(input.width * 0.68)
  for (let x = from; x < to; x += 1) {
    if (occupied[x] === 0) {
      if (run === 0) runStart = x
      run += 1
      if (run > bestRun) {
        bestRun = run
        bestStart = runStart
      }
    } else run = 0
  }

  const boundary = bestRun >= MIN_COLUMN_GAP ? bestStart + bestRun / 2 : null
  const groups: OcrWord[][] = []
  if (boundary === null) {
    groups.push(words)
  } else {
    const left = words.filter((word) => (word.bbox.x0 + word.bbox.x1) / 2 < boundary)
    const right = words.filter((word) => (word.bbox.x0 + word.bbox.x1) / 2 >= boundary)
    if (left.length > 0) groups.push(left)
    if (right.length > 0) groups.push(right)
  }

  const lines: TextLine[] = []
  for (const group of groups) {
    for (const row of rowsOf(group)) {
      const line = lineText(row, gapUnit)
      if (!line.text || !isContent(row.words, line.text)) continue
      lines.push({
        page: input.page,
        text: line.text,
        y: (input.height - row.centre) * pointsPerPixel,
        x: line.x0 * pointsPerPixel,
        size: Math.max(1, Math.round(line.height * pointsPerPixel * 2) / 2)
      })
    }
  }
  return lines
}
