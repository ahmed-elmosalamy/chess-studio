import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pgnSummary, splitPgnGames } from '../../shared/pgn.ts'
import type { ImportOutcome, LibraryEntry } from '../../shared/library.ts'

export type LibraryStore = {
  list: () => Promise<LibraryEntry[]>
  save: (pgn: string) => Promise<LibraryEntry>
  read: (id: string) => Promise<string>
  remove: (id: string) => Promise<void>
}

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INDEX_FILE = 'index.json'

function assertId(id: string): void {
  if (!ID_PATTERN.test(id)) throw new Error(`Invalid library id: ${id}`)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createLibraryStore(dir: string): LibraryStore {
  const indexPath = join(dir, INDEX_FILE)

  const readIndex = async (): Promise<LibraryEntry[]> => {
    let raw: string
    try {
      raw = await readFile(indexPath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw new Error(`Library index could not be read: ${messageOf(error)}`)
    }
    try {
      const parsed = JSON.parse(raw) as { entries?: LibraryEntry[] }
      if (!Array.isArray(parsed.entries)) throw new Error('entries is not an array')
      return parsed.entries
    } catch (error) {
      throw new Error(`Library index is corrupt: ${messageOf(error)}`)
    }
  }

  const writeIndex = async (entries: LibraryEntry[]): Promise<void> => {
    const tempPath = `${indexPath}.tmp`
    await writeFile(tempPath, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`, 'utf8')
    await rename(tempPath, indexPath)
  }

  const pgnPath = (id: string): string => join(dir, `${id}.pgn`)

  return {
    list: () => readIndex(),

    save: async (pgn) => {
      const text = pgn.trim()
      const { headers, plies } = pgnSummary(text)
      const entry: LibraryEntry = {
        id: randomUUID(),
        white: headers['White'] ?? '?',
        black: headers['Black'] ?? '?',
        event: headers['Event'] ?? '?',
        date: headers['Date'] ?? '????.??.??',
        result: headers['Result'] ?? '*',
        plies,
        savedAt: Date.now()
      }

      await mkdir(dir, { recursive: true })
      await writeFile(pgnPath(entry.id), `${text}\n`, 'utf8')
      await writeIndex([entry, ...(await readIndex())])
      return entry
    },

    read: async (id) => {
      assertId(id)
      const entries = await readIndex()
      if (!entries.some((entry) => entry.id === id)) throw new Error('Library game not found')
      return readFile(pgnPath(id), 'utf8')
    },

    remove: async (id) => {
      assertId(id)
      const entries = await readIndex()
      if (!entries.some((entry) => entry.id === id)) throw new Error('Library game not found')
      await rm(pgnPath(id), { force: true })
      await writeIndex(entries.filter((entry) => entry.id !== id))
    }
  }
}

export async function importPgnText(store: LibraryStore, text: string): Promise<ImportOutcome> {
  const saved: LibraryEntry[] = []
  const skipped: ImportOutcome['skipped'] = []
  for (const [index, game] of splitPgnGames(text).entries()) {
    try {
      saved.push(await store.save(game))
    } catch (error) {
      skipped.push({ index, reason: messageOf(error) })
    }
  }
  return { saved, skipped }
}