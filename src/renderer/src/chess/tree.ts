import type { PieceColor, PieceType } from './squares.ts'

export type TreeNode = {
  id: string
  parentId: string | null
  childIds: string[]
  ply: number
  fen: string
  san: string | null
  from: string | null
  to: string | null
  piece: PieceType | null
  color: PieceColor | null
  promotion: PieceType | null
  flags: string
  comment: string
  nag: string | null
}

export type Tree = Record<string, TreeNode>

export type MoveCell = { kind: 'move'; nodeId: string; san: string; ply: number; nag: string | null; comment: string }
export type MoveRow = { depth: number; cells: MoveCell[] }

export type MoveInput = {
  san: string
  from: string
  to: string
  piece: PieceType
  color: PieceColor
  promotion?: PieceType | null
  flags: string
  fen: string
}

export function createTree(startFen: string): { tree: Tree; rootId: string } {
  const root: TreeNode = {
    id: crypto.randomUUID(),
    parentId: null,
    childIds: [],
    ply: 0,
    fen: startFen,
    san: null,
    from: null,
    to: null,
    piece: null,
    color: null,
    promotion: null,
    flags: '',
    comment: '',
    nag: null
  }
  return { tree: { [root.id]: root }, rootId: root.id }
}

export function addChild(tree: Tree, parentId: string, move: MoveInput): { tree: Tree; nodeId: string } {
  const parent = tree[parentId]
  const node: TreeNode = {
    id: crypto.randomUUID(),
    parentId,
    childIds: [],
    ply: parent.ply + 1,
    fen: move.fen,
    san: move.san,
    from: move.from,
    to: move.to,
    piece: move.piece,
    color: move.color,
    promotion: move.promotion ?? null,
    flags: move.flags,
    comment: '',
    nag: null
  }

  const next: Tree = { ...tree, [node.id]: node, [parentId]: { ...parent, childIds: [...parent.childIds, node.id] } }
  return { tree: next, nodeId: node.id }
}

export function patchNode(tree: Tree, nodeId: string, patch: Partial<Pick<TreeNode, 'comment' | 'nag'>>): Tree {
  return { ...tree, [nodeId]: { ...tree[nodeId], ...patch } }
}

export function pruneFrom(tree: Tree, nodeId: string): { tree: Tree; removedIds: string[] } {
  const removed: string[] = []
  const collect = (id: string): void => {
    removed.push(id)
    for (const childId of tree[id].childIds) collect(childId)
  }
  collect(nodeId)

  const next: Tree = { ...tree }
  const parentId = tree[nodeId].parentId
  if (parentId) {
    next[parentId] = { ...next[parentId], childIds: next[parentId].childIds.filter((id) => id !== nodeId) }
  }
  for (const id of removed) delete next[id]

  return { tree: next, removedIds: removed }
}

export function pathFromRoot(tree: Tree, nodeId: string): TreeNode[] {
  const path: TreeNode[] = []
  let current: string | null = nodeId
  while (current && tree[current].parentId) {
    path.unshift(tree[current])
    current = tree[current].parentId
  }
  return path
}

export function lastDescendant(tree: Tree, nodeId: string): string {
  let current = nodeId
  while (tree[current].childIds.length > 0) current = tree[current].childIds[0]
  return current
}

export function siblingDirection(tree: Tree, nodeId: string, direction: -1 | 1): string | null {
  const node = tree[nodeId]
  if (!node.parentId) return null
  const siblings = tree[node.parentId].childIds
  const index = siblings.indexOf(node.id)
  return siblings[index + direction] ?? null
}

export function variationRows(tree: Tree, rootId: string): MoveRow[] {
  const rows: MoveRow[] = []

  const collectLine = (startId: string, depth: number): void => {
    const cells: MoveCell[] = []
    const branchNodes: TreeNode[] = []

    let current: string | undefined = startId
    while (current) {
      const node: TreeNode = tree[current]
      cells.push({ kind: 'move', nodeId: node.id, san: node.san as string, ply: node.ply, nag: node.nag, comment: node.comment })
      if (node.childIds.length > 1) branchNodes.push(node)
      current = node.childIds[0]
    }

    rows.push({ depth, cells })
    for (const node of branchNodes) {
      for (const childId of node.childIds.slice(1)) collectLine(childId, depth + 1)
    }
  }

  const root = tree[rootId]
  if (root.childIds.length > 0) collectLine(root.childIds[0], 0)
  return rows
}

export function nodeStatus(tree: Tree, nodeId: string): { check: boolean; mate: boolean } {
  const node = tree[nodeId]
  const san = node.san ?? ''
  return { check: san.includes('+'), mate: san.includes('#') }
}
