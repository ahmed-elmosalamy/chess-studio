import { useEffect, useRef } from 'react'
import { BOARD_UNITS, SQUARE_UNITS, squareToScreen, type SquareName } from '../../chess/squares.ts'
import type { Arrow, ArrowColor } from '../../hooks/useChessGame.ts'

export const arrowColors: Record<ArrowColor, string> = {
  green: '#4a9e5c',
  red: '#c94f4f',
  blue: '#4a7fc9',
  orange: '#d98b34'
}

export function arrowColorFor(modifiers: { shift: boolean; alt: boolean; ctrl: boolean }): ArrowColor {
  if (modifiers.shift) return 'red'
  if (modifiers.alt) return 'blue'
  if (modifiers.ctrl) return 'orange'
  return 'green'
}

type Props = {
  arrows: Arrow[]
  preview: Arrow | null
  highlighted: SquareName[]
  flipped: boolean
  size: number
}

function center(square: SquareName, flipped: boolean) {
  const { col, row } = squareToScreen(square, flipped)
  return { cx: col * SQUARE_UNITS + SQUARE_UNITS / 2, cy: row * SQUARE_UNITS + SQUARE_UNITS / 2 }
}

function drawArrow(ctx: CanvasRenderingContext2D, arrow: Arrow, flipped: boolean, faded: boolean) {
  const start = center(arrow.from, flipped)
  const end = center(arrow.to, flipped)
  const angle = Math.atan2(end.cy - start.cy, end.cx - start.cx)
  const shorten = SQUARE_UNITS * 0.22
  const headLength = SQUARE_UNITS * 0.42

  const x1 = start.cx + Math.cos(angle) * shorten
  const y1 = start.cy + Math.sin(angle) * shorten
  const x2 = end.cx - Math.cos(angle) * (shorten + headLength * 0.55)
  const y2 = end.cy - Math.sin(angle) * (shorten + headLength * 0.55)

  ctx.save()
  ctx.globalAlpha = faded ? 0.55 : 0.92
  ctx.strokeStyle = arrowColors[arrow.color]
  ctx.fillStyle = arrowColors[arrow.color]
  ctx.lineWidth = SQUARE_UNITS * 0.16
  ctx.lineCap = 'butt'

  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()

  const tipX = end.cx - Math.cos(angle) * shorten
  const tipY = end.cy - Math.sin(angle) * shorten
  ctx.beginPath()
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(tipX - Math.cos(angle - 0.4) * headLength, tipY - Math.sin(angle - 0.4) * headLength)
  ctx.lineTo(tipX - Math.cos(angle + 0.4) * headLength, tipY - Math.sin(angle + 0.4) * headLength)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

export default function AnnotationCanvas({ arrows, preview, highlighted, flipped, size }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scale = (size * dpr) / BOARD_UNITS
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.clearRect(0, 0, BOARD_UNITS, BOARD_UNITS)

    for (const square of highlighted) {
      const { col, row } = squareToScreen(square, flipped)
      ctx.fillStyle = 'rgba(217, 139, 52, 0.45)'
      ctx.fillRect(col * SQUARE_UNITS, row * SQUARE_UNITS, SQUARE_UNITS, SQUARE_UNITS)
    }

    for (const arrow of preview ? [...arrows, preview] : arrows) {
      drawArrow(ctx, arrow, flipped, arrow === preview)
    }
  }, [arrows, preview, highlighted, flipped, size])

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
}
