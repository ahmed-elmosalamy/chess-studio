import { Chess } from 'chess.js'
import { flipScore, gradeMeta, gradeMove, scoreToCp, type GradeMeta, type MoveEvaluation, type ReviewGrade } from '@shared/review'
import { formatScore, winChance } from '@shared/uci'
import type { EvalLine } from '@shared/engine'
import type { Tree, TreeNode } from './tree.ts'

export type ReviewScope = 'line' | 'tree'
export type LinesByFen = Map<string, EvalLine[]>

const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

export function turnOf(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w'
}

export function mainLineNodes(tree: Tree, rootId: string): TreeNode[] {
  const nodes: TreeNode[] = []
  let current: string | undefined = tree[rootId].childIds[0]
  while (current) {
    nodes.push(tree[current])
    current = tree[current].childIds[0]
  }
  return nodes
}

export function everyNode(tree: Tree, rootId: string): TreeNode[] {
  const nodes: TreeNode[] = []
  const walk = (id: string): void => {
    for (const childId of tree[id].childIds) {
      nodes.push(tree[childId])
      walk(childId)
    }
  }
  walk(rootId)
  return nodes
}

export function reviewTargets(tree: Tree, rootId: string, scope: ReviewScope): TreeNode[] {
  return scope === 'line' ? mainLineNodes(tree, rootId) : everyNode(tree, rootId)
}

/** Every position the classifier needs, once each: the position before each move plus the position after it. */
export function positionsToSearch(tree: Tree, nodes: TreeNode[]): string[] {
  const seen: string[] = []
  const push = (fen: string): void => {
    if (!seen.includes(fen)) seen.push(fen)
  }

  for (const node of nodes) {
    if (node.parentId) push(tree[node.parentId].fen)
    push(node.fen)
  }
  return seen
}

export function uciMove(node: TreeNode): string {
  return `${node.from}${node.to}${node.promotion ?? ''}`
}

function materialAfter(fen: string, moves: string[], color: 'w' | 'b'): number | null {
  const chess = new Chess(fen)
  for (const move of moves) {
    try {
      chess.move(move, { strict: false })
    } catch {
      return null
    }
  }

  let total = 0
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.color === color) total += pieceValues[cell.type]
    }
  }
  return total
}

/**
 * A sacrifice shows up as giving up material that the engine's reference line keeps, while the
 * evaluation stays at least as good, so both lines are played out to the same depth before counting.
 */
export function isSacrifice(
  parentFen: string,
  played: string,
  reply: string | undefined,
  best: string,
  bestReply: string | undefined,
  mover: 'w' | 'b'
): boolean {
  if (!reply || !bestReply) return false

  const playedMaterial = materialAfter(parentFen, [played, reply], mover)
  const bestMaterial = materialAfter(parentFen, [best, bestReply], mover)
  if (playedMaterial === null || bestMaterial === null) return false

  return playedMaterial <= bestMaterial - 1
}

export type EvaluationParts = MoveEvaluation & { beforeLabel: string; afterLabel: string; whiteAfter: number }

export function evaluateMove(
  tree: Tree,
  node: TreeNode,
  lines: LinesByFen,
  opponentBlundered: boolean
): EvaluationParts | null {
  if (!node.parentId) return null
  const parentFen = tree[node.parentId].fen
  const before = lines.get(parentFen)
  const after = lines.get(node.fen)
  if (!before || !after) return null

  const top = before.find((line) => line.multipv === 1) ?? before[0]
  const second = before.find((line) => line.multipv === 2)
  const reply = after.find((line) => line.multipv === 1) ?? after[0]
  if (!top || !reply || top.pv.length === 0 || reply.pv.length === 0) return null

  const mover = turnOf(parentFen)
  const played = uciMove(node)
  const chess = new Chess(parentFen)
  // When the played move is already the engine's first choice, the second line is the sacrifice to compare against.
  const reference = top.pv[0] === played && second ? second : top
  const facts = {
    isBest: top.pv[0] === played,
    isSacrifice: isSacrifice(parentFen, played, reply.pv[0], reference.pv[0], reference.pv[1], mover),
    onlyMove: chess.moves().length === 1,
    mateAvailable: top.score.type === 'mate' && top.score.value > 0,
    matedAfter: reply.score.type === 'mate' && reply.score.value > 0,
    mateInvolved: top.score.type === 'mate' || reply.score.type === 'mate',
    topCp: scoreToCp(top.score),
    secondCp: second ? scoreToCp(second.score) : null,
    afterCp: scoreToCp(flipScore(reply.score)),
    wcBefore: winChance(top.score),
    wcAfter: winChance(flipScore(reply.score)),
    opponentBlundered
  }

  const perspective = mover === 'w' ? 'white' : 'black'
  return {
    ...gradeMove(facts),
    beforeLabel: formatScore(top.score, perspective),
    afterLabel: formatScore(flipScore(reply.score), perspective),
    whiteAfter: mover === 'w' ? facts.wcAfter : 100 - facts.wcAfter
  }
}

export type GraphPoint = {
  nodeId: string
  ply: number
  whiteChance: number
  whitePawns: number
  grade: ReviewGrade | null
  meta: GradeMeta | null
  san: string | null
  color: 'w' | 'b' | null
  accuracy: number | null
  beforeLabel: string
  afterLabel: string
}

export function buildGraph(tree: Tree, rootId: string, lines: LinesByFen, grades: Record<string, EvaluationParts>): GraphPoint[] {
  const rootFen = tree[rootId].fen
  const points: GraphPoint[] = [
    { nodeId: rootId, ply: 0, ...curveAt(rootFen, lines), grade: null, meta: null, san: null, color: null, accuracy: null, beforeLabel: '', afterLabel: '' }
  ]

  for (const node of mainLineNodes(tree, rootId)) {
    const review = grades[node.id]
    points.push({
      nodeId: node.id,
      ply: node.ply,
      ...curveAt(node.fen, lines),
      grade: review?.grade ?? null,
      meta: review ? gradeMeta[review.grade] : null,
      san: node.san,
      color: node.color,
      accuracy: review?.accuracy ?? null,
      beforeLabel: review?.beforeLabel ?? '',
      afterLabel: review?.afterLabel ?? ''
    })
  }

  return points
}

function curveAt(fen: string, lines: LinesByFen): { whiteChance: number; whitePawns: number } {
  const searched = lines.get(fen)
  const top = searched ? searched.find((line) => line.multipv === 1) ?? searched[0] : undefined
  if (!top) return { whiteChance: 50, whitePawns: 0 }

  const score = turnOf(fen) === 'w' ? top.score : flipScore(top.score)
  const pawns = score.type === 'mate' ? (score.value > 0 ? 10 : -10) : Math.max(-10, Math.min(10, score.value / 100))
  return { whiteChance: winChance(score), whitePawns: pawns }
}
