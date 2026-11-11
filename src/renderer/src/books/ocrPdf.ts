import type { BookOcrPage, OcrWord, ParsedBook } from '@shared/book'
import { pageLines } from './columns.ts'
import { buildBlocks } from './parseText.ts'

export type Raster = { page: number; dpi: number; width: number; height: number; image: unknown }

export type OcrEngine = {
  recognize: (raster: Raster) => Promise<{ words: OcrWord[]; confidence: number; ms: number }>
  dispose: () => Promise<void>
}

export type OcrDeps = {
  rasterise: (page: number, dpi: number) => Promise<Raster>
  engine: OcrEngine
}

export type OcrOptions = {
  pages?: number[]
  dpi?: number
  retryDpi?: number
  minConfidence?: number
  onProgress?: (done: number, total: number, page: number) => void
  /** Called as each page succeeds so an interrupted pass can resume from the cache. */
  onRecord?: (record: BookOcrPage) => Promise<void> | void
  /** Checked between pages; stopping keeps every page already read. */
  shouldStop?: () => boolean
}

export type OcrOutcome = { page: number; dpi: number; record?: BookOcrPage; error?: string }

export type OcrReport = { outcomes: OcrOutcome[]; failed: number; aborted: boolean }

const DEFAULT_DPI = 250
const RETRY_DPI = 300
const MIN_CONFIDENCE = 70
/** Three unreadable pages in a row means the scan or the engine is wrong, not the page. */
const MAX_CONSECUTIVE_FAILURES = 3
const FAILURE_RATIO = 0.2
const MIN_RATIO_SAMPLE = 10

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

async function readPage(deps: OcrDeps, page: number, dpi: number, retryDpi: number, minConfidence: number): Promise<{ raster: Raster; record: BookOcrPage }> {
  const raster = await deps.rasterise(page, dpi)
  const first = await deps.engine.recognize(raster)
  if (first.confidence >= minConfidence || retryDpi === dpi) return { raster, record: { ...toRecord(raster, first), dpi } }
  const retry = await deps.rasterise(page, retryDpi)
  const second = await deps.engine.recognize(retry)
  return second.confidence > first.confidence ? { raster: retry, record: toRecord(retry, second) } : { raster, record: toRecord(raster, first) }
}

function toRecord(raster: Raster, read: { words: OcrWord[]; confidence: number; ms: number }): BookOcrPage {
  return { page: raster.page, width: raster.width, height: raster.height, dpi: raster.dpi, words: read.words, confidence: read.confidence, ms: read.ms }
}

export async function ocrPages(total: number, deps: OcrDeps, options: OcrOptions = {}): Promise<OcrReport> {
  const dpi = options.dpi ?? DEFAULT_DPI
  const retryDpi = options.retryDpi ?? RETRY_DPI
  const minConfidence = options.minConfidence ?? MIN_CONFIDENCE
  const targets = (options.pages ?? Array.from({ length: total }, (_, index) => index + 1)).filter((page) => page >= 1 && page <= total).sort((a, b) => a - b)

  const outcomes: OcrOutcome[] = []
  let failed = 0
  let consecutive = 0
  let aborted = false

  for (const page of targets) {
    let outcome: OcrOutcome
    try {
      const { record } = await readPage(deps, page, dpi, retryDpi, minConfidence)
      outcome = record.words.length === 0 ? { page, dpi: record.dpi, error: 'No words recognised' } : { page, dpi: record.dpi, record }
    } catch (error) {
      outcome = { page, dpi, error: messageOf(error) }
    }

    if (outcome.error) {
      failed += 1
      consecutive += 1
    } else consecutive = 0
    if (outcome.record) await options.onRecord?.(outcome.record)
    outcomes.push(outcome)
    options.onProgress?.(outcomes.length, targets.length, page)

    const ratioFailure = outcomes.length >= MIN_RATIO_SAMPLE && failed / outcomes.length > FAILURE_RATIO
    if (consecutive >= MAX_CONSECUTIVE_FAILURES || ratioFailure || options.shouldStop?.()) {
      aborted = true
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return { outcomes, failed, aborted }
}

/** One inch is 72 points, so the raster dpi alone converts pixels back to page points. */
export function bookFromOcrPages(pages: BookOcrPage[], pageCount: number): ParsedBook {
  const lines = [...pages]
    .sort((a, b) => a.page - b.page)
    .flatMap((page) => pageLines(page, 72 / page.dpi))
  const { blocks, outline } = buildBlocks(lines, { lenient: true })
  return { schemaVersion: 2, pageCount, source: 'ocr', outline, blocks }
}
