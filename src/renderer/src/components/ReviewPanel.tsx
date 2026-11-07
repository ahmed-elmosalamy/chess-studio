import { Play, Sparkles, Square } from 'lucide-react'
import { gradeMeta, reviewOrder } from '@shared/review'
import type useReview from '../hooks/useReview.ts'
import type { EngineSource } from '@shared/engine'

type Review = ReturnType<typeof useReview>

type Props = {
  review: Review
  source: EngineSource
  currentId: string
  onNavigate: (nodeId: string) => void
}

const chip = 'flex items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]'

function Side({ label, summary, accent }: { label: string; summary: Review['summaries']['white']; accent: string }) {
  const counts = reviewOrder.filter((grade) => summary.counts[grade] > 0)

  return (
    <div className="flex flex-col gap-1 rounded-md border border-line bg-surface-2 p-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</span>
        <span className="font-mono text-[16px] font-semibold" style={{ color: accent }}>
          {summary.accuracy}
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>CAPS accuracy · {summary.moves} moves</span>
        <span data-testid={`acpl-${label.toLowerCase()}`} className="font-mono">
          ACPL {summary.acpl === null ? '—' : summary.acpl.toFixed(1)}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {counts.map((grade) => (
          <span key={grade} className={chip} title={gradeMeta[grade].label}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: gradeMeta[grade].color }} />
            {summary.counts[grade]}
            <span className="text-muted">{gradeMeta[grade].glyph}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export default function ReviewPanel({ review, source, currentId, onNavigate }: Props) {
  const { running, progress, workload, summaries, keyMoments, reviewed, error, depth, scope } = review
  const share = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)

  return (
    <div data-testid="review-panel" className="flex shrink-0 flex-col gap-3">
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface p-2">
        <Sparkles size={14} className="shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold">Game review</div>
          <div data-testid="review-workload" className="text-[10px] text-muted">
            {workload.moves} moves · {workload.positions} positions · depth {depth}
          </div>
        </div>
        <button
          data-testid={running ? 'review-stop' : 'review-run'}
          type="button"
          onClick={() => (running ? review.stop() : void review.start())}
          className={`no-drag flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
            running ? 'border-danger bg-surface-2 text-danger' : 'border-accent bg-accent text-bg'
          }`}
        >
          {running ? <Square size={11} /> : <Play size={11} />}
          {running ? 'Stop' : reviewed ? 'Re-run' : 'Review'}
        </button>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 rounded-md border border-line bg-surface-2 p-0.5">
            {(['line', 'tree'] as const).map((option) => (
              <button
                key={option}
                data-testid={`review-scope-${option}`}
                type="button"
                onClick={() => review.setScope(option)}
                className={`no-drag rounded px-2 py-0.5 text-[10px] transition-colors ${
                  scope === option ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'
                }`}
              >
                {option === 'line' ? 'Main line' : 'All variations'}
              </button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-1 text-[10px] text-muted">
            Depth
            <select
              data-testid="review-depth"
              className="no-drag rounded-md border border-line bg-surface-2 px-1 py-0.5 font-mono text-[10px] outline-none focus:border-accent"
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
        </div>

        {(running || progress.total > 0) && (
          <div className="flex flex-col gap-1">
            <div data-testid="review-progress" className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${share}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-muted">
              <span>
                {running ? `Searching ${progress.done} of ${progress.total}` : `${progress.done} positions searched`}
              </span>
              <span>{reviewed ? `${Object.keys(review.results).length} moves graded` : 'nothing graded yet'}</span>
            </div>
          </div>
        )}

        {source === 'wasm' && (
          <div className="text-[10px] leading-snug text-muted">
            The bundled WASM engine searches one thread, so depth 12 is the default. Point the engine at a native binary in the Engine
            workspace for full-strength depth 16 and above.
          </div>
        )}

        {error && <div className="text-[10px] text-danger">{error}</div>}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Accuracy</div>
        <Side label="White" summary={summaries.white} accent="var(--grade-great)" />
        <Side label="Black" summary={summaries.black} accent="var(--grade-brilliant)" />
      </div>

      <div className="flex shrink-0 flex-col gap-1 rounded-lg border border-line bg-surface p-2">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-muted">
          <span>Key moments</span>
          <span className="font-mono normal-case text-text">{keyMoments.length}</span>
        </div>

        <div className="flex max-h-[240px] min-h-[96px] flex-col gap-1 overflow-y-auto pr-0.5">
          {keyMoments.length === 0 && (
            <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-line px-3 py-5 text-center text-[11px] text-muted">
              {running ? 'Moments appear as the review walks the game.' : 'Run a review to list brilliants, mistakes and missed wins.'}
            </div>
          )}

          {keyMoments.map((moment) => {
            const meta = gradeMeta[moment.grade]
            const isCurrent = moment.nodeId === currentId
            return (
              <button
                key={moment.nodeId}
                data-testid={`key-moment-${moment.ply}`}
                type="button"
                onClick={() => onNavigate(moment.nodeId)}
                className={`no-drag flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
                  isCurrent ? 'border-accent bg-accent-tint' : 'border-line bg-surface-2 hover:border-accent'
                }`}
              >
                <span className="w-6 shrink-0 text-right font-mono text-[10px] text-muted">{Math.ceil(moment.ply / 2)}</span>
                <span className="flex w-6 shrink-0 justify-center font-mono text-[12px] font-semibold" style={{ color: meta.color }}>
                  {meta.glyph}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono">
                  {moment.san}
                  <span className="ml-1 text-muted">{meta.label}</span>
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted">
                  {moment.beforeLabel} → {moment.afterLabel}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-2 text-[10px] leading-snug text-muted">
        <div className="text-[10px] font-semibold uppercase tracking-wide">How moves are graded</div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          {reviewOrder.map((grade) => (
            <span key={grade} className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: gradeMeta[grade].color }} />
              {gradeMeta[grade].label}
            </span>
          ))}
        </div>
        <div>
          Each move is scored against the engine&apos;s best line and the opponent&apos;s best reply. Loss up to 0.25 pawns is excellent, up
          to 0.6 good, up to 1.5 an inaccuracy, up to 4 a mistake, more a blunder. The top engine choice is best, or great when it is the
          only move that holds the evaluation; a sacrifice that keeps the evaluation is brilliant; giving up a forced mate, a won position
          or an opponent&apos;s blunder is a missed win. CAPS accuracy is the share of win chance the move kept, ACPL the mean centipawn
          loss over moves without a mate on the board.
        </div>
      </div>
    </div>
  )
}
