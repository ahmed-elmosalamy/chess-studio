import { useMemo, useState } from 'react'
import { Cpu, Play, Square, Search, FolderOpen, Hourglass } from 'lucide-react'
import { formatScore } from '@shared/uci'
import { pvSteps } from '../chess/pv.ts'
import type { Color } from 'chess.js'
import type { EngineSource } from '@shared/engine'
import type useEngine from '../hooks/useEngine.ts'

type Engine = ReturnType<typeof useEngine>

type Props = {
  engine: Engine
  fen: string
  turn: Color
  reviewRunning: boolean
}

const sources: { id: EngineSource; label: string; hint: string }[] = [
  { id: 'wasm', label: 'Stockfish WASM', hint: 'Bundled, single thread, always available' },
  { id: 'native', label: 'Native UCI', hint: 'Your own engine binary, full strength' }
]

function Field({ label, value, options, onChange }: { label: string; value: number; options: number[]; onChange: (next: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-muted">{label}</span>
      <select
        className="no-drag w-[74px] rounded-md border border-line bg-surface-2 px-1.5 py-1 font-mono text-[11px] outline-none focus:border-accent"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function EnginePanel({ engine, fen, turn, reviewRunning }: Props) {
  const [showAll, setShowAll] = useState(false)
  const { status, settings, native, lines, best, activeMultipv, arrowLine, primary } = engine

  const steps = useMemo(() => (arrowLine ? pvSteps(fen, arrowLine.pv, 8) : []), [fen, arrowLine])

  const perspective: 'white' | 'black' = turn === 'w' ? 'white' : 'black'
  const shown = showAll ? lines : lines.slice(0, 3)
  const nps = primary?.nps ?? 0

  return (
    <div className="flex shrink-0 flex-col gap-3" data-testid="engine-panel">
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface p-2">
        <Cpu size={14} className="shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold">{status.name || 'Engine'}</div>
          <div className="text-2xs text-muted">
            {status.state} · depth {primary?.depth ?? 0} · {(nps / 1000).toFixed(0)} kN/s
          </div>
        </div>
        <button
          data-testid="engine-toggle"
          type="button"
          onClick={engine.toggle}
          disabled={reviewRunning}
          title={reviewRunning ? 'Game review is using the engine' : undefined}
          className={`no-drag flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
            reviewRunning
              ? 'cursor-not-allowed border-line bg-surface-2 text-muted'
              : engine.enabled
                ? 'border-danger bg-surface-2 text-danger'
                : 'border-accent bg-accent text-bg'
          }`}
        >
          {engine.enabled ? <Square size={11} /> : <Play size={11} />}
          {engine.enabled ? 'Stop' : 'Analyze'}
        </button>
      </div>

      {reviewRunning && (
        <div className="flex items-center gap-1.5 rounded-lg border border-accent bg-accent-tint px-2 py-1.5 text-2xs leading-snug">
          <Hourglass size={11} className="shrink-0 text-accent" />
          Game review is searching this game. Live analysis resumes when it finishes.
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-2">
        <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted">Engine source</div>
        <div className="flex flex-col gap-1">
          {sources.map((source) => (
            <button
              key={source.id}
              data-testid={`engine-source-${source.id}`}
              type="button"
              onClick={() => engine.setSource(source.id)}
              className={`no-drag rounded-md border px-2 py-1.5 text-left transition-colors ${
                engine.source === source.id ? 'border-accent bg-accent-tint' : 'border-line bg-surface-2 hover:border-accent'
              }`}
            >
              <div className="text-[11px] font-semibold">{source.label}</div>
              <div className="text-2xs text-muted">{source.hint}</div>
            </button>
          ))}
        </div>

        {engine.source === 'native' && (
          <div className="mt-2 flex flex-col gap-1 rounded-md border border-line bg-surface-2 p-2">
            <div className="truncate font-mono text-2xs text-muted" title={native.path ?? undefined}>
              {native.path ?? 'No executable selected'}
            </div>
            {native.path && !native.exists && <div className="text-2xs text-danger">File not found — pick the engine again.</div>}
            <button
              data-testid="engine-browse"
              type="button"
              onClick={() => void engine.pickPath()}
              className="no-drag flex items-center justify-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] hover:border-accent"
            >
              <FolderOpen size={11} /> Browse for stockfish.exe
            </button>
            {native.error && <div className="text-2xs text-danger">{native.error}</div>}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-2">
        <div className="text-2xs font-semibold uppercase tracking-wide text-muted">Settings</div>
        <Field label="Multi-PV lines" value={settings.multipv} options={[1, 2, 3, 4, 5]} onChange={(multipv) => engine.setSettings({ multipv })} />
        <Field label="Threads" value={settings.threads} options={[1, 2, 4, 8]} onChange={(threads) => engine.setSettings({ threads })} />
        <Field label="Hash (MB)" value={settings.hash} options={[64, 128, 256, 512, 1024]} onChange={(hash) => engine.setSettings({ hash })} />
        <Field label="Depth" value={settings.depth} options={[12, 15, 18, 22, 26]} onChange={(depth) => engine.setSettings({ depth })} />
        {engine.source === 'wasm' && <div className="pt-0.5 text-2xs leading-snug text-muted">Threads and hash size apply to the native engine; the bundled WASM build runs single-threaded.</div>}
      </div>

      <div className="flex shrink-0 flex-col gap-1 rounded-lg border border-line bg-surface p-2">
        <div className="flex items-center justify-between text-2xs font-semibold uppercase tracking-wide text-muted">
          <span className="flex items-center gap-1">
            <Search size={11} /> Principal variations
          </span>
          {best && <span className="font-mono normal-case text-text">best {best}</span>}
        </div>

        <div className="flex max-h-[260px] min-h-[120px] flex-col gap-1 overflow-y-auto pr-0.5">
          {shown.length === 0 && (
            <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-line px-3 py-6 text-center text-[11px] text-muted">
              {engine.enabled ? 'Thinking…' : 'Press Analyze to start the engine.'}
            </div>
          )}

          {shown.map((line) => (
            <button
              key={line.multipv}
              data-testid={`pv-line-${line.multipv}`}
              type="button"
              onClick={() => engine.setSelected(activeMultipv === line.multipv ? 0 : line.multipv)}
              className={`no-drag flex flex-col gap-0.5 rounded-md border px-2 py-1.5 text-left transition-colors ${
                activeMultipv === line.multipv ? 'border-accent bg-accent-tint' : 'border-line bg-surface-2 hover:border-accent'
              }`}
            >
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span className="text-muted">{line.multipv}</span>
                <span className={line.score.type === 'mate' ? 'font-semibold text-accent' : 'font-semibold'}>{formatScore(line.score, perspective)}</span>
                <span className="text-muted">d{line.depth}</span>
                <span className="ml-auto text-muted">{(line.nodes / 1000).toFixed(0)}k</span>
              </div>
              <div className="truncate font-mono text-2xs text-muted">{line.pv.slice(0, 8).join(' ') || '—'}</div>
            </button>
          ))}

          {lines.length > 3 && (
            <button type="button" onClick={() => setShowAll((previous) => !previous)} className="no-drag text-2xs text-muted hover:text-text">
              {showAll ? 'Show top three' : `Show all ${lines.length}`}
            </button>
          )}
        </div>

        {steps.length > 0 && (
          <div className="shrink-0 rounded-md border border-line bg-surface-2 px-2 py-1.5">
            <div className="mb-1 text-2xs uppercase tracking-wide text-muted">Line on board</div>
            <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 font-mono text-[11px]">
              {steps.map((step, index) => (
                <span key={`${step.san}-${index}`} className={index === 0 ? 'text-text' : 'text-muted'}>
                  {index % 2 === 0 && turn === 'w' ? `${Math.floor(index / 2) + 1}.` : index % 2 === 1 && turn === 'b' ? `${Math.floor(index / 2) + 1}…` : ''}
                  {step.san}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
