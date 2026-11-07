export type FenParts = {
  placement: string
  turn: 'w' | 'b'
  castling: string
  ep: string
  halfmove: number
  fullmove: number
}

export type PlacementPiece = { type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k'; color: 'w' | 'b' }

const PIECE_LETTERS = 'pnbrqkPNBRQK'
const CASTLING_ORDER = 'KQkq'
const FILES = 'abcdefgh'
const SQUARE_PATTERN = /^[a-h][1-8]$/

export function validEpSquare(ep: string, turn: 'w' | 'b'): boolean {
  if (ep === '-') return true
  if (!SQUARE_PATTERN.test(ep)) return false
  return turn === 'w' ? ep[1] === '6' : ep[1] === '3'
}

export function epOptions(turn: 'w' | 'b'): string[] {
  const rank = turn === 'w' ? '6' : '3'
  return [...FILES].map((file) => `${file}${rank}`)
}

export function parseFen(fen: string): FenParts | null {
  const fields = fen.trim().split(/\s+/)
  if (fields.length !== 6) return null
  const [placement, turn, castling, ep, half, full] = fields

  const ranks = placement.split('/')
  if (ranks.length !== 8) return null
  for (const rank of ranks) {
    let width = 0
    for (const char of rank) {
      if (char >= '1' && char <= '8') width += Number(char)
      else if (PIECE_LETTERS.includes(char)) width += 1
      else return null
    }
    if (width !== 8) return null
  }

  if (turn !== 'w' && turn !== 'b') return null
  if (castling !== '-' && (!/^[KQkq]{1,4}$/.test(castling) || new Set(castling).size !== castling.length)) return null
  if (!validEpSquare(ep, turn)) return null
  if (!/^\d+$/.test(half) || !/^\d+$/.test(full) || Number(full) < 1) return null

  return { placement, turn, castling, ep, halfmove: Number(half), fullmove: Number(full) }
}

export function composeFen(parts: FenParts): string {
  return `${parts.placement} ${parts.turn} ${parts.castling} ${parts.ep} ${parts.halfmove} ${parts.fullmove}`
}

export function toggleCastling(castling: string, right: 'K' | 'Q' | 'k' | 'q'): string {
  const held = new Set(castling === '-' ? [] : [...castling])
  if (held.has(right)) held.delete(right)
  else held.add(right)
  const ordered = [...CASTLING_ORDER].filter((char) => held.has(char)).join('')
  return ordered || '-'
}

function pieceAt(placement: string, square: string): string | null {
  const rankIndex = 8 - Number(square[1])
  const fileIndex = FILES.indexOf(square[0])
  const rank = placement.split('/')[rankIndex]
  let cursor = 0
  for (const char of rank) {
    const width = char >= '1' && char <= '8' ? Number(char) : 1
    if (fileIndex < cursor + width) return char >= '1' && char <= '8' ? null : char
    cursor += width
  }
  return null
}

export function sanitizeCastling(placement: string, castling: string): string {
  if (castling === '-') return '-'
  const home = (square: string, letter: string): boolean => pieceAt(placement, square) === letter
  const allowed: Record<string, boolean> = {
    K: home('e1', 'K') && home('h1', 'R'),
    Q: home('e1', 'K') && home('a1', 'R'),
    k: home('e8', 'k') && home('h8', 'r'),
    q: home('e8', 'k') && home('a8', 'r')
  }
  return [...castling].filter((right) => allowed[right]).join('') || '-'
}

function encodePlacement(grid: Map<string, string>): string {
  const ranks: string[] = []
  for (let rank = 8; rank >= 1; rank -= 1) {
    let row = ''
    let empty = 0
    for (const file of FILES) {
      const piece = grid.get(`${file}${rank}`)
      if (piece) {
        if (empty) row += String(empty)
        empty = 0
        row += piece
      } else empty += 1
    }
    if (empty) row += String(empty)
    ranks.push(row)
  }
  return ranks.join('/')
}

export function placePiece(fen: string, square: string, piece: PlacementPiece | null): string | null {
  const parts = parseFen(fen)
  if (!parts || !SQUARE_PATTERN.test(square)) return null
  if (piece && piece.type === 'p' && (square[1] === '1' || square[1] === '8')) return null

  const grid = new Map<string, string>()
  for (let rank = 8; rank >= 1; rank -= 1) {
    for (const file of FILES) {
      const letter = pieceAt(parts.placement, `${file}${rank}`)
      if (letter) grid.set(`${file}${rank}`, letter)
    }
  }

  const occupant = grid.get(square)
  if (occupant === 'K' || occupant === 'k') {
    if (!piece || piece.type !== 'k' || (piece.color === 'w' ? 'K' : 'k') !== occupant) return null
  }
  if (piece && piece.type === 'k') {
    const letter = piece.color === 'w' ? 'K' : 'k'
    for (const [home, occupantLetter] of grid) {
      if (home !== square && occupantLetter === letter) return null
    }
  }

  if (piece) grid.set(square, piece.color === 'w' ? piece.type.toUpperCase() : piece.type)
  else grid.delete(square)

  const placement = encodePlacement(grid)
  return composeFen({ ...parts, placement, castling: sanitizeCastling(placement, parts.castling), ep: '-' })
}