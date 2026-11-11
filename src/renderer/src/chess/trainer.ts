import { scoreToCp } from '@shared/review'
import type { EvalLine } from '@shared/engine'
import type { PuzzleDraft, TrainerGrade } from '@shared/trainer'
import { everyNode, uciMove, type EvaluationParts, type LinesByFen } from './review.ts'
import type { Tree } from './tree.ts'

const FAILING: TrainerGrade[] = ['blunder', 'mistake', 'missedWin']
const ACCEPT_WINDOW = 50
const MAX_ACCEPTED = 3

/** Winning alternatives: near-equal engine moves when the top line is quiet, mate moves when it is mate. */
export function acceptedMoves(lines: EvalLine[] | undefined): string[] {
  if (!lines || lines.length === 0) return []
  const ordered = [...lines].sort((a, b) => a.multipv - b.multipv)
  const top = ordered.find((line) => line.multipv === 1) ?? ordered[0]
  if (!top || top.pv.length === 0) return []

  const topCp = scoreToCp(top.score)
  const mate = top.score.type === 'mate' && top.score.value > 0
  const accepted: string[] = []
  for (const line of ordered) {
    if (line.pv.length === 0) continue
    const move = line.pv[0]
    const fits = mate
      ? line.score.type === 'mate' && line.score.value > 0
      : line.score.type === 'cp' && Math.abs(topCp - scoreToCp(line.score)) <= ACCEPT_WINDOW
    if (!fits || accepted.includes(move)) continue
    accepted.push(move)
    if (accepted.length >= MAX_ACCEPTED) break
  }
  return accepted
}

export type BuildPuzzlesInput = {
  tree: Tree
  rootId: string
  results: Record<string, EvaluationParts>
  lines: LinesByFen
  gameLabel?: string
}

export function buildPuzzles(input: BuildPuzzlesInput): PuzzleDraft[] {
  const { tree, rootId, results, lines, gameLabel = '' } = input
  const puzzles: PuzzleDraft[] = []
  const seen = new Set<string>()

  for (const node of everyNode(tree, rootId)) {
    const review = results[node.id]
    if (!review || !node.parentId) continue
    if (!FAILING.includes(review.grade as TrainerGrade)) continue

    const fen = tree[node.parentId].fen
    const accepted = acceptedMoves(lines.get(fen))
    const bestUci = accepted[0]
    const playedUci = uciMove(node)
    if (!bestUci || bestUci === playedUci) continue

    const key = `${fen}|${bestUci}`
    if (seen.has(key)) continue
    seen.add(key)
    puzzles.push({ fen, playedUci, bestUci, accepted, grade: review.grade as TrainerGrade, ply: node.ply, gameLabel })
  }

  return puzzles.sort((a, b) => a.ply - b.ply)
}
