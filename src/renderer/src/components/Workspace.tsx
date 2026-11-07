import { BarChart3, LineChart } from 'lucide-react'
import { useMemo } from 'react'
import ChessBoard, { type Placement } from './board/ChessBoard.tsx'
import MoveList from './MoveList.tsx'
import EvalBar from './EvalBar.tsx'
import EvalGraph from './EvalGraph.tsx'
import { formatScore } from '@shared/uci'
import { pvSteps } from '../chess/pv.ts'
import type { Arrow } from '../hooks/useChessGame.ts'
import type { ChessGame } from '../hooks/useChessGame.ts'
import type useEngine from '../hooks/useEngine.ts'
import type useReview from '../hooks/useReview.ts'

type Props = {
  game: ChessGame
  engine: ReturnType<typeof useEngine>
  review: ReturnType<typeof useReview>
  placement?: Placement
}

export default function Workspace({ game, engine, review, placement }: Props) {
  const { arrowLine, primary, status, whiteChance } = engine

  const pvArrows = useMemo<Arrow[]>(() => {
    if (!arrowLine) return []
    return pvSteps(game.fen, arrowLine.pv, 5).map((step) => ({
      from: step.arrow.from,
      to: step.arrow.to,
      color: step.arrow.capture ? 'red' : 'blue'
    }))
  }, [game.fen, arrowLine])

  const scoreLabel = primary ? formatScore(primary.score, game.turn === 'w' ? 'white' : 'black') : ''

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden p-4">
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto">
        <div className="w-[38px] shrink-0 overflow-hidden rounded-lg border border-line p-1">
          <EvalBar whiteChance={whiteChance} label={scoreLabel} running={status.state === 'searching'} />
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="aspect-square h-full max-w-full shrink-0">
            <ChessBoard game={game} pvArrows={pvArrows} placement={placement} />
          </div>
        </div>

        <div className="flex w-[268px] shrink-0 flex-col gap-2 overflow-hidden rounded-lg border border-line bg-surface p-2">
          <div className="shrink-0 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Move list</div>
          <MoveList game={game} grades={review.results} />
        </div>
      </div>

      <div className="flex h-[148px] shrink-0 flex-col gap-2 overflow-hidden rounded-lg border border-line bg-surface p-2">
        <div className="flex shrink-0 items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <BarChart3 size={13} /> Evaluation graph
          <div className="flex-1" />
          {review.running ? (
            <span data-testid="graph-status" className="flex items-center gap-1 text-[10px] font-normal normal-case text-accent">
              <LineChart size={11} /> reviewing {review.progress.done}/{review.progress.total}
            </span>
          ) : (
            <span data-testid="graph-status" className="text-[10px] font-normal normal-case text-muted">
              {review.reviewed ? `${review.graph.filter((point) => point.grade).length} plies graded` : 'not reviewed yet'}
            </span>
          )}
        </div>
        <EvalGraph
          points={review.graph}
          currentPly={game.ply}
          running={review.running}
          progress={review.progress}
          onNavigate={game.navigate}
        />
      </div>
    </section>
  )
}
