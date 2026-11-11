import { summarizeMoves } from '@shared/review'
import type { MoveEvaluation } from '@shared/review'
import type { EvaluationParts } from './review.ts'
import type { Tree } from './tree.ts'

export type GamePhase = 'opening' | 'middlegame' | 'endgame'

export type PhaseStats = { accuracy: number; acpl: number | null; plies: number }

export type SidePhases = { opening: PhaseStats | null; middlegame: PhaseStats | null; endgame: PhaseStats | null }

export type PhaseAccuracy = { white: SidePhases; black: SidePhases }

const HEAVY_PIECES = /[nbrqNBRQ]/g
const PHASES: GamePhase[] = ['opening', 'middlegame', 'endgame']

/** Opening is book-window based; endgame counts every non-king, non-pawn piece left on the board. */
export function phaseOf(ply: number, fenBefore: string, openingEndPly: number): GamePhase {
  if (ply <= Math.max(16, openingEndPly)) return 'opening'
  const placement = fenBefore.split(' ')[0] ?? ''
  const heavy = (placement.match(HEAVY_PIECES) ?? []).length
  return heavy <= 6 ? 'endgame' : 'middlegame'
}

export function phaseAccuracy(results: Record<string, EvaluationParts>, tree: Tree, openingEndPly: number): PhaseAccuracy {
  const buckets: Record<'w' | 'b', Record<GamePhase, MoveEvaluation[]>> = {
    w: { opening: [], middlegame: [], endgame: [] },
    b: { opening: [], middlegame: [], endgame: [] }
  }

  for (const [nodeId, evaluation] of Object.entries(results)) {
    const node = tree[nodeId]
    if (!node?.parentId || !node.color) continue
    buckets[node.color][phaseOf(node.ply, tree[node.parentId].fen, openingEndPly)].push(evaluation)
  }

  const side = (color: 'w' | 'b'): SidePhases => {
    const phases: SidePhases = { opening: null, middlegame: null, endgame: null }
    for (const phase of PHASES) {
      if (buckets[color][phase].length === 0) continue
      const summary = summarizeMoves(buckets[color][phase])
      phases[phase] = { accuracy: summary.accuracy, acpl: summary.acpl, plies: summary.moves }
    }
    return phases
  }

  return { white: side('w'), black: side('b') }
}
