import { BOOK_LINES } from './bookLines.ts'
import { START_FEN } from './game.ts'
import type { Tree } from './tree.ts'
import type { EvaluationParts } from './review.ts'

/** Nodes on the main line (any branch) whose move sequence is a known opening line, keyed from the tree root. */
export function bookMoves(tree: Tree, rootId: string, lines: ReadonlySet<string> = BOOK_LINES): Set<string> {
  const marked = new Set<string>()
  if (tree[rootId]?.fen !== START_FEN) return marked

  const walk = (nodeId: string, prefix: string): void => {
    for (const childId of tree[nodeId].childIds) {
      const node = tree[childId]
      if (!node.from || !node.to) continue
      const move = `${node.from}${node.to}${node.promotion ?? ''}`
      const sequence = prefix ? `${prefix} ${move}` : move
      if (!lines.has(sequence)) continue
      marked.add(childId)
      walk(childId, sequence)
    }
  }

  walk(rootId, '')
  return marked
}

export function bookEvaluation(): EvaluationParts {
  return { grade: 'book', loss: 0, cpLoss: null, accuracy: 100, beforeLabel: 'Book', afterLabel: 'Book', whiteAfter: 50 }
}