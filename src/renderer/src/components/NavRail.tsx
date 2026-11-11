import { Activity, BookMarked, BookOpen, Crosshair, Cpu, FolderOpen, LineChart, Settings2, Swords } from 'lucide-react'
import type { ComponentType } from 'react'

export type WorkspaceId = 'review' | 'play' | 'analysis' | 'study' | 'trainer' | 'books' | 'library' | 'openings' | 'settings'

export const workspaces: { id: WorkspaceId; label: string; short: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'review', label: 'Game Review', short: 'Review', icon: LineChart },
  { id: 'play', label: 'Play vs Stockfish', short: 'Play', icon: Swords },
  { id: 'analysis', label: 'Engine Analysis', short: 'Engine', icon: Cpu },
  { id: 'study', label: 'Study Board', short: 'Study', icon: Activity },
  { id: 'trainer', label: 'Mistake Trainer', short: 'Trainer', icon: Crosshair },
  { id: 'books', label: 'Book Study', short: 'Books', icon: BookMarked },
  { id: 'openings', label: 'Opening Explorer', short: 'Openings', icon: BookOpen },
  { id: 'library', label: 'Game Library', short: 'Library', icon: FolderOpen },
  { id: 'settings', label: 'Settings', short: 'Settings', icon: Settings2 }
]

type Props = {
  active: WorkspaceId
  onSelect: (id: WorkspaceId) => void
}

export default function NavRail({ active, onSelect }: Props) {
  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-3">
      {workspaces.map(({ id, label, short, icon: Icon }) => {
        const isActive = id === active
        return (
          <div key={id} className="contents">
            {(id === 'analysis' || id === 'settings') && <div className="my-1 h-px w-8 shrink-0 bg-line" />}
            <button
              type="button"
              data-testid={`nav-${id}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelect(id)}
              title={label}
              className={`relative flex h-12 w-[62px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg text-2xs leading-none transition-colors ${
                isActive ? 'bg-surface-3 text-accent-soft' : 'text-muted hover:bg-surface-2 hover:text-text'
              }`}
            >
              {isActive && <span data-testid={`nav-active-${id}`} className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-accent" />}
              <Icon size={17} />
              <span className="w-full truncate px-1 text-center">{short}</span>
            </button>
          </div>
        )
      })}
    </nav>
  )
}
