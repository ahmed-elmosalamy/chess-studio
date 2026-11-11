import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  bookTitleFromFile,
  emptyBookNote,
  type AiBatchRecord,
  type AiPageRecord,
  type BookAnchors,
  type BookMeta,
  type BookNote,
  type BookOcrPage,
  type OcrWord,
  type ParsedBook
} from '../../shared/book.ts'
import type { AiRawBlock, AiRawPage } from '../../shared/ai.ts'
import { quarantine } from '../quarantine.ts'

export type ImportedBook = { meta: BookMeta; duplicate: boolean }

export type BookStore = {
  list: () => Promise<BookMeta[]>
  importFile: (path: string) => Promise<ImportedBook>
  remove: (id: string) => Promise<void>
  rename: (id: string, title: string) => Promise<BookMeta>
  readSource: (id: string) => Promise<Uint8Array>
  readParsed: (id: string) => Promise<ParsedBook | null>
  saveParsed: (id: string, parsed: ParsedBook) => Promise<BookMeta>
  readNote: (id: string) => Promise<BookNote | null>
  saveNote: (id: string, note: BookNote) => Promise<BookNote>
  readAnchors: (id: string) => Promise<BookAnchors>
  saveAnchor: (id: string, blockId: string, fen: string) => Promise<BookAnchors>
  clearAnchor: (id: string, blockId: string) => Promise<BookAnchors>
  readOcrPage: (id: string, page: number) => Promise<BookOcrPage | null>
  saveOcrPage: (id: string, record: BookOcrPage) => Promise<void>
  listOcrPages: (id: string) => Promise<number[]>
  readAiPage: (id: string, page: number) => Promise<AiPageRecord | null>
  saveAiPage: (id: string, record: AiPageRecord) => Promise<void>
  listAiPages: (id: string) => Promise<number[]>
  readAiBatch: (id: string, firstPage: number, count: number) => Promise<AiBatchRecord | null>
  saveAiBatch: (id: string, batch: AiBatchRecord) => Promise<void>
  listAiBatches: (id: string) => Promise<{ firstPage: number; count: number }[]>
}

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BLOCK_ID_PATTERN = /^b\d{1,7}$/
const FEN_PATTERN = /(?:[rnbqkpRNBQKP1-8]+\/){7}[rnbqkpRNBQKP1-8]+\s+[wb]\s+[KQkq-]+\s+[a-h1-8-]+(?:\s+\d+\s+\d+)?/
const INDEX_FILE = 'index.json'
export const MAX_BOOK_BYTES = 200 * 1024 * 1024
const MAX_OCR_WORDS = 20000

function assertId(id: string): void {
  if (!ID_PATTERN.test(id)) throw new Error(`Invalid book id: ${id}`)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isParsedBook(value: unknown): value is ParsedBook {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ParsedBook>
  return (candidate.schemaVersion === 1 || candidate.schemaVersion === 2 || candidate.schemaVersion === 3) && Array.isArray(candidate.outline) && Array.isArray(candidate.blocks) && typeof candidate.pageCount === 'number'
}

function normaliseAnchors(value: unknown): BookAnchors {
  if (!value || typeof value !== 'object') return {}
  const anchors: BookAnchors = {}
  for (const [blockId, fen] of Object.entries(value as Record<string, unknown>).slice(0, 5000)) {
    if (!BLOCK_ID_PATTERN.test(blockId) || typeof fen !== 'string') continue
    const clean = fen.trim()
    if (!FEN_PATTERN.test(clean)) continue
    anchors[blockId] = clean
  }
  return anchors
}

function normaliseOcrPage(value: unknown, page: number): BookOcrPage | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<BookOcrPage>
  if (candidate.page !== page) return null
  if (![candidate.width, candidate.height, candidate.dpi].every((value) => Number.isFinite(value))) return null
  if (!Array.isArray(candidate.words) || candidate.words.length > MAX_OCR_WORDS) return null
  const words: OcrWord[] = []
  for (const word of candidate.words) {
    const box = word?.bbox
    if (typeof word?.text !== 'string' || !box) continue
    if (![box.x0, box.y0, box.x1, box.y1].every((value) => Number.isFinite(value))) continue
    words.push({ text: word.text.slice(0, 64), bbox: { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 } })
  }
  return {
    page,
    width: Math.round(candidate.width as number),
    height: Math.round(candidate.height as number),
    dpi: Math.round(candidate.dpi as number),
    words,
    confidence: Number.isFinite(candidate.confidence) ? (candidate.confidence as number) : 0,
    ms: Number.isFinite(candidate.ms) ? Math.round(candidate.ms as number) : 0
  }
}

function assertPage(page: number): void {
  if (!Number.isInteger(page) || page < 1 || page > 100000) throw new Error(`Invalid book page: ${page}`)
}

function assertCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error('Invalid AI batch range')
}

const MAX_AI_BLOCKS = 400
const MAX_AI_TEXT = 4000
const MAX_AI_MOVES = 400

function normaliseAiBlock(value: unknown): AiRawBlock | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Partial<AiRawBlock>
  if (!['heading', 'prose', 'moves', 'diagram'].includes(String(input.kind))) return null
  const block: AiRawBlock = { kind: String(input.kind) as AiRawBlock['kind'] }
  if (typeof input.text === 'string') block.text = input.text.slice(0, MAX_AI_TEXT)
  if (Number.isFinite(input.level)) block.level = Math.min(3, Math.max(1, Math.round(input.level as number)))
  if (typeof input.fen === 'string' && FEN_PATTERN.test(input.fen.trim())) block.fen = input.fen.trim()
  if (typeof input.caption === 'string') block.caption = input.caption.slice(0, 120)
  if (Array.isArray(input.moves)) block.moves = input.moves.filter((move) => typeof move === 'string').map((move) => move.slice(0, 24)).slice(0, MAX_AI_MOVES)
  return block
}

function normaliseAiPage(value: unknown, page: number): AiPageRecord | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Partial<AiPageRecord>
  if (input.page !== page) return null
  if (!Array.isArray(input.blocks) || input.blocks.length > MAX_AI_BLOCKS) return null
  return {
    page,
    model: typeof input.model === 'string' ? input.model.slice(0, 120) : '',
    ms: Number.isFinite(input.ms) ? Math.max(0, Math.round(input.ms as number)) : 0,
    tokens: Number.isFinite(input.tokens) ? Math.max(0, Math.round(input.tokens as number)) : 0,
    blocks: input.blocks.map(normaliseAiBlock).filter((block): block is AiRawBlock => block !== null)
  }
}

function normaliseAiBatch(value: unknown, firstPage: number, count: number): AiBatchRecord | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Partial<AiBatchRecord>
  if (input.firstPage !== firstPage || input.count !== count) return null
  if (!Array.isArray(input.pages) || input.pages.length > count) return null
  const pages: AiRawPage[] = []
  for (const entry of input.pages) {
    const page = (entry as AiRawPage)?.page
    if (!Number.isInteger(page) || page < firstPage || page >= firstPage + count) continue
    const source = entry as AiRawPage
    const cleaned: AiRawPage = {
      page,
      chapters: Array.isArray(source.chapters) ? source.chapters.slice(0, 20) : [],
      examples: Array.isArray(source.examples) ? source.examples.slice(0, 40) : []
    }
    if (Array.isArray(source.blocks)) {
      const blocks = source.blocks.map(normaliseAiBlock).filter((block): block is AiRawBlock => block !== null)
      if (blocks.length > 0) cleaned.blocks = blocks
    }
    pages.push(cleaned)
  }
  return { firstPage, count, pages }
}

async function listNumberedJson(folder: string): Promise<number[]> {
  let names: string[]
  try {
    names = await readdir(folder)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  return names
    .map((name) => /^(\d+)\.json$/.exec(name)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number)
    .sort((a, b) => a - b)
}

function normaliseNote(value: unknown): BookNote {
  if (!value || typeof value !== 'object') return { ...emptyBookNote }
  const candidate = value as Partial<BookNote>
  const overrides = candidate.fenOverrides && typeof candidate.fenOverrides === 'object' ? candidate.fenOverrides : {}
  const fenOverrides: Record<string, string> = {}
  for (const [key, fen] of Object.entries(overrides).slice(0, 500)) {
    if (typeof fen === 'string') fenOverrides[key] = fen
  }
  return {
    lastBlockId: typeof candidate.lastBlockId === 'string' ? candidate.lastBlockId : null,
    lastPage: typeof candidate.lastPage === 'number' && Number.isFinite(candidate.lastPage) ? Math.max(1, Math.round(candidate.lastPage)) : 1,
    scrollTop: typeof candidate.scrollTop === 'number' && Number.isFinite(candidate.scrollTop) ? Math.max(0, candidate.scrollTop) : 0,
    fenOverrides
  }
}

function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export function createBookStore(dir: string, maxBytes = MAX_BOOK_BYTES): BookStore {
  const indexPath = join(dir, INDEX_FILE)

  const readIndex = async (): Promise<BookMeta[]> => {
    let raw: string
    try {
      raw = await readFile(indexPath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw new Error(`Book index could not be read: ${messageOf(error)}`)
    }
    try {
      const parsed = JSON.parse(raw) as { books?: BookMeta[] }
      if (!Array.isArray(parsed.books)) throw new Error('books is not an array')
      return parsed.books
    } catch (error) {
      await quarantine(indexPath, error)
      return []
    }
  }

  const writeIndex = async (books: BookMeta[]): Promise<void> => {
    await mkdir(dir, { recursive: true })
    const tempPath = `${indexPath}.tmp`
    await writeFile(tempPath, `${JSON.stringify({ version: 1, books }, null, 2)}\n`, 'utf8')
    await rename(tempPath, indexPath)
  }

  const bookFile = (id: string, name: string): string => join(dir, id, name)
  const ocrFile = (id: string, page: number): string => join(dir, id, 'ocr', `${page}.json`)
  const aiPageFile = (id: string, page: number): string => join(dir, id, 'ai', 'pages', `${page}.json`)
  const aiBatchFile = (id: string, firstPage: number, count: number): string => join(dir, id, 'ai', 'structure', `${firstPage}-${count}.json`)

  const requireBook = async (id: string): Promise<BookMeta[]> => {
    assertId(id)
    const books = await readIndex()
    if (!books.some((book) => book.id === id)) throw new Error('Book not found')
    return books
  }

  const readJson = async (path: string): Promise<unknown> => {
    let raw: string
    try {
      raw = await readFile(path, 'utf8')
    } catch {
      return null
    }
    try {
      return JSON.parse(raw) as unknown
    } catch (error) {
      await quarantine(path, error)
      return null
    }
  }

  const writeJson = async (path: string, value: unknown): Promise<void> => {
    const tempPath = `${path}.tmp`
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await rename(tempPath, path)
  }

  return {
    list: () => readIndex(),

    importFile: async (path) => {
      if (!/\.pdf$/i.test(path)) throw new Error('Only PDF files can be imported')
      const info = await stat(path)
      if (!info.isFile()) throw new Error('Selected path is not a file')
      if (info.size > maxBytes) throw new Error(`PDF is larger than ${Math.round(maxBytes / (1024 * 1024))} MB`)

      const sha256 = await hashFile(path)
      const books = await readIndex()
      const existing = books.find((book) => book.sha256 === sha256)
      if (existing) return { meta: existing, duplicate: true }

      const meta: BookMeta = {
        id: randomUUID(),
        title: bookTitleFromFile(basename(path)),
        fileName: basename(path),
        pageCount: null,
        sha256,
        sizeBytes: info.size,
        importedAt: Date.now(),
        source: null,
        parsedAt: null,
        lastPage: 1,
        confidence: null
      }

      const bookDir = join(dir, meta.id)
      await mkdir(bookDir, { recursive: true })
      try {
        await copyFile(path, join(bookDir, 'source.pdf'))
        await writeIndex([meta, ...books])
      } catch (error) {
        await rm(bookDir, { recursive: true, force: true })
        throw new Error(`Book could not be imported: ${messageOf(error)}`)
      }
      return { meta, duplicate: false }
    },

    remove: async (id) => {
      assertId(id)
      const books = await readIndex()
      if (!books.some((book) => book.id === id)) throw new Error('Book not found')
      await rm(join(dir, id), { recursive: true, force: true })
      await writeIndex(books.filter((book) => book.id !== id))
    },

    rename: async (id, title) => {
      assertId(id)
      const clean = title.trim().slice(0, 120)
      if (!clean) throw new Error('Book title cannot be empty')
      const books = await readIndex()
      const book = books.find((candidate) => candidate.id === id)
      if (!book) throw new Error('Book not found')
      const updated: BookMeta = { ...book, title: clean }
      await writeIndex(books.map((candidate) => (candidate.id === id ? updated : candidate)))
      return updated
    },

    readSource: async (id) => {
      await requireBook(id)
      return readFile(bookFile(id, 'source.pdf'))
    },

    readParsed: async (id) => {
      await requireBook(id)
      const parsed = await readJson(bookFile(id, 'parsed.json'))
      return isParsedBook(parsed) ? parsed : null
    },

    saveParsed: async (id, parsed) => {
      const books = await requireBook(id)
      if (!isParsedBook(parsed)) throw new Error('Invalid book data')
      await writeJson(bookFile(id, 'parsed.json'), parsed)
      let high = 0
      let low = 0
      for (const block of parsed.blocks) {
        for (const token of block.moves ?? []) {
          if (token.flagged) low += 1
          else high += 1
        }
      }
      const book = books.find((candidate) => candidate.id === id) as BookMeta
      const updated: BookMeta = {
        ...book,
        parsedAt: Date.now(),
        pageCount: parsed.pageCount,
        source: parsed.source,
        confidence: high + low > 0 ? { high, low } : null
      }
      await writeIndex(books.map((candidate) => (candidate.id === id ? updated : candidate)))
      return updated
    },

    readNote: async (id) => {
      await requireBook(id)
      const note = await readJson(bookFile(id, 'notes.json'))
      return note === null ? null : normaliseNote(note)
    },

    saveNote: async (id, note) => {
      const books = await requireBook(id)
      const clean = normaliseNote(note)
      await writeJson(bookFile(id, 'notes.json'), clean)
      const book = books.find((candidate) => candidate.id === id) as BookMeta
      if (book.lastPage !== clean.lastPage) {
        await writeIndex(books.map((candidate) => (candidate.id === id ? { ...candidate, lastPage: clean.lastPage } : candidate)))
      }
      return clean
    },

    readAnchors: async (id) => {
      await requireBook(id)
      return normaliseAnchors(await readJson(bookFile(id, 'anchors.json')))
    },

    saveAnchor: async (id, blockId, fen) => {
      await requireBook(id)
      if (!BLOCK_ID_PATTERN.test(blockId)) throw new Error(`Invalid block id: ${blockId}`)
      const clean = fen.trim()
      if (!FEN_PATTERN.test(clean)) throw new Error('Not a position')
      const anchors = await normaliseAnchors(await readJson(bookFile(id, 'anchors.json')))
      anchors[blockId] = clean
      await writeJson(bookFile(id, 'anchors.json'), anchors)
      return anchors
    },

    clearAnchor: async (id, blockId) => {
      await requireBook(id)
      if (!BLOCK_ID_PATTERN.test(blockId)) throw new Error(`Invalid block id: ${blockId}`)
      const anchors = await normaliseAnchors(await readJson(bookFile(id, 'anchors.json')))
      delete anchors[blockId]
      await writeJson(bookFile(id, 'anchors.json'), anchors)
      return anchors
    },

    readOcrPage: async (id, page) => {
      await requireBook(id)
      assertPage(page)
      return normaliseOcrPage(await readJson(ocrFile(id, page)), page)
    },

    saveOcrPage: async (id, record) => {
      await requireBook(id)
      assertPage(record.page)
      const clean = normaliseOcrPage(record, record.page)
      if (!clean) throw new Error('Invalid OCR page')
      await mkdir(join(dir, id, 'ocr'), { recursive: true })
      await writeJson(ocrFile(id, record.page), clean)
    },

    listOcrPages: async (id) => {
      await requireBook(id)
      return listNumberedJson(join(dir, id, 'ocr'))
    },

    readAiPage: async (id, page) => {
      await requireBook(id)
      assertPage(page)
      return normaliseAiPage(await readJson(aiPageFile(id, page)), page)
    },

    saveAiPage: async (id, record) => {
      await requireBook(id)
      assertPage(record.page)
      const clean = normaliseAiPage(record, record.page)
      if (!clean) throw new Error('Invalid AI page')
      await mkdir(join(dir, id, 'ai', 'pages'), { recursive: true })
      await writeJson(aiPageFile(id, record.page), clean)
    },

    listAiPages: async (id) => {
      await requireBook(id)
      return listNumberedJson(join(dir, id, 'ai', 'pages'))
    },

    readAiBatch: async (id, firstPage, count) => {
      await requireBook(id)
      assertPage(firstPage)
      assertCount(count)
      return normaliseAiBatch(await readJson(aiBatchFile(id, firstPage, count)), firstPage, count)
    },

    saveAiBatch: async (id, batch) => {
      await requireBook(id)
      assertPage(batch.firstPage)
      assertCount(batch.count)
      const clean = normaliseAiBatch(batch, batch.firstPage, batch.count)
      if (!clean) throw new Error('Invalid AI batch')
      await mkdir(join(dir, id, 'ai', 'structure'), { recursive: true })
      await writeJson(aiBatchFile(id, batch.firstPage, batch.count), clean)
    },

    listAiBatches: async (id) => {
      await requireBook(id)
      let names: string[]
      try {
        names = await readdir(join(dir, id, 'ai', 'structure'))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw error
      }
      return names
        .map((name) => /^(\d+)-(\d+)\.json$/.exec(name))
        .filter((match): match is RegExpExecArray => match !== null)
        .map((match) => ({ firstPage: Number(match[1]), count: Number(match[2]) }))
        .sort((a, b) => a.firstPage - b.firstPage)
    }
  }
}
