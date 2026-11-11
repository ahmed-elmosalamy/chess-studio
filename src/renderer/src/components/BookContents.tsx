import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { Chapter } from '@shared/book'

type Props = {
  outline: Chapter[]
  activeChapterId: string | null
  open: boolean
  onClose: () => void
  onDismiss: () => void
  onSelect: (id: string) => void
}

export default function BookContents({ outline, activeChapterId, open, onClose, onDismiss, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const searchInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) searchInput.current?.focus()
    else setQuery('')
  }, [open])

  if (!open) return null

  const search = query.trim().toLowerCase()
  const matches = outline
    .map((chapter, index) => ({ chapter, index }))
    .filter(({ chapter }) => chapter.title.toLowerCase().includes(search))

  const close = (): void => {
    setQuery('')
    onClose()
  }

  return (
    <nav
      id="book-contents"
      aria-label="Book contents"
      data-testid="reader-contents"
      className="book-reader-contents card flex max-h-full min-h-0 min-w-0 flex-col gap-2 overflow-hidden p-3"
      onBlur={(event) => {
        const target = event.relatedTarget
        if (target instanceof Element && !event.currentTarget.contains(target) && target.getAttribute('aria-controls') !== 'book-contents' && window.matchMedia('(width < 1440px)').matches) onDismiss()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        close()
      }}
    >
      <div className="flex shrink-0 items-center gap-2">
        <h2 className="section-label">Contents</h2>
        <span className="min-w-0 flex-1 text-xs text-muted" role="status">
          {search ? `${matches.length} of ${outline.length}` : `${outline.length} chapter${outline.length === 1 ? '' : 's'}`}
        </span>
        <button type="button" aria-label="Close contents" className="icon-btn min-h-8 min-w-8 shrink-0" onClick={close}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <label className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-surface-2 px-2 focus-within:border-accent">
          <Search size={14} className="shrink-0 text-muted" aria-hidden="true" />
          <span className="sr-only">Search contents</span>
          <input
            ref={searchInput}
            type="search"
            data-testid="reader-contents-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chapters"
            className="no-drag min-h-8 min-w-0 flex-1 bg-transparent text-xs text-text outline-none"
          />
        </label>
        {query.length > 0 && (
          <button
            type="button"
            data-testid="reader-contents-clear"
            className="btn min-h-8 min-w-8 shrink-0"
            onClick={() => {
              setQuery('')
              searchInput.current?.focus()
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex min-h-0 min-w-0 flex-col gap-1 overflow-y-auto">
        {outline.length === 0 ? (
          <p className="py-3 text-xs text-muted">No chapters available for this book.</p>
        ) : matches.length === 0 ? (
          <p className="py-3 text-xs text-muted">No chapters match your search.</p>
        ) : (
          matches.map(({ chapter, index }) => {
            const active = chapter.id === activeChapterId
            return (
              <button
                key={`${chapter.id}-${index}`}
                type="button"
                data-testid="reader-chapter"
                data-active={active}
                aria-current={active ? 'location' : undefined}
                onClick={() => onSelect(chapter.id)}
                className={`no-drag min-h-8 min-w-0 shrink-0 rounded-md px-2 py-2 text-left text-xs leading-snug transition-colors ${
                  active ? 'bg-surface-2 font-semibold text-accent' : 'text-muted hover:bg-surface-2 hover:text-text'
                }`}
                style={{ marginInlineStart: Math.min(32, Math.max(0, (chapter.level - 1) * 10)) }}
              >
                <span className="block break-words">{chapter.title}</span>
                <span className="mt-1 block font-mono text-xs text-muted">p. {chapter.page}</span>
              </button>
            )
          })
        )}
      </div>
    </nav>
  )
}
