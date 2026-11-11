import { useState } from 'react'
import { Clock, Flag, Lightbulb, RotateCcw, Save, Sparkles, Swords } from 'lucide-react'
import { levelSpec, PLAY_LEVELS, TIME_CONTROLS, timeControlSpec, type TimeControlId } from '@shared/play'
import { formatClock } from '../chess/clock.ts'
import type { Play } from '../hooks/usePlay.ts'
import type { ChessGame } from '../hooks/useChessGame.ts'
import type { Library } from '../hooks/useLibrary.ts'
import type { WorkspaceId } from './NavRail.tsx'
import type { Color } from 'chess.js'

type Props = {
  play: Play
  game: ChessGame
  library: Library
  currentPgn: string
  onWorkspace: (id: WorkspaceId) => void
}

const button = 'no-drag btn'
const selected = 'border-accent bg-accent-tint text-accent'

function ColorButton({ value, label, current, onSelect }: { value: Color | 'random'; label: string; current: Color | 'random'; onSelect: (value: Color | 'random') => void }) {
  const testId = value === 'w' ? 'white' : value === 'b' ? 'black' : value
  return (
    <button
      data-testid={`play-color-${testId}`}
      type="button"
      aria-pressed={current === value}
      onClick={() => onSelect(value)}
      className={`${button} flex-1 text-center ${current === value ? selected : ''}`}
    >
      {label}
    </button>
  )
}

function ClockRow({ label, ms, active, testId }: { label: string; ms: number; active: boolean; testId: string }) {
  return (
    <div className={`flex items-center justify-between rounded-md border px-2 py-1 ${active ? 'border-accent bg-accent-tint' : 'border-line bg-surface-2'}`}>
      <span className="text-2xs uppercase tracking-wide text-muted">{label}</span>
      <span data-testid={testId} className={`stat-value text-base ${active ? 'text-accent' : ''}`}>
        {formatClock(ms)}
      </span>
    </div>
  )
}

export default function PlayPanel({ play, game, library, currentPgn, onWorkspace }: Props) {
  const [color, setColor] = useState<Color | 'random'>('w')
  const [level, setLevel] = useState(play.level)
  const [timeControl, setTimeControl] = useState<TimeControlId>('none')

  const spec = levelSpec(level)

  if (!play.active) {
    return (
      <div data-testid="play-panel" className="flex shrink-0 flex-col gap-3">
        <div className="flex flex-col gap-2 card p-2">
          <div className="flex items-center gap-2">
            <Swords size={14} className="shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Play vs Stockfish</div>
              <div className="text-2xs text-muted">Local engine · free · no account</div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <ColorButton value="w" label="White" current={color} onSelect={setColor} />
            <ColorButton value="b" label="Black" current={color} onSelect={setColor} />
            <ColorButton value="random" label="Random" current={color} onSelect={setColor} />
          </div>

          <label className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between text-2xs text-muted">
              <span>Level</span>
              <span data-testid="play-level-label" className="font-mono text-text">
                {spec.label} · depth {spec.depth}
              </span>
            </span>
            <input
              data-testid="play-level"
              type="range"
              min={1}
              max={PLAY_LEVELS.length}
              step={1}
              value={level}
              onChange={(event) => setLevel(Number(event.target.value))}
              className="no-drag accent-[var(--accent)]"
            />
          </label>

          <label className="flex items-center justify-between text-2xs text-muted">
            <span>Clock</span>
            <select
              data-testid="play-time"
              className="no-drag rounded-md border border-line bg-surface-2 px-1 py-0.5 font-mono text-2xs outline-none focus:border-accent"
              value={timeControl}
              onChange={(event) => setTimeControl(event.target.value as TimeControlId)}
            >
              {TIME_CONTROLS.map((control) => (
                <option key={control.id} value={control.id}>
                  {control.label}
                </option>
              ))}
            </select>
          </label>

          <button
            data-testid="play-start"
            type="button"
            onClick={() => play.start({ color, level, timeControl })}
            className="no-drag btn btn-primary"
          >
            Start game
          </button>
        </div>
      </div>
    )
  }

  const control = timeControlSpec(play.timeControl)
  const levelLabel = levelSpec(play.level).label
  const playerIsWhite = play.playerColor === 'w'
  const saving = library.busy

  return (
    <div data-testid="play-panel" className="flex shrink-0 flex-col gap-3">
      <div className="flex flex-col gap-2 card p-2">
        <div className="flex items-center gap-2">
          <Swords size={14} className="shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Playing Stockfish</div>
            <div className="text-2xs text-muted">
              {levelLabel} · depth {levelSpec(play.level).depth} · you are {playerIsWhite ? 'White' : 'Black'}
            </div>
          </div>
          <span data-testid="play-thinking" className={`text-2xs ${play.thinking ? 'text-accent' : 'text-muted'}`}>
            {play.thinking ? 'Stockfish thinking…' : play.result ? 'Game over' : 'Your move'}
          </span>
        </div>

        {play.clock ? (
          <div className="flex flex-col gap-1">
            <ClockRow
              label={playerIsWhite ? 'You · White' : 'Stockfish · White'}
              ms={play.clock.whiteMs}
              active={game.turn === 'w'}
              testId="play-clock-white"
            />
            <ClockRow
              label={playerIsWhite ? 'Stockfish · Black' : 'You · Black'}
              ms={play.clock.blackMs}
              active={game.turn === 'b'}
              testId="play-clock-black"
            />
          </div>
        ) : (
          <div className="flex items-center gap-1 text-2xs text-muted">
            <Clock size={11} /> No clock · {control.label}
          </div>
        )}

        {play.error && <div className="text-2xs text-danger">{play.error}</div>}

        {play.result ? (
          <div data-testid="play-result" className="flex flex-col gap-1 rounded-md border border-accent bg-accent-tint px-2 py-1.5">
            <div className="text-[12px] font-semibold text-accent">{play.result}</div>
            <div className="flex flex-wrap gap-1">
              <button
                data-testid="play-review"
                type="button"
                onClick={() => onWorkspace('review')}
                className={`${button} flex items-center gap-1`}
              >
                <Sparkles size={11} /> Review this game
              </button>
              <button
                data-testid="play-save"
                type="button"
                disabled={saving}
                onClick={() => void library.saveCurrent(currentPgn)}
                className={`${button} flex items-center gap-1 disabled:opacity-50`}
              >
                <Save size={11} /> Save to library
              </button>
              <button data-testid="play-new" type="button" onClick={play.stop} className={button}>
                New game
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            <button
              data-testid="play-undo"
              type="button"
              onClick={play.undo}
              disabled={game.turn !== play.playerColor || game.ply < 2}
              className={`${button} flex items-center gap-1 disabled:opacity-40`}
            >
              <RotateCcw size={11} /> Undo
            </button>
            <button
              data-testid="play-hint"
              type="button"
              onClick={() => void play.requestHint()}
              disabled={game.turn !== play.playerColor}
              className={`${button} flex items-center gap-1 disabled:opacity-40`}
            >
              <Lightbulb size={11} /> Hint
            </button>
            <button
              data-testid="play-resign"
              type="button"
              onClick={play.resign}
              className={`${button} flex items-center gap-1 hover:border-danger hover:text-danger`}
            >
              <Flag size={11} /> Resign
            </button>
            <button data-testid="play-new" type="button" onClick={play.stop} className={button}>
              New
            </button>
          </div>
        )}

        {library.notice && <div className="text-2xs text-accent">{library.notice}</div>}
        {library.error && <div className="text-2xs text-danger">{library.error}</div>}
      </div>
    </div>
  )
}
