import { Maximize2, Minimize2, Moon, Square, Sun, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Theme } from '../hooks/usePreferences.ts'

type Props = {
  theme: Theme
  soundEnabled: boolean
  onToggleTheme: () => void
  onToggleSound: () => void
}

const buttonClass =
  'no-drag flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-3 hover:text-text'

export default function TitleBar({ theme, soundEnabled, onToggleTheme, onToggleSound }: Props) {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => window.studio.window.onStateChange((state) => setMaximized(state.maximized)), [])

  return (
    <header className="drag-region flex h-10 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
      <div className="flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-accent text-[11px] font-bold text-bg">C</div>
        <span className="text-[13px] font-semibold tracking-tight">Chess Studio</span>
        <span className="text-[11px] text-muted">Review · Analysis · Study</span>
      </div>

      <div className="flex-1" />

      <div className="no-drag flex items-center gap-1">
        <button type="button" className={buttonClass} onClick={onToggleSound} title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}>
          {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>
        <button type="button" className={buttonClass} onClick={onToggleTheme} title="Toggle theme">
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>

      <div className="no-drag ml-2 flex items-center gap-1 border-l border-line pl-3">
        <button type="button" className={buttonClass} onClick={() => window.studio.window.minimize()} title="Minimize">
          <Minimize2 size={15} />
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => window.studio.window.toggleMaximize()}
          title={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? <Square size={13} /> : <Maximize2 size={15} />}
        </button>
        <button
          type="button"
          className={`${buttonClass} hover:bg-danger hover:text-white`}
          onClick={() => window.studio.window.close()}
          title="Close"
        >
          <X size={15} />
        </button>
      </div>
    </header>
  )
}
