import type { EvalLine } from '@shared/engine'
import { formatScore, winChance } from '@shared/uci'
import type { LinesByFen } from './review.ts'

export type BarReading = { whiteChance: number; label: string }

/**
 * Review pauses the live engine, so the bar must be able to read the review's own
 * lines; a live line still wins because it tracks the position as it is searched.
 */
export function barReading(args: { fen: string; turn: 'w' | 'b'; live: EvalLine | null; reviewLines: LinesByFen }): BarReading {
  const reviewed = args.reviewLines.get(args.fen)
  const top = reviewed?.find((line) => line.multipv === 1) ?? reviewed?.[0] ?? null
  const line = args.live ?? top
  if (!line) return { whiteChance: 50, label: '' }
  return {
    whiteChance: args.turn === 'w' ? winChance(line.score) : 100 - winChance(line.score),
    label: formatScore(line.score, args.turn === 'w' ? 'white' : 'black')
  }
}