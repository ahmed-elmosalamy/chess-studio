export type PieceColor = 'w' | 'b'
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
export type SquareName = string

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8] as const

export const BOARD_UNITS = 800
export const SQUARE_UNITS = BOARD_UNITS / 8

export function squareToXY(square: SquareName): { x: number; y: number } {
  return { x: FILES.indexOf(square[0] as (typeof FILES)[number]), y: Number(square[1]) - 1 }
}

export function xyToSquare(x: number, y: number): SquareName | null {
  if (x < 0 || x > 7 || y < 0 || y > 7) return null
  return `${FILES[x]}${y + 1}`
}

export function squareToScreen(square: SquareName, flipped: boolean): { col: number; row: number } {
  const { x, y } = squareToXY(square)
  return { col: flipped ? 7 - x : x, row: flipped ? y : 7 - y }
}

export function screenToSquare(col: number, row: number, flipped: boolean): SquareName | null {
  const x = flipped ? 7 - col : col
  const y = flipped ? row : 7 - row
  return xyToSquare(x, y)
}

export function isLightSquare(square: SquareName): boolean {
  const { x, y } = squareToXY(square)
  return (x + y) % 2 === 1
}

export function squareCenterUnits(col: number, row: number): { cx: number; cy: number } {
  return { cx: col * SQUARE_UNITS + SQUARE_UNITS / 2, cy: row * SQUARE_UNITS + SQUARE_UNITS / 2 }
}

export function allSquares(): SquareName[] {
  const squares: SquareName[] = []
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) squares.push(xyToSquare(x, y) as string)
  return squares
}
