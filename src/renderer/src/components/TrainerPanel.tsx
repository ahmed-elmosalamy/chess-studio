import { useCallback, useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Crosshair, ListChecks, Trash2 } from 'lucide-react'
import { gradeMeta } from '@shared/review'
import type { TrainerPuzzle } from '@shared/trainer'
import GradeBadge from './GradeBadge.tsx'
import type { Trainer } from '../hooks/useTrainer.ts'
import type { ChessGame } from '../hooks/useChessGame.ts'

type Props = { trainer: Trainer; game: ChessGame; playActive?: boolean }

type Outcome = { correct: boolean; bestSan: string; playedSan?: string }

function sanOf(fen: string, uci: string): string {
  if (uci.length < 4) return uci
  try {
    const move = new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined })
    return move?.san ?? uci
  } catch {
    return uci
  }
}

const button = 'no-drag btn'

export default function TrainerPanel({ trainer, game, playActive = false }: Props) {
  const { due, puzzles, attempt, remove, clear, showHint, clearHint, error, notice, loading } = trainer
  const [activeId, setActiveId] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const attempted = useRef(new Set<string>())
  const advanceTimer = useRef<number | null>(null)

  const active = puzzles.find((puzzle) => puzzle.id === activeId) ?? null
  const node = game.tree[game.currentId]

  const start = useCallback(
    (puzzle: TrainerPuzzle) => {
      clearHint()
      setOutcome(null)
      setActiveId(puzzle.id)
      game.newGame(puzzle.fen)
    },
    [clearHint, game]
  )

  const advance = useCallback(
    (avoidId: string) => {
      const remaining = puzzles.filter((puzzle) => puzzle.id !== avoidId)
      const next = remaining.find((puzzle) => due.some((candidate) => candidate.id === puzzle.id)) ?? remaining[0]
      if (next) start(next)
      else {
        setActiveId(null)
        setOutcome(null)
      }
    },
    [due, puzzles, start]
  )

  useEffect(() => {
    if (!active || !node) return
    if (node.ply !== 1 || node.parentId !== game.rootId) return
    const key = `${active.id}:${node.id}`
    if (attempted.current.has(key)) return
    attempted.current.add(key)

    const played = `${node.from}${node.to}${node.promotion ?? ''}`
    const solved = active.accepted.includes(played)
    const answer = sanOf(active.fen, active.bestUci)
    void attempt(active.id, solved).then((updated) => {
      if (!updated) return
      if (solved) {
        setOutcome({ correct: true, bestSan: answer })
        advanceTimer.current = window.setTimeout(() => {
          advanceTimer.current = null
          advance(active.id)
        }, 1100)
      } else {
        setOutcome({ correct: false, bestSan: answer, playedSan: node.san ?? played })
        game.navigate(game.rootId)
        showHint(active.bestUci.slice(0, 2), active.bestUci.slice(2, 4))
      }
    })
  }, [active, advance, attempt, game, node, showHint])

  useEffect(() => {
    return () => {
      if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current)
    }
  }, [])

  const stopActive = (): void => {
    if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current)
    advanceTimer.current = null
    setActiveId(null)
    setOutcome(null)
    clearHint()
  }

  const list = due.length > 0 ? due : puzzles

  return (
    <div data-testid="trainer-panel" className="flex shrink-0 flex-col gap-3">
      <div className="flex flex-col gap-2 card p-2">
        <div className="flex items-center gap-2">
          <Crosshair size={14} className="shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Mistake trainer</div>
            <div data-testid="trainer-counts" className="text-2xs text-muted">
              {due.length} due · {puzzles.length} saved
            </div>
          </div>
          {puzzles.length > 0 && (
            <button
              data-testid="trainer-clear"
              type="button"
              onClick={() => {
                stopActive()
                void clear()
              }}
              className={`${button} hover:border-danger hover:text-danger`}
            >
              Clear
            </button>
          )}
        </div>
        {notice && (
          <div data-testid="trainer-notice" className="text-2xs text-accent">
            {notice}
          </div>
        )}
        {error && <div className="text-2xs text-danger">{error}</div>}
      </div>

      {active && (
        <div data-testid="trainer-active" className="flex flex-col gap-2 card p-2">
          <div className="flex items-center gap-2">
            <GradeBadge grade={active.grade} />
            <span className="text-[11px] font-semibold">{gradeMeta[active.grade].label}</span>
            <span className="ml-auto min-w-0 truncate text-2xs text-muted">{active.gameLabel || 'Saved game'}</span>
          </div>
          <div className="text-2xs leading-snug text-muted">Position before the mistake. Find a move the engine accepts.</div>
          {outcome && (
            <div
              data-testid="trainer-outcome"
              className={`rounded-md border px-2 py-1.5 text-[11px] ${
                outcome.correct ? 'border-accent bg-accent-tint text-accent' : 'border-danger text-danger'
              }`}
            >
              {outcome.correct ? `Solved · ${outcome.bestSan}` : `Played ${outcome.playedSan ?? 'that'}; best was ${outcome.bestSan}`}
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            <button
              data-testid="trainer-again"
              type="button"
              onClick={() => start(active)}
              disabled={playActive}
              title={playActive ? 'Stop the game first' : undefined}
              className={`${button} disabled:opacity-40`}
            >
              Again
            </button>
            <button data-testid="trainer-skip" type="button" onClick={() => advance(active.id)} className={button}>
              Skip
            </button>
            <button
              data-testid="trainer-remove-active"
              type="button"
              onClick={() => {
                stopActive()
                void remove(active.id)
              }}
              className={`${button} hover:border-danger hover:text-danger`}
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {!active && (
        <div className="flex flex-col gap-1 card p-2">
          <div className="card-title flex items-center gap-2">
            <ListChecks size={12} /> Puzzles <span data-testid="trainer-due-count" className="ml-auto font-mono normal-case">{due.length} due</span>
          </div>

          {!loading && list.length === 0 && (
            <div data-testid="trainer-empty" className="rounded-md border border-dashed border-line px-3 py-5 text-center text-[11px] text-muted">
              Run a review, then use “Save mistakes” in the Review panel.
            </div>
          )}

          {list.map((puzzle) => (
            <div
              key={puzzle.id}
              data-testid="trainer-row"
              data-puzzle-id={puzzle.id}
              className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2 py-1.5"
            >
              <GradeBadge grade={puzzle.grade} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px]">{puzzle.gameLabel || 'Saved game'}</div>
                <div className="text-2xs text-muted">
                  Ply {puzzle.ply} · {gradeMeta[puzzle.grade].label} · attempts {puzzle.attempts} · streak {puzzle.streak}
                </div>
              </div>
              <button
                data-testid="trainer-start"
                type="button"
                onClick={() => start(puzzle)}
                disabled={playActive}
                title={playActive ? 'Stop the game first' : undefined}
                className={`${button} disabled:opacity-40`}
              >
                Start
              </button>
              <button
                data-testid="trainer-remove"
                type="button"
                aria-label="Remove puzzle"
                onClick={() => void remove(puzzle.id)}
                className={`${button} px-1.5 hover:border-danger hover:text-danger`}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}

          {due.length === 0 && puzzles.length > 0 && (
            <div data-testid="trainer-nothing-due" className="px-1 pt-1 text-2xs text-muted">
              Nothing due today — the list shows every saved puzzle so you can practise ahead.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
