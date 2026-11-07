import { app, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { LibraryChannel, libraryFileName, type FetchRequest, type ImportedFile, type LibraryImportReport } from '@shared/library'
import { createLibraryStore, importPgnText } from './libraryStore'
import { fetchGames } from './libraryFetch'

export default class LibraryManager {
  private readonly store = createLibraryStore(join(app.getPath('userData'), 'library'))

  register(): void {
    ipcMain.handle(LibraryChannel.List, () => this.store.list())
    ipcMain.handle(LibraryChannel.Save, (_event, pgn: string) => this.store.save(pgn))
    ipcMain.handle(LibraryChannel.Read, (_event, id: string) => this.store.read(id))
    ipcMain.handle(LibraryChannel.Remove, async (_event, id: string) => {
      await this.store.remove(id)
    })

    ipcMain.handle(LibraryChannel.Export, async (_event, id: string) => {
      const pgn = await this.store.read(id)
      const entry = (await this.store.list()).find((candidate) => candidate.id === id)
      const result = await dialog.showSaveDialog({
        title: 'Export game as PGN',
        defaultPath: join(app.getPath('documents'), libraryFileName(entry ?? { white: '', black: '', date: '' })),
        filters: [{ name: 'PGN game', extensions: ['pgn'] }]
      })
      if (result.canceled || !result.filePath) return null
      await writeFile(result.filePath, pgn, 'utf8')
      return result.filePath
    })

    ipcMain.handle(LibraryChannel.FetchOnline, (_event, request: FetchRequest) => fetchGames(request))

    ipcMain.handle(LibraryChannel.ImportFiles, async (): Promise<LibraryImportReport> => {
      const result = await dialog.showOpenDialog({
        title: 'Import PGN files',
        filters: [{ name: 'PGN games', extensions: ['pgn', 'txt'] }],
        properties: ['openFile', 'multiSelections']
      })
      if (result.canceled || result.filePaths.length === 0) return { cancelled: true, files: [] }

      const files: ImportedFile[] = []
      for (const path of result.filePaths) {
        const name = basename(path)
        try {
          const outcome = await importPgnText(this.store, await readFile(path, 'utf8'))
          files.push({ name, saved: outcome.saved.length, skipped: outcome.skipped })
        } catch (error) {
          files.push({ name, saved: 0, skipped: [{ index: 0, reason: error instanceof Error ? error.message : String(error) }] })
        }
      }
      return { cancelled: false, files }
    })
  }
}