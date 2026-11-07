export type TablebaseCategory = 'win' | 'loss' | 'draw' | 'cursed-win' | 'blessed-loss' | 'maybe-win' | 'maybe-loss'

export type TablebaseMove = {
  uci: string
  san: string
  category: TablebaseCategory
  dtz: number | null
  dtm: number | null
  checkmate: boolean
  stalemate: boolean
  zeroing: boolean
  conversion: boolean
}

export type TablebaseResult = {
  category: TablebaseCategory
  dtz: number | null
  dtm: number | null
  checkmate: boolean
  stalemate: boolean
  moves: TablebaseMove[]
}

export type TablebaseQuery = { fen: string }

export const TablebaseChannel = {
  Query: 'tablebase:query'
} as const

export const TABLEBASE_MAX_PIECES = 7

export function pieceCount(fen: string): number {
  const placement = fen.split(' ')[0] ?? ''
  let count = 0
  for (const char of placement) if ('pnbrqkPNBRQK'.includes(char)) count += 1
  return count
}

const LABELS: Record<TablebaseCategory, string> = {
  win: 'Win',
  loss: 'Loss',
  draw: 'Draw',
  'cursed-win': 'Cursed win',
  'blessed-loss': 'Blessed loss',
  'maybe-win': 'Maybe win',
  'maybe-loss': 'Maybe loss'
}

export function categoryLabel(category: TablebaseCategory): string {
  return LABELS[category] ?? category
}

const INVERT: Record<TablebaseCategory, TablebaseCategory> = {
  win: 'loss',
  loss: 'win',
  draw: 'draw',
  'cursed-win': 'blessed-loss',
  'blessed-loss': 'cursed-win',
  'maybe-win': 'maybe-loss',
  'maybe-loss': 'maybe-win'
}

export function invertCategory(category: TablebaseCategory): TablebaseCategory {
  return INVERT[category] ?? category
}

const RANK: Record<TablebaseCategory, number> = {
  win: 0,
  'maybe-win': 1,
  'cursed-win': 2,
  draw: 3,
  'blessed-loss': 4,
  'maybe-loss': 5,
  loss: 6
}

export function sortedMoves(result: TablebaseResult): TablebaseMove[] {
  const distance = (move: TablebaseMove): number => (move.dtm === null ? Infinity : Math.abs(move.dtm))
  return [...result.moves].sort((a, b) => {
    const rankA = RANK[invertCategory(a.category)] ?? 9
    const rankB = RANK[invertCategory(b.category)] ?? 9
    if (rankA !== rankB) return rankA - rankB
    if (a.checkmate !== b.checkmate) return a.checkmate ? -1 : 1
    return distance(a) - distance(b)
  })
}