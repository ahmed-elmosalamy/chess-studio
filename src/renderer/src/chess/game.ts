import { Chess } from 'chess.js'
import { addChild, createTree, type MoveInput, type Tree } from './tree.ts'
import type { PieceType } from './squares.ts'

export type GameDoc = { tree: Tree; rootId: string; currentId: string; headers: Record<string, string> }

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export const nagTable: { code: string; glyph: string; label: string }[] = [
  { code: '$1', glyph: '!', label: 'Good move' },
  { code: '$2', glyph: '!!', label: 'Brilliant' },
  { code: '$3', glyph: '?!', label: 'Cautious' },
  { code: '$4', glyph: '??', label: 'Blunder' },
  { code: '$5', glyph: '!?', label: 'Interesting' },
  { code: '$6', glyph: '?', label: 'Mistake' },
  { code: '$7', glyph: '□', label: 'Only move' },
  { code: '$9', glyph: 'N', label: 'Novelty' },
  { code: '$13', glyph: '∞', label: 'Unclear' },
  { code: '$16', glyph: '○', label: 'White wins' },
  { code: '$17', glyph: '●', label: 'Black wins' }
]

export function glyphOf(code: string | null): string | null {
  if (!code) return null
  return nagTable.find((entry) => entry.code === code)?.glyph ?? null
}

export function fenValid(fen: string): { ok: boolean; error: string | null } {
  try {
    new Chess(fen)
    return { ok: true, error: null }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid FEN' }
  }
}

export function tryMove(tree: Tree, parentId: string, move: string | { from: string; to: string; promotion?: string }): MoveInput | null {
  try {
    const chess = new Chess(tree[parentId].fen)
    const result = chess.move(move)
    if (!result) return null
    return {
      san: result.san,
      from: result.from,
      to: result.to,
      piece: result.piece as PieceType,
      color: result.color as 'w' | 'b',
      promotion: (result.promotion as PieceType | undefined) ?? null,
      flags: result.flags,
      fen: result.after
    }
  } catch {
    return null
  }
}

export function nodeIdAtPly(tree: Tree, rootId: string, ply: number): string | null {
  let current: string | undefined = tree[rootId].childIds[0]
  while (current) {
    if (tree[current].ply === ply) return current
    current = tree[current].childIds[0]
  }
  return null
}

function sanitizeHeaders(raw: Record<string, string | null>): Record<string, string> {
  const clean: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (value) clean[key] = value
  }
  return clean
}

export function treeFromPgn(pgnText: string): GameDoc {
  const chess = new Chess()
  chess.loadPgn(pgnText, { strict: false })

  const headers = sanitizeHeaders(chess.header())
  const comments = new Map<string, string>()
  for (const entry of chess.getComments()) comments.set(entry.fen, entry.comment)

  const played = chess.history({ verbose: true })
  const startFen = played.length > 0 ? played[0].before : chess.fen()
  const built = createTree(startFen)

  let tree = built.tree
  let parentId = built.rootId

  if (played.length === 0) {
    return { tree, rootId: parentId, currentId: parentId, headers }
  }

  for (const move of played) {
    const input: MoveInput = {
      san: move.san,
      from: move.from,
      to: move.to,
      piece: move.piece as PieceType,
      color: move.color as 'w' | 'b',
      promotion: (move.promotion as PieceType | undefined) ?? null,
      flags: move.flags,
      fen: move.after
    }
    const added = addChild(tree, parentId, input)
    tree = added.tree
    parentId = added.nodeId

    const comment = comments.get(move.after)
    if (comment) tree = { ...tree, [parentId]: { ...tree[parentId], comment } }
  }

  return { tree, rootId: built.rootId, currentId: parentId, headers }
}

export function pgnFromTree(tree: Tree, rootId: string, headers: Record<string, string>): string {
  const lines: string[] = []
  const defaults: Record<string, string> = { Event: '?', Site: '?', Date: '????.??.??', Round: '?', White: '?', Black: '?', Result: '*' }
  const merged = { ...defaults, ...headers }

  if (tree[rootId].fen !== START_FEN) {
    merged.SetUp = '1'
    merged.FEN = tree[rootId].fen
  }

  for (const [key, value] of Object.entries(merged)) {
    if (value) lines.push(`[${key} "${value}"]`)
  }
  lines.push('')

  const parts: string[] = []
  let current = tree[rootId].childIds[0]
  while (current) {
    const node = tree[current]
    if (node.ply % 2 === 1) parts.push(`${Math.ceil(node.ply / 2)}.`)
    parts.push(node.san as string)
    if (node.nag) parts.push(node.nag)
    if (node.comment) parts.push(`{${node.comment}}`)
    current = node.childIds[0]
  }

  const moves = parts.join(' ')
  const wrapped: string[] = []
  for (const chunk of moves.split(/(?<=\} )/)) {
    if (wrapped.length > 0 && `${wrapped[wrapped.length - 1]} ${chunk}`.length > 80) wrapped.push(chunk)
    else if (wrapped.length === 0) wrapped.push(chunk)
    else wrapped[wrapped.length - 1] = `${wrapped[wrapped.length - 1]} ${chunk}`
  }

  lines.push(...wrapped, '*')
  return lines.join('\n')
}

const DEMO_PGN = [
  '[Event "Studio demo"]',
  '[White "Giuoco player"]',
  '[Black "Studio learner"]',
  '[Result "*"]',
  '',
  '1. e4 {White takes a claim in the centre.} e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 d6 5. d4 exd4 6. cxd4 Bb4+ 7. Nc3 Nf6 *'
].join('\n')

export function demoGame(): GameDoc {
  const doc = treeFromPgn(DEMO_PGN)
  const branchParent = nodeIdAtPly(doc.tree, doc.rootId, 6)
  if (!branchParent) return doc

  const alternative = tryMove(doc.tree, branchParent, 'd3')
  if (!alternative) return doc

  const added = addChild(doc.tree, branchParent, alternative)
  const followUp = tryMove(added.tree, added.nodeId, 'Nf6')
  if (!followUp) return { ...doc, tree: added.tree }

  const second = addChild(added.tree, added.nodeId, followUp)
  return { ...doc, tree: second.tree }
}
