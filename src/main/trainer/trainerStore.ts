import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { nextSchedule, utcDay, type AddPuzzlesResult, type PuzzleDraft, type TrainerPuzzle } from '../../shared/trainer.ts'
import { quarantine } from '../quarantine.ts'

export type TrainerStore = {
  list: () => Promise<TrainerPuzzle[]>
  add: (drafts: PuzzleDraft[], now?: Date) => Promise<AddPuzzlesResult>
  attempt: (id: string, solved: boolean, now?: Date) => Promise<TrainerPuzzle>
  remove: (id: string) => Promise<void>
  clear: () => Promise<void>
}

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FILE = 'trainer.json'
const VERSION = 1

type Snapshot = { version: number; puzzles: TrainerPuzzle[] }

function assertId(id: string): void {
  if (!ID_PATTERN.test(id)) throw new Error(`Invalid trainer id: ${id}`)
}

function isValid(value: unknown): value is TrainerPuzzle {
  if (!value || typeof value !== 'object') return false
  const puzzle = value as TrainerPuzzle
  return (
    typeof puzzle.id === 'string' &&
    ID_PATTERN.test(puzzle.id) &&
    typeof puzzle.fen === 'string' &&
    typeof puzzle.playedUci === 'string' &&
    typeof puzzle.bestUci === 'string' &&
    Array.isArray(puzzle.accepted) &&
    puzzle.accepted.every((move) => typeof move === 'string') &&
    (puzzle.grade === 'blunder' || puzzle.grade === 'mistake' || puzzle.grade === 'missedWin') &&
    typeof puzzle.ply === 'number' &&
    typeof puzzle.attempts === 'number' &&
    typeof puzzle.streak === 'number' &&
    typeof puzzle.dueAt === 'string'
  )
}

function keyOf(puzzle: { fen: string; bestUci: string }): string {
  return `${puzzle.fen}|${puzzle.bestUci}`
}

export function createTrainerStore(dir: string): TrainerStore {
  const filePath = join(dir, FILE)

  const read = async (): Promise<TrainerPuzzle[]> => {
    let raw: string
    try {
      raw = await readFile(filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw new Error(`Trainer file could not be read: ${error instanceof Error ? error.message : String(error)}`)
    }
    try {
      const parsed = JSON.parse(raw) as { puzzles?: unknown }
      if (!Array.isArray(parsed.puzzles)) throw new Error('puzzles is not an array')
      return parsed.puzzles.filter(isValid)
    } catch (error) {
      await quarantine(filePath, error)
      return []
    }
  }

  const write = async (puzzles: TrainerPuzzle[]): Promise<void> => {
    const snapshot: Snapshot = { version: VERSION, puzzles }
    await mkdir(dir, { recursive: true })
    const tempPath = `${filePath}.tmp`
    await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
    await rename(tempPath, filePath)
  }

  return {
    list: read,

    add: async (drafts, now = new Date()) => {
      const existing = await read()
      const known = new Set(existing.map(keyOf))
      const added: TrainerPuzzle[] = []
      let duplicates = 0

      for (const draft of drafts) {
        const key = keyOf(draft)
        if (known.has(key)) {
          duplicates += 1
          continue
        }
        known.add(key)
        added.push({
          ...draft,
          id: randomUUID(),
          attempts: 0,
          streak: 0,
          dueAt: utcDay(now),
          createdAt: now.toISOString(),
          lastAttemptAt: null
        })
      }

      if (added.length > 0) await write([...added, ...existing])
      return { added, duplicates, total: added.length + existing.length }
    },

    attempt: async (id, solved, now = new Date()) => {
      assertId(id)
      const puzzles = await read()
      const index = puzzles.findIndex((puzzle) => puzzle.id === id)
      if (index < 0) throw new Error('Trainer puzzle not found')
      const updated: TrainerPuzzle = {
        ...puzzles[index],
        ...nextSchedule(puzzles[index], solved, now),
        lastAttemptAt: now.toISOString()
      }
      const next = [...puzzles]
      next[index] = updated
      await write(next)
      return updated
    },

    remove: async (id) => {
      assertId(id)
      const puzzles = await read()
      await write(puzzles.filter((puzzle) => puzzle.id !== id))
    },

    clear: async () => {
      await write([])
    }
  }
}
