import { useMemo, useState } from 'react'
import { ArrowUpRight, Crosshair, FileDown, MessageSquare, Play, Sparkles, Square } from 'lucide-react'
import { gradeMeta, reviewOrder } from '@shared/review'
import GradeBadge from './GradeBadge.tsx'
import ReportModal from './ReportModal.tsx'
import { buildReportModel } from '../report/reportCard.ts'
import { buildPuzzles } from '../chess/trainer.ts'
import type useReview from '../hooks/useReview.ts'
import type { ChessGame } from '../hooks/useChessGame.ts'
import type { Trainer } from '../hooks/useTrainer.ts'
import type { EngineSource } from '@shared/engine'
import { reviewStage } from '../ui/emptyStates.ts'

type Review = ReturnType<typeof useReview>

type Props = {
  review: Review
  game: ChessGame
  trainer: Trainer
  source: EngineSource
  currentId: string
  onNavigate: (nodeId: string) => void
  playActive?: boolean
  onOpenLibrary: () => void
  onImportPgn: () => void
  onGoPlay: () => void
}

const chip = 'flex items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-2xs'

function Side({ label, summary, accent }: { label: string; summary: Review['summaries']['white']; accent: string }) {
  const counts = reviewOrder.filter((grade) => summary.counts[grade] > 0)

  return (
    <div className="flex flex-col gap-1 rounded-md border border-line bg-surface-2 p-2">
      <div className="flex items-baseline justify-between">
        <span className="section-label">{label}</span>
        <span className="stat-value text-lg" style={{ color: accent }} data-testid={`accuracy-${label.toLowerCase()}`}>
          {summary.accuracy}
        </span>
      </div>
      <div className="flex items-center justify-between text-2xs text-muted">
        <span>CAPS accuracy · {summary.moves} moves</span>
        <span data-testid={`acpl-${label.toLowerCase()}`} className="font-mono">
          ACPL {summary.acpl === null ? '—' : summary.acpl.toFixed(1)}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {counts.map((grade) => (
          <span key={grade} className={chip} title={gradeMeta[grade].label}>
            <GradeBadge grade={grade} />
            {summary.counts[grade]}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function ReviewPanel({ review, game, trainer, source, currentId, onNavigate, playActive = false, onOpenLibrary, onImportPgn, onGoPlay }: Props) {
  const { running, progress, workload, summaries, keyMoments, reviewed, error, depth, scope } = review
  const share = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)
  const [reportOpen, setReportOpen] = useState(false)
  const stage = reviewStage({ ply: game.ply, running, reviewed, playing: playActive })

  const trainerDrafts = useMemo(() => {
    if (!reviewed) return []
    return buildPuzzles({
      tree: game.tree,
      rootId: game.rootId,
      results: review.results,
      lines: review.lines,
      gameLabel: `${game.headers['White'] ?? 'White'} vs ${game.headers['Black'] ?? 'Black'}`
    })
  }, [game.headers, game.rootId, game.tree, review.lines, review.results, reviewed])

  const reportModel = useMemo(() => {
    if (!reportOpen) return null
    return buildReportModel({
      headers: game.headers,
      tree: game.tree,
      rootId: game.rootId,
      results: review.results,
      summaries: review.summaries,
      keyMoments: review.keyMoments,
      graph: review.graph
    })
  }, [game.headers, game.rootId, game.tree, reportOpen, review.graph, review.keyMoments, review.results, review.summaries])

  return (
    <div data-testid="review-panel" className="flex shrink-0 flex-col gap-3">
      {reportOpen && reportModel && <ReportModal model={reportModel} onClose={() => setReportOpen(false)} />}
      {stage === 'playing' && (
        <div data-testid="review-empty" className="flex flex-col gap-2 card p-3">
          <div className="text-sm font-semibold">Game in progress</div>
          <div className="text-2xs leading-relaxed text-muted">The clock is running, so review is paused. Finish the game or start a new one to analyse it.</div>
          <button data-testid="review-empty-goplay" type="button" onClick={onGoPlay} className="btn no-drag self-start">
            Go to Play
          </button>
        </div>
      )}
      {stage === 'empty-game' && (
        <div data-testid="review-empty" className="flex flex-col gap-2 card p-3">
          <div className="text-sm font-semibold">Nothing to review yet</div>
          <div className="text-2xs leading-relaxed text-muted">Open a saved game, load the demo, or import a PGN. Review grades every move once a game is on the board.</div>
          <div className="flex flex-wrap gap-1.5">
            <button data-testid="review-empty-library" type="button" onClick={onOpenLibrary} className="btn btn-primary no-drag">
              Open library
            </button>
            <button
              data-testid="review-empty-demo"
              type="button"
              onClick={() => {
                game.loadDemo()
                game.step('last')
              }}
              className="btn no-drag"
            >
              Load demo game
            </button>
            <button data-testid="review-empty-import" type="button" onClick={onImportPgn} className="btn btn-ghost no-drag">
              Import PGN
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 card p-2">
        <Sparkles size={14} className="shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">Game review</div>
          <div data-testid="review-workload" className="text-2xs text-muted">
            {workload.moves} moves · {workload.positions} positions · depth {depth}
          </div>
        </div>
        <button
          data-testid={running ? 'review-stop' : 'review-run'}
          type="button"
          onClick={() => (running ? review.stop() : void review.start())}
          disabled={playActive && !running}
          title={playActive && !running ? 'Stop the game first' : undefined}
          className={`no-drag btn shrink-0 ${running ? 'btn-danger' : 'btn-primary'}`}
        >
          {running ? <Square size={11} /> : <Play size={11} />}
          {running ? 'Stop' : reviewed ? 'Re-run' : 'Review'}
        </button>
      </div>

      <div className="flex flex-col gap-2 card p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex gap-0.5 rounded-md border border-line bg-surface-2 p-0.5">
            {(['line', 'tree'] as const).map((option) => (
              <button
                key={option}
                data-testid={`review-scope-${option}`}
                type="button"
                onClick={() => review.setScope(option)}
                className={`no-drag rounded px-2 py-0.5 text-2xs transition-colors ${
                  scope === option ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'
                }`}
              >
                {option === 'line' ? 'Main line' : 'All variations'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-2xs text-muted">
            Depth
            <select
              data-testid="review-depth"
              className="no-drag rounded-md border border-line bg-surface-2 px-1 py-0.5 font-mono text-2xs outline-none focus:border-accent"
              value={depth}
              onChange={(event) => review.setDepth(Number(event.target.value))}
            >
              {[8, 10, 12, 14, 16, 18, 20].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <button
            data-testid="review-arrows"
            type="button"
            aria-pressed={review.arrowsOn}
            aria-label="Best-move arrow"
            onClick={review.toggleArrows}
            title={review.arrowsOn ? 'Hide the best-move arrow' : 'Show the best-move arrow on every position'}
            className={`no-drag rounded-md border p-1 transition-colors ${
              review.arrowsOn ? 'border-accent bg-accent-tint text-accent' : 'border-line bg-surface-2 text-muted hover:text-text'
            }`}
          >
            <ArrowUpRight size={12} />
          </button>
          <button
            data-testid="review-explain"
            type="button"
            aria-pressed={review.explainOn}
            onClick={review.toggleExplain}
            title="Show a plain-English reason under every blunder and brilliant"
            className={`no-drag flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs transition-colors ${
              review.explainOn ? 'border-accent bg-accent-tint text-accent' : 'border-line bg-surface-2 text-muted hover:text-text'
            }`}
          >
            <MessageSquare size={10} /> Explain
          </button>
          <div className="flex-1" />
          {reviewed && !running && (
            <button
              data-testid="review-export"
              type="button"
              onClick={() => setReportOpen(true)}
              title="Open a shareable report card for this review"
              className="no-drag flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <FileDown size={11} /> Export report
            </button>
          )}
          {reviewed && !running && (
            <button
              data-testid="review-clear"
              type="button"
              onClick={review.clear}
              title="Clear this review"
              className="no-drag rounded-md border border-line bg-surface-2 px-2 py-1 text-[11px] text-muted transition-colors hover:border-danger hover:text-danger"
            >
              Clear
            </button>
          )}
        </div>

        {(running || progress.total > 0) && (
          <div className="flex flex-col gap-1">
            <div data-testid="review-progress" className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${share}%` }} />
            </div>
            <div className="flex justify-between text-2xs text-muted">
              <span>
                {running ? `Searching ${progress.done} of ${progress.total}` : `${progress.done} positions searched`}
              </span>
              <span>{reviewed ? `${Object.keys(review.results).length} moves graded` : 'nothing graded yet'}</span>
            </div>
          </div>
        )}

        {source === 'wasm' && (
          <div className="text-2xs leading-snug text-muted">
            The bundled WASM engine searches one thread, so depth 12 is the default. Point the engine at a native binary in the Engine
            workspace for full-strength depth 16 and above.
          </div>
        )}

        {error && <div className="text-2xs text-danger">{error}</div>}
      </div>

      <div className="flex flex-col gap-2 card p-2">
        <div className="section-label">Accuracy</div>
        <Side label="White" summary={summaries.white} accent="var(--grade-great)" />
        <Side label="Black" summary={summaries.black} accent="var(--grade-brilliant)" />
      </div>

      <div className="flex shrink-0 flex-col gap-1 card p-2">
        <div className="flex items-center justify-between section-label">
          <span>Key moments</span>
          <span className="font-mono normal-case text-text">{keyMoments.length}</span>
        </div>

        {reviewed && trainerDrafts.length > 0 && (
          <div className="flex flex-col gap-1">
            <button
              data-testid="review-save-mistakes"
              type="button"
              disabled={trainer.busy}
              onClick={() => void trainer.saveMistakes(trainerDrafts)}
              title="Turn every blunder, mistake and missed win from this review into a trainer puzzle"
              className="no-drag flex items-center justify-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-2xs text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
            >
              <Crosshair size={10} /> Save mistakes ({trainerDrafts.length})
            </button>
            {trainer.notice && (
              <div data-testid="review-save-notice" className="text-2xs text-accent">
                {trainer.notice}
              </div>
            )}
            {trainer.error && (
              <div data-testid="review-save-error" className="text-2xs text-danger">
                {trainer.error}
              </div>
            )}
          </div>
        )}

        <div className="flex max-h-[240px] min-h-[96px] flex-col gap-1 overflow-y-auto pr-0.5">
          {keyMoments.length === 0 && (
            <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-line px-3 py-5 text-center text-[11px] text-muted">
              {running ? 'Moments appear as the review walks the game.' : 'Run a review to list brilliants, mistakes and missed wins.'}
            </div>
          )}

          {keyMoments.map((moment) => {
            const meta = gradeMeta[moment.grade]
            const isCurrent = moment.nodeId === currentId
            const explanation = review.explanations[moment.nodeId]
            const ai = review.aiText[moment.nodeId]
            const busy = review.aiBusy[moment.nodeId] === true
            const aiFailure = review.aiError[moment.nodeId]
            return (
              <div key={moment.nodeId} className="flex flex-col gap-1">
                <button
                  data-testid={`key-moment-${moment.ply}`}
                  type="button"
                  onClick={() => onNavigate(moment.nodeId)}
                  className={`no-drag flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
                    isCurrent ? 'border-accent bg-accent-tint' : 'border-line bg-surface-2 hover:border-accent'
                  }`}
                >
                  <span className="w-6 shrink-0 text-right font-mono text-2xs text-muted">{Math.ceil(moment.ply / 2)}</span>
                  <span className="flex w-6 shrink-0 justify-center font-mono text-[12px] font-semibold" style={{ color: meta.color }}>
                    {meta.glyph}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono">
                    {moment.san}
                    <span className="ml-1 text-muted">{meta.label}</span>
                  </span>
                  <span className="shrink-0 font-mono text-2xs text-muted">
                    {moment.beforeLabel} → {moment.afterLabel}
                  </span>
                </button>

                {review.explainOn && explanation && (
                  <div
                    data-testid={`blunder-explain-${moment.ply}`}
                    className="rounded-md border border-line bg-surface-2 px-2 py-1.5 text-2xs leading-snug"
                  >
                    {ai ? (
                      <div data-testid={`blunder-ai-${moment.ply}`} className="text-accent">
                        {ai}
                      </div>
                    ) : (
                      <>
                        <div className="text-text">{explanation}</div>
                        <button
                          data-testid={`blunder-ai-request-${moment.ply}`}
                          type="button"
                          disabled={busy}
                          onClick={() => void review.explainWithAi(moment.nodeId)}
                          className="no-drag mt-1 flex items-center gap-1 rounded border border-line bg-surface px-1.5 py-0.5 text-2xs text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
                        >
                          <Sparkles size={10} /> {busy ? 'Asking AI…' : 'Explain with AI'}
                        </button>
                      </>
                    )}
                    {aiFailure && !ai && (
                      <div data-testid={`blunder-ai-error-${moment.ply}`} className="mt-1 text-danger">
                        {aiFailure}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <details data-testid="grade-legend" className="flex flex-col gap-1 card p-2 text-2xs leading-snug text-muted">
        <summary className="cursor-pointer select-none text-2xs font-semibold uppercase tracking-wide">How moves are graded</summary>
        <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5">
          {reviewOrder.map((grade) => (
            <span key={grade} className="flex items-center gap-1">
              <GradeBadge grade={grade} />
              {gradeMeta[grade].label}
            </span>
          ))}
        </div>
        <div>
          Moves that follow a bundled opening line are marked Book and are left out of accuracy and ACPL. Each remaining move is
          scored against the engine&apos;s best line and the opponent&apos;s best reply. Loss up to 0.25 pawns is excellent, up to 0.6
          good, up to 1.5 an inaccuracy, up to 4 a mistake, more a blunder. The top engine choice is best, or great when it is the only
          move that holds the evaluation; a sacrifice that keeps the evaluation is brilliant; giving up a forced mate, a won position or
          an opponent&apos;s blunder is a missed win. CAPS accuracy is the share of win chance the move kept, ACPL the mean centipawn
          loss over moves without a mate on the board.
        </div>
      </details>
    </div>
  )
}
