import { evaluateMove, positionsToSearch, reviewTargets, type EvaluationParts, type LinesByFen, type ReviewScope } from '../chess/review.ts'
import { bookEvaluation, bookMoves } from '../chess/book.ts'
import type { EngineSettings, EvalLine } from '@shared/engine'
import type { Tree } from '../chess/tree.ts'
import type SearchQueue from './searchQueue.ts'

export type ReviewSnapshot = { lines: LinesByFen; results: Record<string, EvaluationParts> }
export type ReviewProgress = { done: number; total: number }
export type ReviewOutcome = ReviewSnapshot & { cancelled: boolean }

export default async function runReview(
  queue: SearchQueue,
  tree: Tree,
  rootId: string,
  scope: ReviewScope,
  onProgress: (progress: ReviewProgress, snapshot: ReviewSnapshot) => void,
  shouldStop: () => boolean
): Promise<ReviewOutcome> {
  const nodes = reviewTargets(tree, rootId, scope)
  const book = bookMoves(tree, rootId)
  const lines: LinesByFen = new Map()
  const results: Record<string, EvaluationParts> = {}

  for (const node of nodes) {
    if (book.has(node.id)) results[node.id] = bookEvaluation()
  }

  // Every position is searched, book moves included, so the board can show a best-move arrow on every ply.
  const fens = positionsToSearch(tree, nodes)

  const harvest = (): void => {
    for (const node of nodes) {
      if (results[node.id] || !node.parentId) continue
      const parentFen = tree[node.parentId].fen
      if (!lines.has(parentFen) || !lines.has(node.fen)) continue

      const review = evaluateMove(tree, node, lines, results[node.parentId]?.grade === 'blunder')
      if (review) results[node.id] = review
    }
  }

  for (const [index, fen] of fens.entries()) {
    if (shouldStop()) {
      harvest()
      return { lines, results, cancelled: true }
    }

    const searched: EvalLine[] = await queue.search(fen)
    lines.set(fen, searched)
    harvest()
    onProgress({ done: index + 1, total: fens.length }, { lines, results })
  }

  return { lines, results, cancelled: false }
}

export function reviewWorkload(tree: Tree, rootId: string, scope: ReviewScope): { moves: number; positions: number } {
  const book = bookMoves(tree, rootId)
  const nodes = reviewTargets(tree, rootId, scope)
  return { moves: nodes.filter((node) => !book.has(node.id)).length, positions: positionsToSearch(tree, nodes).length }
}

/** Classifying a move against its alternative needs at least two lines from every position. */
export function reviewSettings(depth: number, settings: EngineSettings): EngineSettings {
  return { ...settings, depth, multipv: Math.max(2, settings.multipv) }
}
