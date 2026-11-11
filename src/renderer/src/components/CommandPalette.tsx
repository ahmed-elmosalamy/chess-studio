import { CornerDownLeft, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { filterCommands, stepSelection, type CommandItem } from '../ui/commands.ts'

type Props = {
  commands: CommandItem[]
  onClose: () => void
}

export default function CommandPalette({ commands, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const filtered = useMemo(() => filterCommands(commands, query), [commands, query])

  useEffect(() => inputRef.current?.focus(), [])
  useEffect(() => setIndex(0), [query])
  useEffect(() => {
    listRef.current?.querySelector(`[data-testid="palette-row-${filtered[index]?.id}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [filtered, index])

  const run = (item: CommandItem | undefined): void => {
    if (!item) return
    onClose()
    item.run()
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation()
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIndex((current) => stepSelection(current, 1, filtered.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIndex((current) => stepSelection(current, -1, filtered.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      run(filtered[index])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-6 pt-[12vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        data-testid="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="flex max-h-[62vh] w-[560px] max-w-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <Search size={14} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            data-testid="palette-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command or workspace…"
            aria-label="Search commands"
            className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted"
          />
          <span className="shortcut">Esc</span>
        </div>

        <div ref={listRef} className="flex min-h-0 flex-col overflow-y-auto p-1">
          {filtered.length === 0 && <div className="px-3 py-6 text-center text-xs text-muted">No command matches “{query.trim()}”.</div>}
          {filtered.map((item, position) => {
            const first = position === 0 || filtered[position - 1].group !== item.group
            return (
              <div key={item.id} className="contents">
                {first && <div className="section-label px-2 pb-0.5 pt-2">{item.group}</div>}
                <button
                  data-testid={`palette-row-${item.id}`}
                  type="button"
                  onMouseEnter={() => setIndex(position)}
                  onClick={() => run(item)}
                  data-active={position === index}
                  className={`flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-xs ${
                    position === index ? 'bg-accent-tint text-text' : 'text-muted'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {item.label}
                    {item.hint && <span className="ml-1.5 text-muted">{item.hint}</span>}
                  </span>
                  {item.keys && <span className="shortcut shrink-0">{item.keys}</span>}
                </button>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-3 border-t border-line px-3 py-1.5 text-2xs text-muted">
          <span className="flex items-center gap-1">
            <span className="shortcut">↑</span>
            <span className="shortcut">↓</span>
            move
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeft size={10} /> run
          </span>
          <span className="ml-auto">
            {filtered.length} of {commands.length}
          </span>
        </div>
      </div>
    </div>
  )
}
