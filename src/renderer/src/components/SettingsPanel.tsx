import { Cpu, Database, LineChart, Moon, Sparkles, Sun, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { AiModel, AiState } from '@shared/ai'
import { AI_PROVIDERS, isKeyless, presetFor, type AiProviderId } from '@shared/aiProviders'
import { BOARD_THEMES, type BoardThemeId } from './board/boardThemes.ts'
import DiagnosticsCard from './DiagnosticsCard.tsx'
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
  boardTheme: BoardThemeId
  onBoardTheme: (theme: BoardThemeId) => void
  showCoordinates: boolean
  onToggleCoordinates: () => void
  engine: Engine
  openings: Openings
  onWorkspace: (id: WorkspaceId) => void
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 card p-2">
      <div className="card-title">{title}</div>
      {children}
    </div>
  )
}

function Row({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-muted">{label}</span>
      <span data-testid={testId} className="truncate font-mono text-text" title={value}>
        {value}
      </span>
    </div>
  )
}

export default function SettingsPanel({
  theme,
  onToggleTheme,
  soundEnabled,
  onToggleSound,
  boardTheme,
  onBoardTheme,
  showCoordinates,
  onToggleCoordinates,
  engine,
  openings,
  onWorkspace
}: Props) {
  const { settings, source, native } = engine
  const [tokenInput, setTokenInput] = useState('')
  const [ai, setAi] = useState<AiState | null>(null)
  const [aiKey, setAiKey] = useState('')
  const [aiModels, setAiModels] = useState<AiModel[] | null>(null)
  const [aiBudget, setAiBudget] = useState(100)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMessage, setAiMessage] = useState<string | null>(null)
  const [aiModelText, setAiModelText] = useState('')
  const [aiUrl, setAiUrl] = useState('')

  useEffect(() => {
    window.studio.ai
      .state()
      .then((state) => {
        setAi(state)
        setAiBudget(state.settings.pagesPerRun)
      })
      .catch(() => setAi(null))
  }, [])

  useEffect(() => {
    if (!ai) return
    setAiModelText(ai.settings.model)
    setAiUrl(ai.settings.baseUrl)
  }, [ai])

  const button = 'no-drag btn'
  const runAi = async (action: () => Promise<AiState>, note?: string) => {
    setAiBusy(true)
    try {
      const state = await action()
      setAi(state)
      setAiBudget(state.settings.pagesPerRun)
      setAiMessage(note ?? null)
    } catch (caught) {
      setAiMessage(String(caught).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, ''))
    } finally {
      setAiBusy(false)
    }
  }

  const themeButton = (option: Theme) =>
    `no-drag btn flex-1 ${theme === option ? 'border-accent bg-accent-tint text-text' : 'btn-ghost'}`

  const aiProvider = ai?.settings.provider ?? 'openrouter'
  const aiPreset = presetFor(aiProvider)
  const aiKeyless = ai ? isKeyless(ai.settings) : false
  const switchProvider = (id: AiProviderId) => {
    const preset = presetFor(id)
    setAiModels(null)
    setAiKey('')
    void runAi(() => window.studio.ai.setSettings({ provider: id, baseUrl: id === 'custom' ? (ai?.settings.baseUrl ?? '') : preset.baseUrl, model: preset.defaultModel }))
  }

  return (
    <div data-testid="settings-panel" className="flex shrink-0 flex-col gap-3">
      <Card title="Appearance">
        <div className="flex gap-1">
          <button data-testid="settings-theme-dark" type="button" aria-pressed={theme === 'dark'} onClick={() => theme !== 'dark' && onToggleTheme()} className={themeButton('dark')}>
            <Moon size={11} /> Dark
          </button>
          <button data-testid="settings-theme-light" type="button" aria-pressed={theme === 'light'} onClick={() => theme !== 'light' && onToggleTheme()} className={themeButton('light')}>
            <Sun size={11} /> Light
          </button>
        </div>
        <div className="mt-1 text-2xs uppercase tracking-wide text-muted">Board</div>
        <div className="flex gap-1">
          {BOARD_THEMES.map((option) => (
            <button
              key={option.id}
              data-testid={`settings-board-${option.id}`}
              type="button"
              aria-pressed={boardTheme === option.id}
              aria-label={`${option.label} board`}
              title={option.label}
              onClick={() => onBoardTheme(option.id)}
              className={`no-drag flex flex-1 items-center justify-center rounded-md border p-1 transition-colors ${
                boardTheme === option.id ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-accent'
              }`}
            >
              <span className="flex h-4 w-6 overflow-hidden rounded-sm">
                <span className="h-full w-1/2" style={{ background: option.light }} />
                <span className="h-full w-1/2" style={{ background: option.dark }} />
              </span>
            </button>
          ))}
        </div>
        <button
          data-testid="settings-coords"
          type="button"
          aria-pressed={showCoordinates}
          onClick={onToggleCoordinates}
          className={`no-drag btn mt-1 ${showCoordinates ? 'border-accent bg-accent-tint text-text' : ''}`}
        >
          {showCoordinates ? 'Board coordinates on' : 'Board coordinates off'}
        </button>
      </Card>

      <Card title="Sound">
        <button
          data-testid="settings-sound"
          type="button"
          aria-pressed={soundEnabled}
          onClick={onToggleSound}
          className={`no-drag btn ${soundEnabled ? 'border-accent bg-accent-tint text-text' : ''}`}
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
        <div className="text-2xs leading-snug text-muted">Depth and scope are chosen per run, next to the Review button.</div>
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
              const token = tokenInput
              void (async () => {
                try {
                  await openings.setToken(token)
                  setTokenInput('')
                } catch {
                  /* keep the typed value so the save can be retried */
                }
              })()
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
        <div className="text-2xs leading-snug text-muted">Free personal token from lichess.org/account/oauth/token (no scopes). Stored locally on this machine.</div>
      </Card>

      <Card title="AI reader">
        <Row label="Status" value={aiKeyless ? 'no key needed' : ai?.hasKey ? 'key saved' : 'no key'} testId="settings-ai-state" />
        <select
          data-testid="settings-ai-provider"
          value={aiProvider}
          disabled={aiBusy}
          onChange={(event) => switchProvider(event.target.value as AiProviderId)}
          className="no-drag h-7 rounded-md border border-line bg-surface-2 px-2 text-[11px] text-text outline-none focus:border-accent"
        >
          {AI_PROVIDERS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
        {aiKeyless ? (
          <div className="text-2xs leading-snug text-muted">Local server — no key needed.</div>
        ) : (
          <div className="flex gap-1">
            <input
              type="password"
              data-testid="settings-ai-key"
              value={aiKey}
              onChange={(event) => setAiKey(event.target.value)}
              placeholder={`Paste ${aiPreset.label} key`}
              className="no-drag h-7 min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 text-[11px] text-text outline-none focus:border-accent"
            />
            <button
              type="button"
              data-testid="settings-ai-save"
              disabled={!aiKey.trim() || aiBusy}
              onClick={() => {
                void runAi(() => window.studio.ai.setKey(aiKey)).then(() => setAiKey(''))
              }}
              className={button}
            >
              Save
            </button>
            <button type="button" data-testid="settings-ai-clear" disabled={aiBusy || !ai?.hasKey} onClick={() => void runAi(() => window.studio.ai.clearKey())} className={button}>
              Clear
            </button>
          </div>
        )}
        {aiProvider === 'custom' && (
          <input
            data-testid="settings-ai-baseurl"
            value={aiUrl}
            onChange={(event) => setAiUrl(event.target.value)}
            onBlur={() => void runAi(() => window.studio.ai.setSettings({ baseUrl: aiUrl }))}
            placeholder="https://host/v1"
            className="no-drag h-7 rounded-md border border-line bg-surface-2 px-2 text-[11px] text-text outline-none focus:border-accent"
          />
        )}
        <Row label="Model" value={ai?.settings.model || 'none chosen'} />
        <select
          data-testid="settings-ai-model"
          value={ai?.settings.model ?? ''}
          disabled={aiBusy}
          onChange={(event) => void runAi(() => window.studio.ai.setSettings({ model: event.target.value }))}
          className="no-drag h-7 rounded-md border border-line bg-surface-2 px-2 text-[11px] text-text outline-none focus:border-accent"
        >
          <option value="">none chosen</option>
          {ai?.settings.model && !(aiModels ?? []).some((model) => model.id === ai.settings.model) ? <option value={ai.settings.model}>{ai.settings.model}</option> : null}
          {(aiModels ?? []).map((model) => (
            <option key={model.id} value={model.id}>
              {model.free ? `${model.label} (free)` : model.label}
            </option>
          ))}
        </select>
        <input
          data-testid="settings-ai-model-text"
          value={aiModelText}
          onChange={(event) => setAiModelText(event.target.value)}
          onBlur={() => void runAi(() => window.studio.ai.setSettings({ model: aiModelText }))}
          placeholder="…or type a model id"
          className="no-drag h-7 rounded-md border border-line bg-surface-2 px-2 text-[11px] text-text outline-none focus:border-accent"
        />
        <Row label="Pages per run" value={String(aiBudget)} />
        <input
          data-testid="settings-ai-budget"
          type="number"
          min={1}
          max={1000}
          value={aiBudget}
          disabled={aiBusy}
          onChange={(event) => setAiBudget(Number(event.target.value))}
          onBlur={() => void runAi(() => window.studio.ai.setSettings({ pagesPerRun: aiBudget }))}
          className="no-drag h-7 w-24 rounded-md border border-line bg-surface-2 px-2 text-[11px] text-text outline-none focus:border-accent"
        />
        <button
          type="button"
          data-testid="settings-ai-test"
          disabled={aiBusy}
          onClick={() => {
            void (async () => {
              setAiBusy(true)
              try {
                const models = await window.studio.ai.models()
                const visible = aiProvider === 'openrouter' ? models.filter((model) => model.vision) : models
                setAiModels(visible)
                setAiMessage(`${visible.filter((model) => model.free).length} free models reachable`)
              } catch (caught) {
                setAiMessage(String(caught).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, ''))
              } finally {
                setAiBusy(false)
              }
            })()
          }}
          className="no-drag mt-0.5 flex items-center justify-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] hover:border-accent"
        >
          <Sparkles size={11} /> Test connection
        </button>
        {aiMessage && <div className="text-2xs leading-snug text-muted">{aiMessage}</div>}
        <div className="text-2xs leading-snug text-muted">The reader only sends page pictures to the model you choose here. Keys are stored on this machine, one per provider, and never shown on the Books screens. Free models are listed first.</div>
      </Card>

      <Card title="Tablebases">
        <Row label="Source" value="Lichess online (7-piece)" />
        <div className="text-2xs leading-snug text-muted">Probed live from the study board when 7 or fewer pieces remain. No download or token needed.</div>
        <button
          data-testid="settings-open-study"
          type="button"
          onClick={() => onWorkspace('study')}
          className="no-drag flex items-center justify-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] hover:border-accent"
        >
          <Database size={11} /> Open Study workspace
        </button>
      </Card>

      <div data-testid="settings-diagnostics">
        <DiagnosticsCard soundEnabled={soundEnabled} engineName={engine.status.name} engineState={engine.status.state} />
      </div>
    </div>
  )
}