import type { EngineScore } from './engine'

export type ReviewGrade =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'missedWin'

export type GradeMeta = { label: string; glyph: string; nag: string | null; color: string; notable: boolean }

export const gradeMeta: Record<ReviewGrade, GradeMeta> = {
  brilliant: { label: 'Brilliant', glyph: '!!', nag: '$2', color: 'var(--grade-brilliant)', notable: true },
  great: { label: 'Great', glyph: '!', nag: '$1', color: 'var(--grade-great)', notable: true },
  best: { label: 'Best', glyph: '□', nag: '$7', color: 'var(--grade-best)', notable: false },
  excellent: { label: 'Excellent', glyph: '✓', nag: null, color: 'var(--grade-excellent)', notable: false },
  good: { label: 'Good', glyph: '·', nag: null, color: 'var(--grade-good)', notable: false },
  inaccuracy: { label: 'Inaccuracy', glyph: '?!', nag: '$3', color: 'var(--grade-inaccuracy)', notable: true },
  mistake: { label: 'Mistake', glyph: '?', nag: '$6', color: 'var(--grade-mistake)', notable: true },
  blunder: { label: 'Blunder', glyph: '??', nag: '$4', color: 'var(--grade-blunder)', notable: true },
  missedWin: { label: 'Missed win', glyph: '≈', nag: null, color: 'var(--grade-missed)', notable: true }
}

export const reviewOrder: ReviewGrade[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
  'missedWin'
]

export const ReviewThresholds = {
  excellent: 25,
  good: 60,
  inaccuracy: 150,
  mistake: 400,
  greatGap: 120,
  winning: 200,
  missLoss: 60,
  brilliantLead: 100,
  minStake: 25
} as const

/** Mate scores share one scale with centipawns so a lost forced mate always outranks a pawn swing. */
export const MATE_CP = 10000

export function scoreToCp(score: EngineScore): number {
  if (score.type === 'cp') return score.value
  const step = Math.max(0, 100 - Math.abs(score.value))
  return score.value > 0 ? MATE_CP + step : -(MATE_CP + step)
}

export function flipScore(score: EngineScore): EngineScore {
  return { type: score.type, value: -score.value }
}

export type MoveFacts = {
  isBest: boolean
  isSacrifice: boolean
  onlyMove: boolean
  mateAvailable: boolean
  matedAfter: boolean
  mateInvolved: boolean
  topCp: number
  secondCp: number | null
  afterCp: number
  wcBefore: number
  wcAfter: number
  opponentBlundered: boolean
}

export type MoveEvaluation = { grade: ReviewGrade; loss: number; cpLoss: number | null; accuracy: number }

export function gradeMove(facts: MoveFacts): MoveEvaluation {
  const t = ReviewThresholds
  const loss = Math.max(0, facts.topCp - facts.afterCp)
  const cpLoss = facts.mateInvolved ? null : loss
  const gap = facts.secondCp === null ? null : facts.topCp - facts.secondCp

  const threwAwayWin = facts.topCp >= t.winning && facts.afterCp >= t.missLoss && loss >= t.inaccuracy
  const failedToPunish = facts.opponentBlundered && facts.afterCp >= 0 && loss >= t.inaccuracy
  const missedForcedMate = facts.mateAvailable && facts.afterCp >= t.missLoss

  let grade: ReviewGrade
  if (facts.matedAfter) grade = 'blunder'
  else if (facts.isSacrifice && loss <= t.excellent && facts.afterCp >= t.brilliantLead) grade = 'brilliant'
  else if (facts.isBest) grade = facts.onlyMove || (gap !== null && gap >= t.greatGap) ? 'great' : 'best'
  else if (missedForcedMate || ((threwAwayWin || failedToPunish) && loss <= t.mistake)) grade = 'missedWin'
  else if (loss <= t.excellent) grade = 'excellent'
  else if (loss <= t.good) grade = 'good'
  else if (loss <= t.inaccuracy) grade = 'inaccuracy'
  else if (loss <= t.mistake) grade = 'mistake'
  else grade = 'blunder'

  const pinned = grade === 'best' || grade === 'great' || grade === 'brilliant'
  return { grade, loss, cpLoss, accuracy: pinned ? 100 : capsAccuracy(facts.wcBefore, facts.wcAfter) }
}

/**
 * CAPS-style accuracy: how much of the win chance the move kept, measured against the points that
 * were actually on the table, so a quiet equal position is not punished like a blown winning one.
 */
export function capsAccuracy(wcBefore: number, wcAfter: number): number {
  const drop = Math.max(0, wcBefore - wcAfter)
  if (drop <= 0) return 100
  const stake = Math.max(wcBefore, ReviewThresholds.minStake)
  return Math.min(100, Math.max(0, Math.round(100 * (1 - drop / stake))))
}

export type GradeCounts = Record<ReviewGrade, number>

export type SideSummary = { moves: number; accuracy: number; acpl: number | null; counts: GradeCounts }

export function emptyCounts(): GradeCounts {
  return reviewOrder.reduce((counts, grade) => ({ ...counts, [grade]: 0 }), {} as GradeCounts)
}

export function summarizeMoves(evaluations: MoveEvaluation[]): SideSummary {
  const counts = emptyCounts()
  const losses: number[] = []
  let total = 0

  for (const entry of evaluations) {
    counts[entry.grade] += 1
    total += entry.accuracy
    if (entry.cpLoss !== null) losses.push(entry.cpLoss)
  }

  const accuracy = evaluations.length === 0 ? 0 : Math.round(total / evaluations.length)
  const acpl = losses.length === 0 ? null : Math.round((losses.reduce((sum, value) => sum + value, 0) / losses.length) * 10) / 10

  return { moves: evaluations.length, accuracy, acpl, counts }
}
