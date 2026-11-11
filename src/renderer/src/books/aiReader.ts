import { asAiError, type AiErrorKind, type AiKind, type AiRawBlock, type AiRawPage, type AiRequest, type AiResponse } from '../../../shared/ai.ts'
import type { AiBatchRecord, AiPageRecord } from '../../../shared/book.ts'
import { usableFen, validatePages } from './aiValidate.ts'
import type { Raster } from './ocrPdf.ts'

export type AiCacheWrite = { kind: 'page'; record: AiPageRecord } | { kind: 'batch'; batch: AiBatchRecord }

export type AiReaderDeps = {
  rasterise: (page: number, dpi: number) => Promise<Raster>
  toJpeg: (raster: Raster, quality: number) => Promise<string>
  read: (request: AiRequest) => Promise<AiResponse>
  cache: (write: AiCacheWrite) => Promise<void>
  /** Optional: crops the model-boxed board out of the page raster and encodes it for a repair read. */
  crop?: (raster: Raster, box: number[], quality: number) => Promise<string>
}

export type AiPassOptions = {
  targets: number[]
  cached?: number[]
  batch?: number
  dpi?: number
  quality?: number
  budget?: number
  onProgress?: (done: number, total: number, page: number) => void
  shouldStop?: () => boolean
}

export type AiPassReport = {
  done: number[]
  failed: { page: number; error: string }[]
  paused: AiErrorKind | null
  pausedError: string | null
  aborted: boolean
  requests: number
  tokens: number
}

const STRUCTURE_DPI = 120
const STRUCTURE_QUALITY = 0.6
const STRUCTURE_BATCH = 10
const DETAIL_DPI = 200
const DETAIL_QUALITY = 0.8
const DETAIL_BATCH = 4
const WORKERS = 2
/** A repair is an extra request, so only the first few failed diagrams in a run are re-read. */
const REPAIR_CAP = 12

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

type RepairState = { used: number; halted: boolean }

function boxOf(block: AiRawBlock): number[] | null {
  if (!Array.isArray(block.box) || block.box.length !== 4) return null
  const box = block.box.map((value) => Number(value))
  return box.every(Number.isFinite) ? box : null
}

/**
 * A diagram whose FEN fails chess.js is silently dropped later, so a failed one is re-read once from a
 * crop of the board the model boxed. The repair is a bonus: its failure never loses an already-read page.
 */
async function repairDiagrams(
  deps: AiReaderDeps,
  record: AiPageRecord,
  raster: Raster | undefined,
  quality: number,
  state: RepairState
): Promise<{ requests: number; tokens: number }> {
  let requests = 0
  let tokens = 0
  if (!deps.crop || !raster) return { requests, tokens }
  for (const block of record.blocks) {
    if (state.halted || state.used >= REPAIR_CAP) break
    if (block.kind !== 'diagram' || usableFen(block.fen)) continue
    const box = boxOf(block)
    if (!box) continue
    state.used += 1
    try {
      const jpeg = await deps.crop(raster, box, quality)
      requests += 1
      const answer = await deps.read({ kind: 'diagram', images: [{ page: record.page, jpeg }] })
      tokens += answer.tokens
      const found = (answer.pages ?? []).find((entry) => entry.page === record.page)?.blocks?.find((entry) => entry.kind === 'diagram')
      const fen = usableFen(found?.fen)
      if (fen) block.fen = fen
    } catch (error) {
      // A quota/offline answer is not this diagram's fault; repairing more pages just burns the budget.
      const aiError = asAiError(error)
      if (aiError && aiError.kind !== 'bad-response') state.halted = true
    }
  }
  return { requests, tokens }
}

/**
 * A batch is addressed by a page range, so pages have to be consecutive. A cached gap therefore starts
 * a new batch instead of pretending the skipped pages were read.
 */
function batches(targets: number[], size: number): number[][] {
  const sorted = [...new Set(targets)].sort((a, b) => a - b)
  const groups: number[][] = []
  for (const page of sorted) {
    const last = groups[groups.length - 1]
    if (last && page === last[last.length - 1] + 1 && last.length < size) last.push(page)
    else groups.push([page])
  }
  return groups
}

async function runPass(kind: AiKind, deps: AiReaderDeps, options: AiPassOptions): Promise<AiPassReport> {
  const size = Math.max(1, Math.min(kind === 'structure' ? STRUCTURE_BATCH : DETAIL_BATCH, options.batch ?? (kind === 'structure' ? STRUCTURE_BATCH : DETAIL_BATCH)))
  const dpi = options.dpi ?? (kind === 'structure' ? STRUCTURE_DPI : DETAIL_DPI)
  const quality = options.quality ?? (kind === 'structure' ? STRUCTURE_QUALITY : DETAIL_QUALITY)
  const cached = new Set(options.cached ?? [])
  const budget = options.budget && options.budget > 0 ? options.budget : Number.POSITIVE_INFINITY
  const targets = options.targets.filter((page) => !cached.has(page))
  const total = new Set(targets).size

  const report: AiPassReport = { done: [], failed: [], paused: null, pausedError: null, aborted: false, requests: 0, tokens: 0 }
  /* Failed pages are paid for too, so the budget caps pages attempted — otherwise a model that answers
     nothing walks the whole book one failing batch at a time. */
  let attempted = 0
  const repairs: RepairState = { used: 0, halted: false }
  const groups = batches(targets, size)
  let next = 0

  // Two workers hide request latency; dequeue is synchronous, so budget and range accounting stay exact.
  // A pause stops new dispatch but lets the in-flight sibling finish and cache its pages.
  const worker = async (): Promise<void> => {
    for (;;) {
      if (report.paused) return
      if (attempted >= budget || options.shouldStop?.()) {
        report.aborted = true
        return
      }
      const group = groups[next]
      if (!group) return
      next += 1
      const pages = group.slice(0, Math.max(0, budget - attempted))
      if (pages.length === 0) {
        report.aborted = true
        return
      }
      attempted += pages.length
      try {
        const images = []
        const rasters = new Map<number, Raster>()
        for (const page of pages) {
          const raster = await deps.rasterise(page, dpi)
          rasters.set(page, raster)
          images.push({ page, jpeg: await deps.toJpeg(raster, quality) })
        }
        report.requests += 1
        const response = await deps.read({ kind, images })
        report.tokens += response.tokens
        const seen = new Set((response.pages ?? []).map((entry: AiRawPage) => entry.page))
        for (const page of pages) if (!seen.has(page)) report.failed.push({ page, error: 'The model answered without this page' })
        if (kind === 'structure') {
          await deps.cache({ kind: 'batch', batch: { firstPage: pages[0], count: pages.length, pages: response.pages } })
        } else {
          for (const record of validatePages(response.pages, pages, response.model, response.ms, response.tokens)) {
            const extra = await repairDiagrams(deps, record, rasters.get(record.page), quality, repairs)
            report.requests += extra.requests
            report.tokens += extra.tokens
            await deps.cache({ kind: 'page', record })
          }
        }
        for (const page of pages.filter((entry) => seen.has(entry))) {
          report.done.push(page)
          options.onProgress?.(report.done.length, total, page)
        }
      } catch (error) {
        const aiError = asAiError(error)
        const pause = aiError && aiError.kind !== 'bad-response' ? aiError : null
        if (pause) {
          if (!report.paused) {
            report.paused = pause.kind
            report.pausedError = pause.message
          }
          for (const page of pages) report.failed.push({ page, error: pause.message })
          return
        }
        for (const page of pages) report.failed.push({ page, error: aiError?.message ?? messageOf(error) })
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, () => worker()))

  return report
}

export const structurePass = (deps: AiReaderDeps, options: AiPassOptions): Promise<AiPassReport> => runPass('structure', deps, options)

export const detailPass = (deps: AiReaderDeps, options: AiPassOptions): Promise<AiPassReport> => runPass('detail', deps, options)
