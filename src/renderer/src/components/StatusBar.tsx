import { workspaces, type WorkspaceId } from './NavRail.tsx'
import { formatScore } from '@shared/uci'
import type { ChessGame } from '../hooks/useChessGame.ts'
import type useEngine from '../hooks/useEngine.ts'
import type useReview from '../hooks/useReview.ts'

type Props = {
  active: WorkspaceId
  game: ChessGame
  engine: ReturnType<typeof useEngine>
  review: ReturnType<typeof useReview>
}

const slot = 'rounded-md border border-line bg-surface-2 px-2 py-0.5'

export default function StatusBar({ active, game, engine, review }: Props) {
  const label = workspaces.find((workspace) => workspace.id === active)?.label ?? ''
  const moveNumber = Math.ceil(game.ply / 2)
  const side = game.turn === 'w' ? 'White' : 'Black'
  const { status, primary } = engine
  const evalText = primary ? `${formatScore(primary.score, game.turn === 'w' ? 'white' : 'black')} d${primary.depth}` : 'no eval'
  const reviewed = review.reviewed
  const point = review.graph.find((entry) => entry.ply === game.ply)
  const gradeText = point?.meta ? `${point.san ?? ''} ${point.meta.label}` : 'no review yet'

  return (
    <footer className="flex h-8 shrink-0 items-center gap-2 border-t border-line bg-surface px-3 text-[11px] text-muted">
      <span className="font-semibold text-text">{label}</span>
      <span className="text-line">|</span>
      <span className={slot}>
        Ply {game.ply} · Move {moveNumber || '—'}
      </span>
      <span className={slot}>{`${side} to play`}</span>
      <span className={slot}>{game.positionStatus}</span>
      <div className="flex-1" />
      {reviewed && (
        <span data-testid="review-accuracy" className={`${slot} font-mono`}>
          W {review.summaries.white.accuracy} · B {review.summaries.black.accuracy}
        </span>
      )}
      {reviewed && (
        <span data-testid="review-grade" className={slot} style={point?.meta ? { color: point.meta.color } : undefined}>
          {gradeText}
        </span>
      )}
      <span data-testid="engine-state" className={`${slot} truncate max-w-[220px]`} title={status.error ?? status.name}>
        {status.name || 'Engine'} · {status.state}
      </span>
      <span data-testid="engine-eval" className={`${slot} font-mono text-text`}>
        {evalText}
      </span>
      <span data-testid="fen" className={`${slot} max-w-[420px] truncate font-mono`} title={game.fen}>
        {game.fen}
      </span>
    </footer>
  )
}
