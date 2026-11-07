import { Activity, BookOpen, Cpu, FolderOpen, LineChart, Settings2 } from 'lucide-react'
import type { ComponentType } from 'react'

export type WorkspaceId = 'review' | 'analysis' | 'study' | 'library' | 'openings' | 'settings'

export const workspaces: { id: WorkspaceId; label: string; short: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'review', label: 'Game Review', short: 'Review', icon: LineChart },
  { id: 'analysis', label: 'Engine Analysis', short: 'Engine', icon: Cpu },
  { id: 'study', label: 'Study Board', short: 'Study', icon: Activity },
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
    <nav className="flex w-[68px] shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-3">
      {workspaces.map(({ id, label, short, icon: Icon }) => {
        const isActive = id === active
        return (
          <button
            key={id}
            data-testid={`nav-${id}`}
            type="button"
            onClick={() => onSelect(id)}
            title={label}
            className={`flex h-12 w-[58px] flex-col items-center justify-center gap-1 rounded-lg text-[10px] leading-none transition-colors ${
              isActive ? 'bg-surface-3 text-accent-soft' : 'text-muted hover:bg-surface-2 hover:text-text'
            }`}
          >
            <Icon size={17} />
            <span className="w-full truncate px-1 text-center">{short}</span>
          </button>
        )
      })}
    </nav>
  )
}
