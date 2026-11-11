import { useState } from 'react'
import type { GraphPoint } from '../chess/review.ts'

type Props = {
  points: GraphPoint[]
  currentPly: number
  running: boolean
  progress: { done: number; total: number }
  onNavigate: (nodeId: string) => void
}

const PAWN_RANGE = 5

export default function EvalGraph({ points, currentPly, running, progress, onNavigate }: Props) {
  const [mode, setMode] = useState<'chance' | 'pawns'>('chance')

  const norm = (point: GraphPoint): number =>
    mode === 'chance' ? 1 - point.whiteChance / 100 : Math.max(0, Math.min(1, 0.5 - point.whitePawns / (2 * PAWN_RANGE)))

  const xAt = (index: number): number => (points.length <= 1 ? 0 : (index / (points.length - 1)) * 100)

  const corners: [number, number][] = []
  points.forEach((point, index) => {
    const x = xAt(index)
    if (index > 0) corners.push([x, corners[corners.length - 1][1]])
    corners.push([x, norm(point) * 100])
  })

  const line = corners.map(([x, y]) => `${x * 10},${y.toFixed(2)}`).join(' ')
  const firstX = corners[0][0] * 10
  const currentIndex = points.findIndex((point) => point.ply === currentPly)

  const toggle = (next: 'chance' | 'pawns') =>
    `rounded px-1.5 py-0.5 text-2xs transition-colors ${mode === next ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'}`

  return (
    <div data-testid="eval-graph" className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-line">
      {points.length < 2 ? (
        <div className="flex h-full items-center justify-center px-3 text-center text-2xs text-muted">
          {running ? `Searching position ${progress.done} of ${progress.total}…` : 'Add moves, then run Game Review to plot every ply.'}
        </div>
      ) : (
        <svg data-testid="eval-svg" className="absolute inset-0 h-full w-full" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden>
          <polygon points={`${line} 1000,0 ${firstX},0`} fill="var(--square-dark)" opacity="0.55" />
          <polygon points={`${line} 1000,100 ${firstX},100`} fill="var(--square-light)" opacity="0.55" />
          <line x1="0" y1="50" x2="1000" y2="50" stroke="var(--line)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          <polyline points={line} fill="none" stroke="var(--text)" strokeOpacity="0.6" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      )}

      {points.length >= 2 && currentIndex >= 0 && (
        <div data-testid="graph-current" className="pointer-events-none absolute inset-y-0 w-px bg-accent" style={{ left: `${xAt(currentIndex)}%` }} />
      )}

      {points.length >= 2 &&
        points.map((point, index) =>
          index === 0 || !point.meta ? null : (
            <button
              key={point.nodeId}
              data-testid={`graph-point-${point.ply}`}
              type="button"
              onClick={() => onNavigate(point.nodeId)}
              title={`${Math.ceil(point.ply / 2)}${point.color === 'b' ? '…' : '.'} ${point.san ?? ''} · ${point.meta.label} · ${point.beforeLabel} → ${point.afterLabel}`}
              className="absolute h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-bg transition-transform hover:scale-150"
              style={{ left: `${xAt(index)}%`, top: `${norm(point) * 100}%`, background: point.meta.color }}
            />
          )
        )}

      <div className="pointer-events-none absolute inset-x-1 top-1 flex items-start justify-between gap-1">
        <div className="pointer-events-auto flex gap-0.5 rounded-md border border-line bg-surface/90 p-0.5">
          <button type="button" data-testid="graph-mode-chance" className={toggle('chance')} onClick={() => setMode('chance')}>
            Win chance
          </button>
          <button type="button" data-testid="graph-mode-pawns" className={toggle('pawns')} onClick={() => setMode('pawns')}>
            Centipawn
          </button>
        </div>
        <span data-testid="graph-axis" className="rounded bg-surface/90 px-1.5 py-0.5 font-mono text-2xs text-muted">
          {mode === 'chance' ? 'White / Black' : `±${PAWN_RANGE}p`}
        </span>
      </div>
    </div>
  )
}
