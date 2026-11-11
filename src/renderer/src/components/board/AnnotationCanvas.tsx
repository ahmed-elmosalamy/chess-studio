import { useEffect, useRef } from 'react'
import { BOARD_UNITS, SQUARE_UNITS, squareToScreen, type SquareName } from '../../chess/squares.ts'
import { arrowGeometry } from '../../chess/arrows.ts'
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

function drawArrow(ctx: CanvasRenderingContext2D, arrow: Arrow, flipped: boolean, preview: boolean) {
  ctx.save()
  ctx.strokeStyle = arrowColors[arrow.color]
  ctx.fillStyle = arrowColors[arrow.color]
  ctx.globalAlpha = preview ? 0.55 : 0.92

  if (arrow.from === arrow.to) {
    // Lichess shows a ring while a square is held instead of a zero-length arrow.
    const { col, row } = squareToScreen(arrow.from, flipped)
    const cx = col * SQUARE_UNITS + SQUARE_UNITS / 2
    const cy = row * SQUARE_UNITS + SQUARE_UNITS / 2
    ctx.lineWidth = (SQUARE_UNITS * (preview ? 3 : 4)) / 64
    ctx.beginPath()
    ctx.arc(cx, cy, SQUARE_UNITS / 2 - ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
    return
  }

  const { shaft, head } = arrowGeometry(arrow.from, arrow.to, flipped, preview)
  ctx.lineWidth = shaft.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.beginPath()
  ctx.moveTo(shaft.from.x, shaft.from.y)
  ctx.lineTo(shaft.to.x, shaft.to.y)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(head[0].x, head[0].y)
  ctx.lineTo(head[1].x, head[1].y)
  ctx.lineTo(head[2].x, head[2].y)
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

  return (
    <canvas
      ref={canvasRef}
      data-testid="annotation-canvas"
      data-arrows={arrows.length}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  )
}
