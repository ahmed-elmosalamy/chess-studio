import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyBookNote, type AiBatchRecord, type AiPageRecord, type BookAnchors, type BookMeta, type BookNote, type BookOcrPage, type ParsedBook } from '@shared/book'
import type { AiErrorKind, AiState } from '@shared/ai'
import type { AiCacheWrite, AiReaderDeps } from '../books/aiReader.ts'

function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
}

const NO_TEXT_ERROR = 'No readable text found'

/** A printed diagram is small, so the board crop is redrawn twice as wide before the repair read. */
const DIAGRAM_CROP_SCALE = 2

/** A book the AI has already started stays on the AI engine; a fresh one needs a key and a model. */
export function chooseEngine(ai: AiState | null, aiPages: number[]): 'ai' | 'ocr' {
  if (aiPages.length > 0) return 'ai'
  return ai?.hasKey && ai.settings.model.trim() ? 'ai' : 'ocr'
}

export type ReadPass = 'structure' | 'detail'

/** The pages a chapter covers: from its first page up to the page before the next chapter starts. */
export function chapterPageRange(parsed: ParsedBook | null, chapterId: string): number[] {
  const chapters = parsed?.outline ?? []
  const index = chapters.findIndex((chapter) => chapter.id === chapterId)
  if (!parsed || index < 0) return []
  const first = chapters[index].page
  const next = index + 1 < chapters.length ? chapters[index + 1].page - 1 : parsed.pageCount
  return Array.from({ length: Math.max(0, Math.max(next, first) - first + 1) }, (_, offset) => first + offset)
}

export type OpenBook = {
  meta: BookMeta
  parsed: ParsedBook | null
  note: BookNote
  anchors: BookAnchors
  ocrPages: number[]
  aiPages: number[]
  analysing: boolean
  stage: 'text' | 'ocr' | 'ai' | null
  pass: ReadPass | null
  progress: { page: number; total: number } | null
}

export default function useBooks() {
  const [books, setBooks] = useState<BookMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [openBook, setOpenBook] = useState<OpenBook | null>(null)
  const [opening, setOpening] = useState(false)
  const [readerError, setReaderError] = useState<string | null>(null)
  const [aiPaused, setAiPaused] = useState<AiErrorKind | null>(null)
  const noteTimer = useRef<number | null>(null)
  const stopPass = useRef(false)
  const runToken = useRef(0)
  const openBookRef = useRef<OpenBook | null>(null)
  openBookRef.current = openBook

  const refresh = useCallback(async () => {
    try {
      setBooks(await window.studio.books.list())
      setError(null)
    } catch (caught) {
      setError(cleanError(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const clearNoteTimer = useCallback(() => {
    if (noteTimer.current !== null) {
      window.clearTimeout(noteTimer.current)
      noteTimer.current = null
    }
  }, [])

  useEffect(() => clearNoteTimer, [clearNoteTimer])

  const updateBook = useCallback((id: string, updater: (book: OpenBook) => OpenBook) => {
    setOpenBook((previous) => (previous && previous.meta.id === id ? updater(previous) : previous))
  }, [])

  const setProgress = useCallback(
    (id: string, stage: 'text' | 'ocr' | 'ai', page: number, total: number, pass?: ReadPass) => {
      updateBook(id, (book) => ({ ...book, analysing: true, stage, pass: stage === 'ai' ? pass ?? null : null, progress: { page, total } }))
    },
    [updateBook]
  )

  const analyseWithOcr = useCallback(
    async (id: string, cachedPages: number[], pageCount: number) => {
      stopPass.current = false
      const [{ loadDocument }, { createRasteriser }, { createOcrEngine }, { bookFromOcrPages, ocrPages }] = await Promise.all([
        import('../books/pdfDocument.ts'),
        import('../books/rasterPdf.ts'),
        import('../books/ocrEngine.ts'),
        import('../books/ocrPdf.ts')
      ])

      // pdf.js detaches the buffer it is given, so the text pass cannot leave bytes behind for this one.
      const source = await window.studio.books.readSource(id)
      const doc = await loadDocument(source)
      const total = doc.numPages
      const done = new Set(cachedPages)
      const missing = Array.from({ length: total }, (_, index) => index + 1).filter((page) => !done.has(page))
      setProgress(id, 'ocr', 0, missing.length)

      const engine = await createOcrEngine()
      let report
      try {
        report = await ocrPages(
          total,
          { rasterise: createRasteriser(doc), engine },
          {
            pages: missing,
            shouldStop: () => stopPass.current,
            onRecord: async (record: BookOcrPage) => {
              await window.studio.books.saveOcrPage(id, record)
              updateBook(id, (book) => ({ ...book, ocrPages: [...book.ocrPages, record.page] }))
            },
            onProgress: (read: number) => setProgress(id, 'ocr', read, missing.length)
          }
        )
      } finally {
        await engine.dispose()
        await doc.destroy()
      }

      const pages = await Promise.all(Array.from({ length: total }, (_, index) => index + 1).map((page) => window.studio.books.readOcrPage(id, page)))
      const records = pages.filter((record): record is BookOcrPage => record !== null)
      const parsed = bookFromOcrPages(records, pageCount || total)
      const meta = await window.studio.books.saveParse(id, parsed)
      updateBook(id, (book) => ({ ...book, meta, parsed, analysing: false, stage: null, pass: null, progress: null }))

      const unreadable = report.failed
      if (report.aborted && unreadable > 0) setReaderError(`Stopped after ${unreadable} unreadable page${unreadable === 1 ? '' : 's'}. Set a starting position on an example to follow it.`)
      else if (unreadable > 0) setNotice(`Read ${records.length} of ${total} pages, ${unreadable} page${unreadable === 1 ? '' : 's'} unreadable`)
      else setNotice(`Read ${parsed.blocks.length} blocks from the scan`)
      await refresh()
    },
    [refresh, setProgress, updateBook]
  )

  const createAiSession = useCallback(
    async (id: string) => {
      const [{ loadDocument }, { createRasteriser, cropRect, cropRaster }, { toJpeg }, { structurePass, detailPass }] = await Promise.all([
        import('../books/pdfDocument.ts'),
        import('../books/rasterPdf.ts'),
        import('../books/jpeg.ts'),
        import('../books/aiReader.ts')
      ])

      // The buffer is detached by pdf.js, so the AI pass has to read the file again instead of reusing the text pass bytes.
      const source = await window.studio.books.readSource(id)
      const doc = await loadDocument(source)

      const deps: AiReaderDeps = {
        rasterise: createRasteriser(doc),
        toJpeg,
        crop: async (raster, box, quality) => {
          const rect = cropRect(raster.width, raster.height, box)
          if (!rect) throw new Error('No usable diagram box')
          return toJpeg(cropRaster(raster, rect, DIAGRAM_CROP_SCALE), quality)
        },
        read: (request) => window.studio.ai.readPages(request),
        cache: async (write: AiCacheWrite) => {
          if (write.kind === 'page') {
            await window.studio.books.saveAiPage(id, write.record)
            updateBook(id, (book) => ({ ...book, aiPages: [...new Set([...book.aiPages, write.record.page])].sort((a, b) => a - b) }))
          } else {
            await window.studio.books.saveAiBatch(id, write.batch)
          }
        }
      }
      return { doc, deps, structurePass, detailPass }
    },
    [updateBook]
  )

  /** Rebuilds the book from what is already cached, so an interrupted or budget-limited run still shows its pages. */
  const rebuildFromCache = useCallback(
    async (id: string, pageCount: number) => {
      const { assembleBook, chapterHints } = await import('../books/aiValidate.ts')
      const aiPages = await window.studio.books.listAiPages(id)
      const read = new Set(aiPages)
      const pages = Array.from({ length: pageCount }, (_, index) => index + 1)
      const [aiRecords, batchRanges, ocrRecords] = await Promise.all([
        Promise.all(pages.filter((page) => read.has(page)).map((page) => window.studio.books.readAiPage(id, page))),
        window.studio.books.listAiBatches(id),
        Promise.all(pages.filter((page) => !read.has(page)).map((page) => window.studio.books.readOcrPage(id, page)))
      ])
      const batches = await Promise.all(batchRanges.map((range) => window.studio.books.readAiBatch(id, range.firstPage, range.count)))
      const parsed = assembleBook({
        pageCount,
        aiPages: aiRecords.filter((record): record is AiPageRecord => record !== null),
        ocrPages: ocrRecords.filter((record): record is BookOcrPage => record !== null),
        chapters: chapterHints(batches.filter((batch): batch is AiBatchRecord => batch !== null))
      })
      const meta = await window.studio.books.saveParse(id, parsed)
      updateBook(id, (book) => ({ ...book, meta, parsed, aiPages, analysing: false, stage: null, pass: null, progress: null }))
      return parsed
    },
    [updateBook]
  )

  const readWithAi = useCallback(
    async (id: string, pages?: number[], ignoreCache = false) => {
      const token = runToken.current + 1
      runToken.current = token
      stopPass.current = false
      setReaderError(null)
      const current = openBookRef.current
      const session = await createAiSession(id)
      try {
        const total = current?.meta.pageCount || session.doc.numPages
        const targets = pages ?? Array.from({ length: total }, (_, index) => index + 1)
        const budget = (await window.studio.ai.state()).settings.pagesPerRun
        let paused: AiErrorKind | null = null
        let pausedError: string | null = null
        let failed = 0
        const reasons: string[] = []

        if (!pages) {
          const cached = (await window.studio.books.listAiBatches(id)).flatMap((range) => Array.from({ length: range.count }, (_, index) => range.firstPage + index))
          setProgress(id, 'ai', 0, targets.length, 'structure')
          const structure = await session.structurePass(session.deps, {
            targets,
            cached,
            budget,
            shouldStop: () => stopPass.current,
            onProgress: (done, target) => setProgress(id, 'ai', done, target, 'structure')
          })
          paused = structure.paused
          pausedError = structure.pausedError
          failed += structure.failed.length
          reasons.push(...structure.failed.map((entry) => entry.error))
        }

        if (!paused) {
          setProgress(id, 'ai', 0, targets.length, 'detail')
          const detail = await session.detailPass(session.deps, {
            targets,
            cached: ignoreCache ? [] : await window.studio.books.listAiPages(id),
            budget,
            shouldStop: () => stopPass.current,
            onProgress: (done, target) => setProgress(id, 'ai', done, target, 'detail')
          })
          paused = detail.paused
          pausedError = detail.pausedError
          failed += detail.failed.length
          reasons.push(...detail.failed.map((entry) => entry.error))
        }

        setAiPaused(paused)
        const parsed = await rebuildFromCache(id, total)
        const blocks = parsed.blocks.filter((block) => block.origin === 'ai').length
        if (paused) setReaderError(`AI reading paused: ${cleanError(pausedError ?? paused)}. Pages already read are kept — fix the cause and run it again.`)
        else if (failed > 0 && blocks === 0) setReaderError(`The AI read none of these pages: ${cleanError(reasons[0] ?? 'no usable answer')}. Try another free vision model in Settings.`)
        else if (failed > 0) setNotice(`AI read ${blocks} blocks, ${failed} page${failed === 1 ? '' : 's'} failed: ${cleanError(reasons[0] ?? 'no usable answer')}`)
        else setNotice(`AI read ${blocks} blocks`)
        await refresh()
      } finally {
        await session.doc.destroy()
        if (runToken.current === token) {
          updateBook(id, (book) => ({ ...book, analysing: false, stage: null, pass: null, progress: null }))
        }
      }
    },
    [createAiSession, rebuildFromCache, refresh, setProgress, updateBook]
  )

  const readPagesWithAi = useCallback(
    async (id: string, pages: number[], ignoreCache: boolean) => {
      try {
        await readWithAi(id, pages, ignoreCache)
      } catch (caught) {
        setReaderError(cleanError(caught))
      }
    },
    [readWithAi]
  )

  const readChapterWithAi = useCallback(
    async (id: string, chapterId: string) => {
      const pages = chapterPageRange(openBookRef.current?.parsed ?? null, chapterId)
      if (pages.length > 0) await readPagesWithAi(id, pages, false)
    },
    [readPagesWithAi]
  )

  const rereadPageWithAi = useCallback(
    async (id: string, page: number) => {
      await readPagesWithAi(id, [page], true)
    },
    [readPagesWithAi]
  )

  const analyseBook = useCallback(
    async (id: string) => {
      setProgress(id, 'text', 0, 0)
      setReaderError(null)
      try {
        const source = await window.studio.books.readSource(id)
        const current = openBookRef.current
        try {
          const { parsePdf } = await import('../books/parsePdf.ts')
          const parsed = await parsePdf(source, (page, total) => setProgress(id, 'text', page, total))
          const meta = await window.studio.books.saveParse(id, parsed)
          updateBook(id, (book) => ({ ...book, meta, parsed, analysing: false, stage: null, pass: null, progress: null }))
          setNotice(`Analysed ${parsed.blocks.length} text blocks`)
        } catch (caught) {
          if (!cleanError(caught).startsWith(NO_TEXT_ERROR)) throw caught
          const ai = await window.studio.ai.state().catch(() => null)
          if (chooseEngine(ai, current?.aiPages ?? []) === 'ai') {
            try {
              await readWithAi(id)
              return
            } catch (unreadable) {
              setNotice(`AI reader unavailable (${cleanError(unreadable)}). Reading this book with OCR instead.`)
            }
          }
          await analyseWithOcr(id, current?.ocrPages ?? [], current?.meta.pageCount ?? 0)
        }
      } catch (caught) {
        updateBook(id, (book) => ({ ...book, analysing: false, stage: null, pass: null, progress: null }))
        setReaderError(cleanError(caught))
      }
    },
    [analyseWithOcr, readWithAi, setProgress, updateBook]
  )

  const stopReading = useCallback(() => {
    stopPass.current = true
  }, [])

  const setAnchor = useCallback(
    async (blockId: string, fen: string) => {
      const id = openBook?.meta.id
      if (!id) return
      try {
        const anchors = await window.studio.books.saveAnchor(id, blockId, fen)
        updateBook(id, (book) => ({ ...book, anchors }))
      } catch (caught) {
        setReaderError(cleanError(caught))
      }
    },
    [openBook, updateBook]
  )

  const clearAnchor = useCallback(
    async (blockId: string) => {
      const id = openBook?.meta.id
      if (!id) return
      try {
        const anchors = await window.studio.books.clearAnchor(id, blockId)
        updateBook(id, (book) => ({ ...book, anchors }))
      } catch (caught) {
        setReaderError(cleanError(caught))
      }
    },
    [openBook, updateBook]
  )

  const openReader = useCallback(
    async (id: string) => {
      setOpening(true)
      setReaderError(null)
      try {
        const result = await window.studio.books.read(id)
        setOpenBook({
          meta: result.meta,
          parsed: result.parsed,
          note: result.note ?? { ...emptyBookNote },
          anchors: result.anchors,
          ocrPages: result.ocrPages,
          aiPages: result.aiPages,
          analysing: false,
          stage: null,
          pass: null,
          progress: null
        })
        setAiPaused(null)
        if (!result.parsed) await analyseBook(id)
      } catch (caught) {
        setReaderError(cleanError(caught))
      } finally {
        setOpening(false)
      }
    },
    [analyseBook]
  )

  const closeReader = useCallback(() => {
    clearNoteTimer()
    stopPass.current = true
    setOpenBook(null)
    setReaderError(null)
    setAiPaused(null)
  }, [clearNoteTimer])

  const updateNote = useCallback(
    (note: BookNote) => {
      setOpenBook((previous) => (previous ? { ...previous, note } : previous))
      clearNoteTimer()
      noteTimer.current = window.setTimeout(() => {
        const id = openBook?.meta.id
        if (!id) return
        window.studio.books.saveNote(id, note).catch((caught) => setReaderError(cleanError(caught)))
      }, 600)
    },
    [clearNoteTimer, openBook]
  )

  const importBooks = useCallback(async () => {
    setBusy(true)
    setError(null)
    setWarnings([])
    setNotice(null)
    try {
      const report = await window.studio.books.import()
      if (report.cancelled) return
      const added = report.entries.filter((entry) => entry.book && !entry.duplicate)
      const duplicates = report.entries.filter((entry) => entry.duplicate && entry.book)
      const failures = report.entries.filter((entry) => entry.error)
      if (added.length > 0) setNotice(`Uploaded ${added.length} book${added.length === 1 ? '' : 's'}`)
      else if (duplicates.length > 0 && failures.length === 0) setNotice('Book already in your library')
      setWarnings([
        ...duplicates.map((entry) => `${entry.name}: already in your library`),
        ...failures.map((entry) => `${entry.name}: ${entry.error}`)
      ])
      await refresh()
    } catch (caught) {
      setError(cleanError(caught))
    } finally {
      setBusy(false)
    }
  }, [refresh])

  const removeBook = useCallback(
    async (id: string) => {
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        await window.studio.books.remove(id)
        if (openBook?.meta.id === id) closeReader()
        setNotice('Book deleted')
        await refresh()
      } catch (caught) {
        setError(cleanError(caught))
      } finally {
        setBusy(false)
      }
    },
    [closeReader, openBook, refresh]
  )

  const renameBook = useCallback(
    async (id: string, title: string) => {
      setError(null)
      try {
        const meta = await window.studio.books.rename(id, title)
        setOpenBook((previous) => (previous && previous.meta.id === id ? { ...previous, meta } : previous))
        await refresh()
      } catch (caught) {
        setError(cleanError(caught))
      }
    },
    [refresh]
  )

  return {
    books,
    total: books.length,
    loading,
    busy,
    error,
    warnings,
    notice,
    refresh,
    importBooks,
    removeBook,
    renameBook,
    openBook,
    opening,
    readerError,
    openReader,
    closeReader,
    analyseBook,
    stopReading,
    readChapterWithAi,
    rereadPageWithAi,
    aiPaused,
    setAnchor,
    clearAnchor,
    updateNote
  }
}

export type Books = ReturnType<typeof useBooks>
