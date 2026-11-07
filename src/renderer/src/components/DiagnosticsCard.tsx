import { useEffect, useState } from 'react'
import { Cpu, Volume2 } from 'lucide-react'
import type { AppInfo } from '@shared/ipc'
import { playSound, soundLabels, type SoundName } from '../audio/sounds.ts'

const sounds = Object.keys(soundLabels) as SoundName[]

export default function DiagnosticsCard({ soundEnabled, engineName, engineState }: { soundEnabled: boolean; engineName: string; engineState: string }) {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const live = engineState === 'starting' || engineState === 'searching' || engineState === 'ready'

  useEffect(() => {
    let cancelled = false
    void window.studio.getAppInfo().then((value) => {
      if (!cancelled) setInfo(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const rows: [string, string][] = info
    ? [
        ['Chess Studio', info.version],
        ['Electron', info.electron],
        ['Node', info.node],
        ['Chromium', info.chrome],
        ['Platform', `${info.platform} · ${info.arch}`]
      ]
    : [['Connecting to main process…', '']]

  return (
    <div className="shrink-0 rounded-lg border border-line bg-surface p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <Cpu size={13} /> Shell status
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11px]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="text-right">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-2 flex items-center gap-2 rounded-md bg-surface-2 px-2 py-1.5 text-[11px]">
        <span data-testid="engine-dot" className={`h-2 w-2 shrink-0 rounded-full ${live ? 'bg-accent' : engineState === 'error' ? 'bg-danger' : 'bg-muted'}`} />
        <span data-testid="engine-label" className="truncate text-muted">
          {engineName || 'Engine'} · {engineState}
        </span>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted">
          <Volume2 size={12} /> Sound check
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sounds.map((name) => (
            <button
              key={name}
              type="button"
              disabled={!soundEnabled}
              onClick={() => playSound(name)}
              className="rounded-md border border-line bg-surface-2 px-2 py-1 text-[11px] text-text transition-colors hover:border-accent hover:text-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              {soundLabels[name]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
