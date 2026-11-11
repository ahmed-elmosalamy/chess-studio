import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pgnHeaders, pgnSummary, splitPgnGames } from '../../shared/pgn.ts'
import type { ImportOutcome, LibraryEntry, SaveResult } from '../../shared/library.ts'
import { quarantine } from '../quarantine.ts'

export type LibraryStore = {
  list: () => Promise<LibraryEntry[]>
  save: (pgn: string) => Promise<SaveResult>
  read: (id: string) => Promise<string>
  remove: (id: string) => Promise<void>
}

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INDEX_FILE = 'index.json'
const INDEX_VERSION = 2

type LibraryIndex = { version: number; entries: LibraryEntry[] }

function eloOf(value: string | undefined): number | undefined {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function withMetadata(entry: LibraryEntry, headers: Record<string, string>): LibraryEntry {
  return {
    ...entry,
    eco: headers.ECO?.trim() || undefined,
    opening: headers.Opening?.trim() || undefined,
    whiteElo: eloOf(headers.WhiteElo),
    blackElo: eloOf(headers.BlackElo),
    timeControl: headers.TimeControl?.trim() || undefined
  }
}

const hasMetadata = (entry: LibraryEntry): boolean =>
  entry.eco !== undefined ||
  entry.opening !== undefined ||
  entry.whiteElo !== undefined ||
  entry.blackElo !== undefined ||
  entry.timeControl !== undefined

function assertId(id: string): void {
  if (!ID_PATTERN.test(id)) throw new Error(`Invalid library id: ${id}`)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizePgn(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{2,}/g, '\n\n')
    .trim()
}

function gameKey(headers: Record<string, string>, text: string): string {
  const link = headers['Link']?.trim()
  const site = headers['Site']?.trim() ?? ''
  for (const value of [link, site]) {
    if (!value) continue
    const lichess = /lichess\.org\/(?:game\/)?([A-Za-z0-9]{8,12})/i.exec(value)
    if (lichess) return `lichess:${lichess[1]}`
    const chesscom = /chess\.com\/(?:game|live)\/([A-Za-z0-9]+)/i.exec(value)
    if (chesscom) return `chesscom:${chesscom[1]}`
  }
  if (link) return `link:${link}`
  const gameId = headers['GameId']?.trim()
  if (gameId) return `lichess:${gameId}`
  return `text:${normalizePgn(text)}`
}

export function createLibraryStore(dir: string): LibraryStore {
  const indexPath = join(dir, INDEX_FILE)

  const readIndex = async (): Promise<LibraryIndex> => {
    let raw: string
    try {
      raw = await readFile(indexPath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: INDEX_VERSION, entries: [] }
      throw new Error(`Library index could not be read: ${messageOf(error)}`)
    }
    try {
      const parsed = JSON.parse(raw) as { version?: number; entries?: LibraryEntry[] }
      if (!Array.isArray(parsed.entries)) throw new Error('entries is not an array')
      return { version: typeof parsed.version === 'number' ? parsed.version : 1, entries: parsed.entries }
    } catch (error) {
      await quarantine(indexPath, error)
      return { version: INDEX_VERSION, entries: [] }
    }
  }

  const writeIndex = async (entries: LibraryEntry[]): Promise<void> => {
    const tempPath = `${indexPath}.tmp`
    await writeFile(tempPath, `${JSON.stringify({ version: INDEX_VERSION, entries }, null, 2)}\n`, 'utf8')
    await rename(tempPath, indexPath)
  }

  const pgnPath = (id: string): string => join(dir, `${id}.pgn`)

  const readEntries = async (): Promise<LibraryEntry[]> => (await readIndex()).entries

  /** Metadata-rich index v2 reads ECO, opening, ratings and time control out of each saved PGN once. */
  const backfill = async (entries: LibraryEntry[]): Promise<LibraryEntry[]> => {
    const upgraded = await Promise.all(
      entries.map(async (entry) => {
        if (hasMetadata(entry) || !ID_PATTERN.test(entry.id)) return entry
        try {
          return withMetadata(entry, pgnHeaders(await readFile(pgnPath(entry.id), 'utf8')))
        } catch {
          return entry
        }
      })
    )
    try {
      await writeIndex(upgraded)
    } catch {
      // Memory already holds the upgraded entries; the next list retries the write.
    }
    return upgraded
  }

  const loadEntries = async (): Promise<LibraryEntry[]> => {
    const index = await readIndex()
    return index.version < INDEX_VERSION ? backfill(index.entries) : index.entries
  }

  return {
    list: () => loadEntries(),

    save: async (pgn) => {
      const text = pgn.trim()
      const { headers, plies } = pgnSummary(text)
      const entry: LibraryEntry = withMetadata(
        {
          id: randomUUID(),
          white: headers['White'] ?? '?',
          black: headers['Black'] ?? '?',
          event: headers['Event'] ?? '?',
          date: headers['Date'] ?? '????.??.??',
          result: headers['Result'] ?? '*',
          plies,
          savedAt: Date.now()
        },
        headers
      )

      const key = gameKey(headers, text)
      const entries = await loadEntries()
      for (const candidate of entries) {
        if (candidate.white !== entry.white || candidate.black !== entry.black || candidate.date !== entry.date || candidate.result !== entry.result) continue
        let candidateText: string
        try {
          candidateText = (await readFile(pgnPath(candidate.id), 'utf8')).trim()
        } catch {
          continue
        }
        try {
          if (gameKey(pgnSummary(candidateText).headers, candidateText) === key) return { entry: candidate, duplicate: true }
        } catch {
          continue
        }
      }

      await mkdir(dir, { recursive: true })
      await writeFile(pgnPath(entry.id), `${text}\n`, 'utf8')
      await writeIndex([entry, ...entries])
      return { entry, duplicate: false }
    },

    read: async (id) => {
      assertId(id)
      const entries = await readEntries()
      if (!entries.some((entry) => entry.id === id)) throw new Error('Library game not found')
      return readFile(pgnPath(id), 'utf8')
    },

    remove: async (id) => {
      assertId(id)
      const entries = await loadEntries()
      if (!entries.some((entry) => entry.id === id)) throw new Error('Library game not found')
      await rm(pgnPath(id), { force: true })
      await writeIndex(entries.filter((entry) => entry.id !== id))
    }
  }
}

export async function importPgnText(store: LibraryStore, text: string): Promise<ImportOutcome> {
  const saved: LibraryEntry[] = []
  const skipped: ImportOutcome['skipped'] = []
  const duplicates: LibraryEntry[] = []
  for (const [index, game] of splitPgnGames(text).entries()) {
    try {
      const result = await store.save(game)
      if (result.duplicate) duplicates.push(result.entry)
      else saved.push(result.entry)
    } catch (error) {
      skipped.push({ index, reason: messageOf(error) })
    }
  }
  return { saved, skipped, duplicates }
}