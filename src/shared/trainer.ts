export type TrainerGrade = 'blunder' | 'mistake' | 'missedWin'

export type PuzzleDraft = {
  fen: string
  playedUci: string
  bestUci: string
  accepted: string[]
  grade: TrainerGrade
  ply: number
  gameLabel: string
}

export type TrainerPuzzle = PuzzleDraft & {
  id: string
  attempts: number
  streak: number
  dueAt: string
  createdAt: string
  lastAttemptAt: string | null
}

export type ScheduleState = { attempts: number; streak: number; dueAt: string }

export type AddPuzzlesResult = { added: TrainerPuzzle[]; duplicates: number; total: number }

export type TrainerSummary = { total: number; due: number; solved: number; failing: number }

export const TrainerChannel = {
  List: 'trainer:list',
  Add: 'trainer:add',
  Attempt: 'trainer:attempt',
  Remove: 'trainer:remove',
  Clear: 'trainer:clear'
} as const

/** Days until the next showing after a correct answer; the streak index picks the rung. */
const LADDER = [1, 3, 7, 21]

export function utcDay(now: Date, addDays = 0): string {
  const stamp = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + addDays)
  return new Date(stamp).toISOString().slice(0, 10)
}

export function nextSchedule(state: ScheduleState, solved: boolean, now = new Date()): ScheduleState {
  const attempts = state.attempts + 1
  if (!solved) return { attempts, streak: 0, dueAt: utcDay(now, 1) }
  const streak = state.streak + 1
  const days = LADDER[Math.min(streak, LADDER.length) - 1]
  return { attempts, streak, dueAt: utcDay(now, days) }
}

export function duePuzzles<T extends { dueAt: string }>(puzzles: T[], now = new Date()): T[] {
  const today = utcDay(now)
  return puzzles.filter((puzzle) => puzzle.dueAt <= today)
}
