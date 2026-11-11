import { useEffect } from 'react'

type Props = {
  onClose: () => void
}

const groups: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Board & tree',
    rows: [
      ['←', 'Back one move'],
      ['→', 'Forward one move'],
      ['↑ / ↓', 'Previous / next variation'],
      ['Home / End', 'Jump to the start / latest move'],
      ['Backspace', 'Delete the move on the board'],
      ['F', 'Flip the board'],
      ['Esc', 'Clear the selection or a pending promotion']
    ]
  },
  {
    title: 'App',
    rows: [
      ['Ctrl / Cmd + K', 'Command palette'],
      ['Ctrl / Cmd + B', 'Show or hide the right rail'],
      ['?', 'This shortcut sheet']
    ]
  },
  {
    title: 'Mouse',
    rows: [
      ['Drag a piece', 'Play the move on the board'],
      ['Right-click drag', 'Draw an arrow, shift-click to highlight a square'],
      ['Click the graph', 'Jump to a reviewed ply'],
      ['Right-click the FEN chip', 'Copy the current position']
    ]
  }
]

export default function ShortcutSheet({ onClose }: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-6 pt-[10vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        data-testid="shortcut-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="flex max-h-[72vh] w-[520px] max-w-full flex-col gap-4 overflow-y-auto rounded-card border border-line bg-surface p-4 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Keyboard shortcuts</div>
            <div className="text-2xs text-muted">Every key below ignores text fields, so typing never moves a piece.</div>
          </div>
          <button data-testid="shortcut-close" type="button" className="btn btn-ghost" onClick={onClose}>
            Esc
          </button>
        </div>

        {groups.map((group) => (
          <div key={group.title} className="flex flex-col gap-1">
            <div className="section-label">{group.title}</div>
            {group.rows.map(([keys, description]) => (
              <div key={keys} className="flex items-center justify-between gap-3 rounded-control bg-surface-2 px-2 py-1 text-xs">
                <span className="text-muted">{description}</span>
                <span className="shortcut shrink-0">{keys}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
