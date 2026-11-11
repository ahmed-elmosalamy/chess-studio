export const LibraryChannel = {
  List: 'library:list',
  Save: 'library:save',
  Read: 'library:read',
  Remove: 'library:remove',
  Export: 'library:export',
  ExportReport: 'library:export-report',
  ImportFiles: 'library:import-files',
  FetchOnline: 'library:fetch-online'
} as const

export type LibraryEntry = {
  id: string
  white: string
  black: string
  event: string
  date: string
  result: string
  plies: number
  savedAt: number
  eco?: string
  opening?: string
  whiteElo?: number
  blackElo?: number
  timeControl?: string
}

export type SkippedGame = { index: number; reason: string }

export type SaveResult = { entry: LibraryEntry; duplicate: boolean }

export type ImportOutcome = { saved: LibraryEntry[]; skipped: SkippedGame[]; duplicates: LibraryEntry[] }

export type ImportedFile = { name: string; saved: number; duplicates: number; skipped: SkippedGame[] }

export type LibraryImportReport = { cancelled: boolean; files: ImportedFile[] }

export type FetchRequest =
  | { provider: 'chesscom'; username: string; max: number }
  | { provider: 'lichess'; username: string; max: number }
  | { provider: 'lichess-game'; gameId: string }

export type FetchedGame = {
  pgn: string
  white: string
  black: string
  event: string
  date: string
  result: string
  plies: number
}

export type FetchReport = { source: string; games: FetchedGame[]; skipped: SkippedGame[] }

export function libraryFileName(entry: { white: string; black: string; date: string }): string {
  const clean = (value: string): string => value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40)
  const parts = [clean(entry.white) || 'white', clean(entry.black) || 'black', clean(entry.date) || 'game']
  return `${parts.join(' vs ')}.pgn`
}