import type { EngineSettings, EvalLine } from './engine.ts'

export type PlayLevel = {
  level: number
  label: string
  depth: number
  multipv: number
  blunderChance: number
}

export const PLAY_LEVELS: PlayLevel[] = [
  { level: 1, label: 'Beginner', depth: 3, multipv: 4, blunderChance: 0.5 },
  { level: 2, label: 'Casual', depth: 4, multipv: 4, blunderChance: 0.4 },
  { level: 3, label: 'Club', depth: 5, multipv: 3, blunderChance: 0.3 },
  { level: 4, label: 'Steady', depth: 6, multipv: 3, blunderChance: 0 },
  { level: 5, label: 'Strong', depth: 8, multipv: 2, blunderChance: 0 },
  { level: 6, label: 'Expert', depth: 10, multipv: 2, blunderChance: 0 },
  { level: 7, label: 'Master', depth: 12, multipv: 1, blunderChance: 0 },
  { level: 8, label: 'Maximum', depth: 14, multipv: 1, blunderChance: 0 }
]

export const DEFAULT_PLAY_LEVEL = 3

export type TimeControlId = 'none' | 'blitz3' | 'blitz5' | 'rapid10'

export type TimeControl = { id: TimeControlId; label: string; minutes: number; increment: number }

export const TIME_CONTROLS: TimeControl[] = [
  { id: 'none', label: 'No clock', minutes: 0, increment: 0 },
  { id: 'blitz3', label: '3+2 blitz', minutes: 3, increment: 2 },
  { id: 'blitz5', label: '5+0 blitz', minutes: 5, increment: 0 },
  { id: 'rapid10', label: '10+5 rapid', minutes: 10, increment: 5 }
]

export function timeControlSpec(id: string): TimeControl {
  return TIME_CONTROLS.find((control) => control.id === id) ?? TIME_CONTROLS[0]
}

export function levelSpec(level: number): PlayLevel {
  const clamped = Math.min(PLAY_LEVELS.length, Math.max(1, Math.round(level) || 1))
  return PLAY_LEVELS[clamped - 1]
}

export function settingsForLevel(level: number): Pick<EngineSettings, 'depth' | 'multipv'> {
  const spec = levelSpec(level)
  return { depth: spec.depth, multipv: spec.multipv }
}

/**
 * Picks the engine reply. Levels 1-3 sometimes trade accuracy for variety by playing a lower
 * MultiPV line; a single random value keeps the choice reproducible in tests and replays.
 */
export function chooseEngineMove(lines: EvalLine[], level: number, rng: () => number = Math.random): string | null {
  const ordered = [...lines].filter((line) => line.pv.length > 0).sort((a, b) => a.multipv - b.multipv)
  const best = ordered[0]
  if (!best) return null

  const spec = levelSpec(level)
  const roll = Math.min(1, Math.max(0, rng()))
  if (spec.blunderChance <= 0 || ordered.length === 1 || roll < 1 - spec.blunderChance) return best.pv[0]

  const fraction = (roll - (1 - spec.blunderChance)) / spec.blunderChance
  const worstIndex = ordered.length - 1
  const offset = 1 + Math.min(worstIndex - 1, Math.floor(fraction * worstIndex))
  return ordered[offset].pv[0]
}
