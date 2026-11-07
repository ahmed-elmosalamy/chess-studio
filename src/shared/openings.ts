export type ExplorerOpening = { eco: string; name: string }

export type ExplorerCounts = { white: number; draws: number; black: number }

export type ExplorerPlayer = { name: string; rating: number }

export type ExplorerGame = {
  id: string
  winner: 'white' | 'black' | null
  white: ExplorerPlayer
  black: ExplorerPlayer
  year: number
  month: string
}

export type ExplorerMove = ExplorerCounts & {
  uci: string
  san: string
  averageRating: number
  game: ExplorerGame | null
  opening: ExplorerOpening | null
}

export type ExplorerResult = ExplorerCounts & {
  opening: ExplorerOpening | null
  moves: ExplorerMove[]
  topGames: (ExplorerGame & { uci: string })[]
}

export type OpeningsQuery = { fen: string; play: string[]; moves?: number }

export type TokenState = { hasToken: boolean }

export const OpeningsChannel = {
  Query: 'openings:query',
  TokenSet: 'openings:token-set',
  TokenClear: 'openings:token-clear',
  TokenState: 'openings:token-state'
} as const

export function uciToMove(uci: string): { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' } {
  const base = { from: uci.slice(0, 2), to: uci.slice(2, 4) }
  const promotion = uci[4] as 'q' | 'r' | 'b' | 'n' | undefined
  return promotion ? { ...base, promotion } : base
}

export function totalGames(counts: ExplorerCounts): number {
  return counts.white + counts.draws + counts.black
}

export function percentages(counts: ExplorerCounts): ExplorerCounts {
  const total = totalGames(counts)
  if (total === 0) return { white: 0, draws: 0, black: 0 }
  const share = (value: number): number => Math.round((value / total) * 1000) / 10
  return { white: share(counts.white), draws: share(counts.draws), black: share(counts.black) }
}