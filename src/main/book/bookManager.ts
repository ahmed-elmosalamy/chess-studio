import { app, dialog, ipcMain } from 'electron'
import { join, basename } from 'node:path'
import { BookChannel, type AiBatchRecord, type AiPageRecord, type BookImportEntry, type BookImportReport, type BookNote, type BookOcrPage, type BookReadResult, type ParsedBook } from '@shared/book'
import { createBookStore } from './bookStore'

export default class BookManager {
  private readonly store = createBookStore(join(app.getPath('userData'), 'books'))

  register(): void {
    ipcMain.handle(BookChannel.List, () => this.store.list())
    ipcMain.handle(BookChannel.Remove, (_event, id: string) => this.store.remove(id))
    ipcMain.handle(BookChannel.Rename, (_event, id: string, title: string) => this.store.rename(id, title))
    ipcMain.handle(
      BookChannel.Read,
      async (_event, id: string): Promise<BookReadResult> => {
        const meta = (await this.store.list()).find((book) => book.id === id)
        if (!meta) throw new Error('Book not found')
        const [parsed, note, anchors, ocrPages, aiPages] = await Promise.all([
          this.store.readParsed(id),
          this.store.readNote(id),
          this.store.readAnchors(id),
          this.store.listOcrPages(id),
          this.store.listAiPages(id)
        ])
        return { meta, parsed, note, anchors, ocrPages, aiPages }
      }
    )
    ipcMain.handle(BookChannel.ReadSource, (_event, id: string) => this.store.readSource(id))
    ipcMain.handle(BookChannel.SaveParse, (_event, id: string, parsed: ParsedBook) => this.store.saveParsed(id, parsed))
    ipcMain.handle(BookChannel.ReadNote, (_event, id: string) => this.store.readNote(id))
    ipcMain.handle(BookChannel.SaveNote, (_event, id: string, note: BookNote) => this.store.saveNote(id, note))
    ipcMain.handle(BookChannel.SaveAnchor, (_event, id: string, blockId: string, fen: string) => this.store.saveAnchor(id, blockId, fen))
    ipcMain.handle(BookChannel.ClearAnchor, (_event, id: string, blockId: string) => this.store.clearAnchor(id, blockId))
    ipcMain.handle(BookChannel.ReadOcrPage, (_event, id: string, page: number) => this.store.readOcrPage(id, page))
    ipcMain.handle(BookChannel.SaveOcrPage, (_event, id: string, record: BookOcrPage) => this.store.saveOcrPage(id, record))
    ipcMain.handle(BookChannel.ListAiPages, (_event, id: string) => this.store.listAiPages(id))
    ipcMain.handle(BookChannel.ReadAiPage, (_event, id: string, page: number) => this.store.readAiPage(id, page))
    ipcMain.handle(BookChannel.SaveAiPage, (_event, id: string, record: AiPageRecord) => this.store.saveAiPage(id, record))
    ipcMain.handle(BookChannel.ReadAiBatch, (_event, id: string, firstPage: number, count: number) => this.store.readAiBatch(id, firstPage, count))
    ipcMain.handle(BookChannel.SaveAiBatch, (_event, id: string, batch: AiBatchRecord) => this.store.saveAiBatch(id, batch))
    ipcMain.handle(BookChannel.ListAiBatches, (_event, id: string) => this.store.listAiBatches(id))

    ipcMain.handle(BookChannel.Import, async (): Promise<BookImportReport> => {
      const result = await dialog.showOpenDialog({
        title: 'Upload a chess book',
        filters: [{ name: 'PDF book', extensions: ['pdf'] }],
        properties: ['openFile', 'multiSelections']
      })
      if (result.canceled || result.filePaths.length === 0) return { cancelled: true, entries: [] }

      const entries: BookImportEntry[] = []
      for (const path of result.filePaths) {
        const name = basename(path)
        try {
          const { meta, duplicate } = await this.store.importFile(path)
          entries.push({ name, book: meta, duplicate })
        } catch (error) {
          entries.push({ name, error: error instanceof Error ? error.message : String(error) })
        }
      }
      return { cancelled: false, entries }
    })
  }
}
