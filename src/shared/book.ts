import type { AiRawBlock, AiRawPage } from './ai'

export const BookChannel = {
  List: 'book:list',
  Import: 'book:import',
  Remove: 'book:remove',
  Rename: 'book:rename',
  Read: 'book:read',
  ReadSource: 'book:read-source',
  SaveParse: 'book:save-parse',
  ReadNote: 'book:read-note',
  SaveNote: 'book:save-note',
  SaveAnchor: 'book:save-anchor',
  ClearAnchor: 'book:clear-anchor',
  ReadOcrPage: 'book:read-ocr-page',
  SaveOcrPage: 'book:save-ocr-page',
  ListAiPages: 'book:list-ai-pages',
  ReadAiPage: 'book:read-ai-page',
  SaveAiPage: 'book:save-ai-page',
  ReadAiBatch: 'book:read-ai-batch',
  SaveAiBatch: 'book:save-ai-batch',
  ListAiBatches: 'book:list-ai-batches'
} as const

export type BookSource = 'text' | 'ocr' | 'ai'

export type BookMeta = {
  id: string
  title: string
  fileName: string
  pageCount: number | null
  sha256: string
  sizeBytes: number
  importedAt: number
  source: BookSource | null
  parsedAt: number | null
  lastPage: number
  confidence: { high: number; low: number } | null
}

export type BookImportEntry = { name: string; book?: BookMeta; duplicate?: boolean; error?: string }

export type BookImportReport = { cancelled: boolean; entries: BookImportEntry[] }

export type BookColor = 'w' | 'b'

export type SanToken = {
  san: string
  moveNumber: number | null
  color: BookColor | null
  variationDepth: number
  fenAfter: string
  flagged?: boolean
  repaired?: boolean
}

export type BookBlockKind = 'heading' | 'paragraph' | 'moves'

export type BookBlock = {
  id: string
  page: number
  order: number
  chapterId: string | null
  kind: BookBlockKind
  level?: number
  text: string
  moves?: SanToken[]
  origin?: 'ai' | 'ocr'
  fen?: string
  positionState?: 'verified' | 'replay-failed' | 'no-position'
}

export type Chapter = {
  id: string
  title: string
  level: number
  page: number
  startBlockId: string
}

export type ParsedBook = {
  schemaVersion: 1 | 2 | 3
  pageCount: number
  source: BookSource
  outline: Chapter[]
  blocks: BookBlock[]
}

/** One transcribed page, cached so an interrupted pass can resume without paying for the model again. */
export type AiPageRecord = {
  page: number
  model: string
  ms: number
  tokens: number
  blocks: AiRawBlock[]
}

/** One structure-pass answer over a range of pages, cached by that range. */
export type AiBatchRecord = {
  firstPage: number
  count: number
  pages: AiRawPage[]
}

export type OcrWordBox = { x0: number; y0: number; x1: number; y1: number }

export type OcrWord = { text: string; bbox: OcrWordBox }

/** One recognised page, cached so an interrupted pass can resume without re-reading the raster. */
export type BookOcrPage = {
  page: number
  width: number
  height: number
  dpi: number
  words: OcrWord[]
  confidence: number
  ms: number
}

/** blockId -> starting position the reader set by hand for that example */
export type BookAnchors = Record<string, string>

export type BookNote = {
  lastBlockId: string | null
  lastPage: number
  scrollTop: number
  fenOverrides: Record<string, string>
}

export type BookReadResult = {
  meta: BookMeta
  parsed: ParsedBook | null
  note: BookNote | null
  anchors: BookAnchors
  ocrPages: number[]
  aiPages: number[]
}

export const emptyBookNote: BookNote = { lastBlockId: null, lastPage: 1, scrollTop: 0, fenOverrides: {} }

export function bookTitleFromFile(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled book'
}
