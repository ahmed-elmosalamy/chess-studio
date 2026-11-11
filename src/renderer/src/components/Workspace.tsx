import { BarChart3, LineChart } from 'lucide-react'
import { useMemo } from 'react'
import ChessBoard, { type Placement } from './board/ChessBoard.tsx'
import MoveList from './MoveList.tsx'
import EvalBar from './EvalBar.tsx'
import EvalGraph from './EvalGraph.tsx'
import { pvSteps } from '../chess/pv.ts'
import { barReading } from '../chess/evalBar.ts'
import type { Arrow } from '../hooks/useChessGame.ts'
import type { ChessGame } from '../hooks/useChessGame.ts'
import type useEngine from '../hooks/useEngine.ts'
import type useReview from '../hooks/useReview.ts'
import type { WorkspaceId } from './NavRail.tsx'
import { layoutFor } from '../ui/layout.ts'

type Props = {
  active: WorkspaceId
  game: ChessGame
  engine: ReturnType<typeof useEngine>
  review: ReturnType<typeof useReview>
  placement?: Placement
  showCoordinates: boolean
  extraArrow?: Arrow | null
}

export default function Workspace({ active, game, engine, review, placement, showCoordinates, extraArrow }: Props) {
  const { arrowLine, primary, status } = engine
  const layout = layoutFor(active)

  const pvArrows = useMemo<Arrow[]>(() => {
    if (!arrowLine) return []
    return pvSteps(game.fen, arrowLine.pv, 5).map((step) => ({
      from: step.arrow.from,
      to: step.arrow.to,
      color: step.arrow.capture ? 'red' : 'blue'
    }))
  }, [game.fen, arrowLine])

  const reviewArrow = useMemo<Arrow | null>(() => {
    const searched = review.lines.get(game.fen)
    const top = searched?.find((line) => line.multipv === 1) ?? searched?.[0]
    const move = top?.pv?.[0]
    if (!move || move.length < 4) return null
    return { from: move.slice(0, 2), to: move.slice(2, 4), color: 'green' }
  }, [game.fen, review.lines])

  const baseArrows = review.arrowsOn ? (reviewArrow ? [reviewArrow] : pvArrows) : []
  const boardArrows = extraArrow ? [...baseArrows, extraArrow] : baseArrows
  const reading = useMemo(
    () => barReading({ fen: game.fen, turn: game.turn, live: primary, reviewLines: review.lines }),
    [game.fen, game.turn, primary, review.lines]
  )
  const currentGrade = review.results[game.currentId]?.grade ?? null

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden p-4">
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto">
        {layout.evalBar && (
          <div className="w-[38px] shrink-0 overflow-hidden rounded-lg border border-line p-1">
            <EvalBar whiteChance={reading.whiteChance} label={reading.label} running={status.state === 'searching'} />
          </div>
        )}

        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="aspect-square h-full max-w-full shrink-0">
            <ChessBoard game={game} pvArrows={boardArrows} placement={placement} grade={currentGrade} showCoordinates={showCoordinates} />
          </div>
        </div>

        {layout.moveList && (
          <div className="flex w-[268px] shrink-0 flex-col gap-2 overflow-hidden rounded-lg border border-line bg-surface p-2">
            <div className="shrink-0 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Move list</div>
            <MoveList game={game} grades={review.results} />
          </div>
        )}
      </div>

      {layout.graph && (
        <div className="flex h-[104px] shrink-0 flex-col gap-2 overflow-hidden rounded-lg border border-line bg-surface p-2">
          <div className="flex shrink-0 items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <BarChart3 size={13} /> Evaluation graph
            <div className="flex-1" />
            {review.running ? (
              <span data-testid="graph-status" className="flex items-center gap-1 text-2xs font-normal normal-case text-accent">
                <LineChart size={11} /> reviewing {review.progress.done}/{review.progress.total}
              </span>
            ) : (
              <span data-testid="graph-status" className="text-2xs font-normal normal-case text-muted">
                {review.reviewed ? `${review.graph.filter((point) => point.grade).length} plies graded` : 'not reviewed yet'}
              </span>
            )}
          </div>
          <EvalGraph points={review.graph} currentPly={game.ply} running={review.running} progress={review.progress} onNavigate={game.navigate} />
        </div>
      )}
    </section>
  )
}
