import { SQUARE_UNITS, squareCenterUnits, squareToScreen, type SquareName } from './squares.ts'

export type Point = { x: number; y: number }
export type ArrowGeometry = { shaft: { from: Point; to: Point; width: number }; head: [Point, Point, Point] }

// Lichess proportions: 10px shaft on 64px squares, a head four shafts wide, tip on the square center.
const SHAFT_RATIO = 10 / 64
const MARGIN_RATIO = 10 / 64
const HEAD_BASE = 2.05
const HEAD_TIP = 0.95
const HEAD_HALF = 2
const PREVIEW_SCALE = 0.85

export function arrowGeometry(from: SquareName, to: SquareName, flipped: boolean, preview: boolean): ArrowGeometry {
  const start = squareCenter(from, flipped)
  const end = squareCenter(to, flipped)
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  const width = SQUARE_UNITS * SHAFT_RATIO * (preview ? PREVIEW_SCALE : 1)
  const margin = SQUARE_UNITS * MARGIN_RATIO

  const lineEnd = { x: end.x - ux * margin, y: end.y - uy * margin }
  const base = { x: lineEnd.x - ux * HEAD_BASE * width, y: lineEnd.y - uy * HEAD_BASE * width }
  const tip = { x: lineEnd.x + ux * HEAD_TIP * width, y: lineEnd.y + uy * HEAD_TIP * width }
  const halfWidth = HEAD_HALF * width

  return {
    shaft: { from: start, to: lineEnd, width },
    head: [
      tip,
      { x: base.x - uy * halfWidth, y: base.y + ux * halfWidth },
      { x: base.x + uy * halfWidth, y: base.y - ux * halfWidth }
    ]
  }
}

function squareCenter(square: SquareName, flipped: boolean): Point {
  const { col, row } = squareToScreen(square, flipped)
  const { cx, cy } = squareCenterUnits(col, row)
  return { x: cx, y: cy }
}