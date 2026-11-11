import { BookOpen, ExternalLink, RefreshCw, Settings as SettingsIcon } from 'lucide-react'
import { percentages, totalGames, type ExplorerCounts } from '@shared/openings'
import type { Openings } from '../hooks/useOpenings.ts'
import type { WorkspaceId } from './NavRail.tsx'
import { openingsStage } from '../ui/emptyStates.ts'

const actionButton =
  'no-drag btn'

function ResultBar({ counts, height = 'h-2' }: { counts: ExplorerCounts; height?: string }) {
  const pct = percentages(counts)
  return (
    <div className={`flex ${height} min-w-0 flex-1 overflow-hidden rounded border border-line`}>
      <div style={{ width: `${pct.white}%`, backgroundColor: '#e9e9e9' }} />
      <div style={{ width: `${pct.draws}%`, backgroundColor: '#9a9a9a' }} />
      <div style={{ width: `${pct.black}%`, backgroundColor: '#3a3a3a' }} />
    </div>
  )
}

type Props = {
  openings: Openings
  onPlayMove: (uci: string) => void
  onWorkspace: (id: WorkspaceId) => void
}

export default function OpeningsPanel({ openings, onPlayMove, onWorkspace }: Props) {
  const { hasToken, result, loading, error } = openings
  const stage = openingsStage({ tokenConfigured: hasToken === true, loading })
  const totalPct = result ? percentages(result) : null

  return (
    <div data-testid="openings-panel" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto card p-3">
      <div className="flex shrink-0 items-center gap-2">
        <BookOpen size={13} className="text-muted" />
        <span className="card-title">Opening explorer</span>
        <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-2xs text-muted">Masters</span>
        <div className="flex-1" />
        <button type="button" data-testid="openings-refresh" onClick={() => void openings.refresh()} disabled={!hasToken || loading} className={actionButton} title="Refresh explorer">
          <RefreshCw size={11} />
        </button>
      </div>

      {stage === 'no-token' && (
        <div data-testid="openings-token-gate" className="flex shrink-0 flex-col gap-2 rounded-md border border-line bg-surface-2 p-3">
          <div className="text-sm font-semibold">Connect a Lichess token</div>
          <div className="text-[11px] leading-relaxed text-muted">
            The master-game opening explorer now requires a free Lichess personal API token. Create one (no scopes needed), then paste it in Settings.
          </div>
          <div className="flex gap-1.5">
            <button type="button" data-testid="openings-open-settings" onClick={() => onWorkspace('settings')} className={`${actionButton} flex-1`}>
              <SettingsIcon size={11} /> Open Settings
            </button>
            <button
              type="button"
              data-testid="openings-create-token"
              onClick={() => window.open('https://lichess.org/account/oauth/token', '_blank')}
              className={`${actionButton} flex-1`}
            >
              <ExternalLink size={11} /> Create token
            </button>
          </div>
        </div>
      )}

      {error && (
        <div data-testid="openings-error" className="flex shrink-0 items-start gap-1.5 rounded-md border border-danger bg-surface-2 px-2 py-1 text-2xs leading-snug text-danger">
          <span className="flex-1">{error}</span>
          {/token/i.test(error) && (
            <button type="button" data-testid="openings-error-settings" onClick={() => onWorkspace('settings')} className="no-drag shrink-0 underline hover:text-text">
              Settings
            </button>
          )}
        </div>
      )}

      {stage === 'loading' && !result && (
        <div data-testid="openings-loading" className="shrink-0 px-1 text-[11px] text-muted">
          Querying master games…
        </div>
      )}

      {result && (
        <>
          <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-1.5">
            {result.opening ? (
              <>
                <span data-testid="openings-eco" className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-2xs text-accent">
                  {result.opening.eco}
                </span>
                <span data-testid="openings-name" className="min-w-0 flex-1 truncate text-[11px] font-semibold" title={result.opening.name}>
                  {result.opening.name}
                </span>
              </>
            ) : (
              <span data-testid="openings-name" className="min-w-0 flex-1 truncate text-[11px] text-muted">
                Unnamed position
              </span>
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-1 rounded-md border border-line bg-surface-2 px-2 py-1.5">
            <div className="flex items-center gap-2 text-2xs text-muted">
              <span data-testid="openings-total" className="font-mono text-text">{totalGames(result).toLocaleString()} games</span>
              <div className="flex-1" />
              <span className="font-mono">{totalPct?.white}% W</span>
              <span className="font-mono">{totalPct?.draws}% D</span>
              <span className="font-mono">{totalPct?.black}% B</span>
            </div>
            <ResultBar counts={result} />
          </div>

          <div className="flex min-h-[120px] flex-1 flex-col gap-1 overflow-y-auto rounded-md border border-line bg-surface-2 p-1.5" data-testid="openings-moves">
            {result.moves.length === 0 && (
              <div data-testid="openings-empty" className="px-1 py-2 text-[11px] text-muted">
                No master games reach this position.
              </div>
            )}
            {result.moves.map((move) => {
              const pct = percentages(move)
              return (
                <button
                  key={move.uci}
                  type="button"
                  data-testid="openings-move"
                  data-uci={move.uci}
                  onClick={() => onPlayMove(move.uci)}
                  title={`${move.san}: ${pct.white}% white / ${pct.draws}% draw / ${pct.black}% black, avg ${move.averageRating}`}
                  className="no-drag flex items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-left transition-colors hover:border-accent hover:bg-surface"
                >
                  <span className="w-12 shrink-0 text-[11px] font-semibold">{move.san}</span>
                  <span className="w-14 shrink-0 text-right font-mono text-2xs text-muted">{totalGames(move).toLocaleString()}</span>
                  <ResultBar counts={move} height="h-1.5" />
                  <span className="w-10 shrink-0 text-right font-mono text-2xs text-muted">{move.averageRating}</span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {hasToken && !loading && !result && !error && (
        <div className="shrink-0 px-1 text-[11px] text-muted">Play or load a position to explore master games.</div>
      )}
    </div>
  )
}