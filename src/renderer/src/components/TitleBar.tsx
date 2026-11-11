import { Maximize2, Minimize2, Moon, Search, Square, Sun, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Theme } from '../hooks/usePreferences.ts'
import { workspaces, type WorkspaceId } from './NavRail.tsx'

type Props = {
  workspace: WorkspaceId
  theme: Theme
  soundEnabled: boolean
  onToggleTheme: () => void
  onToggleSound: () => void
  onOpenPalette: () => void
}

const iconButton = 'icon-btn'

export default function TitleBar({ workspace, theme, soundEnabled, onToggleTheme, onToggleSound, onOpenPalette }: Props) {
  const [maximized, setMaximized] = useState(false)
  const label = workspaces.find((entry) => entry.id === workspace)?.label ?? ''

  useEffect(() => window.studio.window.onStateChange((state) => setMaximized(state.maximized)), [])

  return (
    <header className="drag-region flex h-10 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-accent text-2xs font-bold text-bg">C</div>
        <span className="shrink-0 text-sm font-semibold tracking-tight">Chess Studio</span>
        <span aria-hidden className="shrink-0 text-line">/</span>
        <span data-testid="titlebar-workspace" className="truncate text-xs text-muted">
          {label}
        </span>
      </div>

      <div className="flex-1" />

      <div className="no-drag flex items-center gap-1">
        <button
          type="button"
          data-testid="palette-open"
          className={iconButton}
          onClick={onOpenPalette}
          title="Command palette (Ctrl+K)"
          aria-label="Open command palette"
        >
          <Search size={15} />
        </button>
        <button type="button" className={iconButton} aria-pressed={soundEnabled} onClick={onToggleSound} title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}>
          {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>
        <button type="button" className={iconButton} aria-pressed={theme === 'dark'} onClick={onToggleTheme} title="Toggle theme">
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>

      <div className="no-drag ml-1 flex items-center gap-1 border-l border-line pl-2">
        <button type="button" className={iconButton} onClick={() => window.studio.window.minimize()} title="Minimize">
          <Minimize2 size={15} />
        </button>
        <button type="button" className={iconButton} onClick={() => window.studio.window.toggleMaximize()} title={maximized ? 'Restore' : 'Maximize'}>
          {maximized ? <Square size={13} /> : <Maximize2 size={15} />}
        </button>
        <button type="button" className={`${iconButton} hover:bg-danger hover:text-white`} onClick={() => window.studio.window.close()} title="Close">
          <X size={15} />
        </button>
      </div>
    </header>
  )
}
