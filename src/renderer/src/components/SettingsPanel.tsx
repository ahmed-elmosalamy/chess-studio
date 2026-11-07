import { Cpu, Database, LineChart, Moon, Sun, Volume2, VolumeX } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { Theme } from '../hooks/usePreferences.ts'
import type useEngine from '../hooks/useEngine.ts'
import type { Openings } from '../hooks/useOpenings.ts'
import type { WorkspaceId } from './NavRail.tsx'

type Engine = ReturnType<typeof useEngine>

type Props = {
  theme: Theme
  onToggleTheme: () => void
  soundEnabled: boolean
  onToggleSound: () => void
  engine: Engine
  openings: Openings
  onWorkspace: (id: WorkspaceId) => void
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{title}</div>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-muted">{label}</span>
      <span className="truncate font-mono text-text" title={value}>
        {value}
      </span>
    </div>
  )
}

export default function SettingsPanel({ theme, onToggleTheme, soundEnabled, onToggleSound, engine, openings, onWorkspace }: Props) {
  const { settings, source, native } = engine
  const [tokenInput, setTokenInput] = useState('')
  const themeButton = (option: Theme) =>
    `no-drag flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
      theme === option ? 'border-accent bg-accent-tint text-text' : 'border-line bg-surface-2 text-muted hover:border-accent'
    }`

  return (
    <div data-testid="settings-panel" className="flex shrink-0 flex-col gap-3">
      <Card title="Appearance">
        <div className="flex gap-1">
          <button data-testid="settings-theme-dark" type="button" onClick={() => theme !== 'dark' && onToggleTheme()} className={themeButton('dark')}>
            <Moon size={11} /> Dark
          </button>
          <button data-testid="settings-theme-light" type="button" onClick={() => theme !== 'light' && onToggleTheme()} className={themeButton('light')}>
            <Sun size={11} /> Light
          </button>
        </div>
      </Card>

      <Card title="Sound">
        <button
          data-testid="settings-sound"
          type="button"
          onClick={onToggleSound}
          className={`no-drag flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
            soundEnabled ? 'border-accent bg-accent-tint text-text' : 'border-line bg-surface-2 text-muted hover:border-accent'
          }`}
        >
          {soundEnabled ? <Volume2 size={11} /> : <VolumeX size={11} />}
          {soundEnabled ? 'Move sounds on' : 'Move sounds off'}
        </button>
      </Card>

      <Card title="Engine">
        <Row label="Source" value={source === 'native' ? 'Native UCI' : 'Stockfish WASM'} />
        {source === 'native' && <Row label="Executable" value={native.path ?? 'none'} />}
        <Row label="Multi-PV lines" value={String(settings.multipv)} />
        <Row label="Threads" value={String(settings.threads)} />
        <Row label="Hash (MB)" value={String(settings.hash)} />
        <Row label="Depth" value={String(settings.depth)} />
        <button
          data-testid="settings-open-engine"
          type="button"
          onClick={() => onWorkspace('analysis')}
          className="no-drag mt-0.5 flex items-center justify-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] hover:border-accent"
        >
          <Cpu size={11} /> Change in Engine workspace
        </button>
      </Card>

      <Card title="Game review">
        <div className="text-[10px] leading-snug text-muted">Depth and scope are chosen per run, next to the Review button.</div>
        <button
          data-testid="settings-open-review"
          type="button"
          onClick={() => onWorkspace('review')}
          className="no-drag flex items-center justify-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] hover:border-accent"
        >
          <LineChart size={11} /> Open Review workspace
        </button>
      </Card>

      <Card title="Opening explorer">
        <Row label="Lichess token" value={openings.hasToken ? 'saved' : 'not set'} />
        <div className="flex gap-1">
          <input
            type="password"
            data-testid="settings-token"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            placeholder="Paste personal API token"
            className="no-drag h-7 min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 text-[11px] text-text outline-none focus:border-accent"
          />
          <button
            type="button"
            data-testid="settings-token-save"
            disabled={!tokenInput.trim()}
            onClick={() => {
              void openings.setToken(tokenInput).then(() => setTokenInput(''))
            }}
            className="no-drag h-7 rounded-md border border-line bg-surface-2 px-2 text-[11px] hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            data-testid="settings-token-clear"
            disabled={!openings.hasToken}
            onClick={() => void openings.clearToken()}
            className="no-drag h-7 rounded-md border border-line bg-surface-2 px-2 text-[11px] hover:border-danger disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
        </div>
        <div className="text-[10px] leading-snug text-muted">Free personal token from lichess.org/account/oauth/token (no scopes). Stored locally on this machine.</div>
      </Card>

      <Card title="Tablebases">
        <Row label="Source" value="Lichess online (7-piece)" />
        <div className="text-[10px] leading-snug text-muted">Probed live from the study board when 7 or fewer pieces remain. No download or token needed.</div>
        <button
          data-testid="settings-open-study"
          type="button"
          onClick={() => onWorkspace('study')}
          className="no-drag flex items-center justify-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] hover:border-accent"
        >
          <Database size={11} /> Open Study workspace
        </button>
      </Card>
    </div>
  )
}