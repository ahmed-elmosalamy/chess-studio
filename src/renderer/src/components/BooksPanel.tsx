import { useState } from 'react'
import { BookOpen, Pencil, RefreshCw, Trash2, Upload } from 'lucide-react'
import type { BookMeta } from '@shared/book'
import type { Books } from '../hooks/useBooks.ts'

function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function BooksPanel({ books }: { books: Books }) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const startRename = (book: BookMeta): void => {
    setEditingId(book.id)
    setDraft(book.title)
  }

  const commitRename = (id: string): void => {
    const title = draft.trim()
    setEditingId(null)
    if (title) void books.renameBook(id, title)
  }

  return (
    <div data-testid="books-panel" className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="card flex shrink-0 flex-wrap items-center gap-3 p-4">
        <BookOpen size={20} className="text-accent" aria-hidden="true" />
        <strong className="text-base font-semibold text-text">Book library</strong>
        <span data-testid="books-count" className="rounded-full border border-line bg-surface-2 px-2 py-0.5 font-mono text-2xs text-muted">
          {books.total}
        </span>
        <div className="flex-1" />
        <button type="button" className="no-drag btn btn-ghost min-h-8" onClick={() => void books.refresh()} title="Reload books" data-testid="books-refresh">
          <RefreshCw size={14} aria-hidden="true" /> Refresh
        </button>
        <button
          type="button"
          data-testid="books-upload"
          disabled={books.busy}
          onClick={() => void books.importBooks()}
          className="no-drag btn btn-primary min-h-8"
          title="Upload a chess book as PDF"
        >
          <Upload size={13} /> {books.busy ? 'Uploading…' : 'Upload PDF book'}
        </button>
      </div>

      {books.notice && (
        <div data-testid="books-notice" className="shrink-0 rounded-md border border-line bg-surface px-3 py-1.5 text-[11px] leading-snug text-muted">
          {books.notice}
        </div>
      )}

      {books.error && (
        <div data-testid="books-error" className="shrink-0 rounded-md border border-danger bg-surface px-3 py-1.5 text-[11px] leading-snug text-danger">
          {books.error}
        </div>
      )}

      {books.warnings.length > 0 && (
        <div data-testid="books-warnings" className="shrink-0 rounded-md border border-line bg-surface px-3 py-1.5 text-[11px] leading-snug text-muted">
          {books.warnings.map((warning, index) => (
            <div key={index} className="truncate" title={warning}>
              {warning}
            </div>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {books.loading ? (
          <div className="px-1 py-6 text-[12px] text-muted">Loading books…</div>
        ) : books.books.length === 0 ? (
          <div
            data-testid="books-empty"
            className="card mx-auto mt-10 flex max-w-[460px] flex-col items-center justify-center gap-3 border-dashed p-4 text-center"
          >
            <BookOpen size={30} className="text-muted" aria-hidden="true" />
            <div className="text-base font-semibold">No books uploaded yet</div>
            <div className="text-xs leading-relaxed text-muted">
              Open a chess book PDF, follow its moves on the board, and return to your saved place. Scanned pages can be read with OCR or your configured AI provider.
            </div>
            <button
              type="button"
              disabled={books.busy}
              onClick={() => void books.importBooks()}
              className="no-drag btn btn-primary mt-1 min-h-8"
            >
              <Upload size={14} /> Upload PDF book
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-3">
            {books.books.map((book) => (
              <div
                key={book.id}
                data-testid="books-row"
                data-book-id={book.id}
                className="card flex min-w-0 flex-col gap-3 p-4 transition-colors hover:border-accent"
              >
                <div className="flex items-start gap-3">
                  <BookOpen size={20} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
                  {editingId === book.id ? (
                    <input
                      data-testid="books-rename-input"
                      autoFocus
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitRename(book.id)
                        if (event.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={() => setEditingId(null)}
                      className="min-h-8 min-w-0 flex-1 rounded-md border border-accent bg-surface-2 px-2 text-base text-text outline-none"
                    />
                  ) : (
                    <div data-testid="books-title" className="line-clamp-2 min-w-0 flex-1 text-base font-semibold leading-snug text-text" title={book.title}>
                      {book.title}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-2xs font-semibold">
                    {book.source === 'text' ? 'Text' : book.source === 'ocr' ? 'OCR' : book.source === 'ai' ? 'AI' : 'PDF'}
                  </span>
                  {book.pageCount != null && <span>{book.pageCount} {book.pageCount === 1 ? 'page' : 'pages'}</span>}
                  <span>{sizeLabel(book.sizeBytes)}</span>
                  <span title={`Uploaded ${new Date(book.importedAt).toLocaleString()}`}>{new Date(book.importedAt).toLocaleDateString()}</span>
                </div>
                <div className="text-xs leading-relaxed text-muted">
                  {book.parsedAt
                    ? `Last opened: PDF page ${book.lastPage}${book.pageCount != null ? ` of ${book.pageCount}` : ''}`
                    : 'Not analysed yet'}
                </div>

                <div className="mt-auto flex items-center gap-1.5">
                  {confirmId === book.id ? (
                    <>
                      <span className="flex-1 text-2xs text-muted">Delete this book?</span>
                      <button
                        type="button"
                        data-testid="books-delete-confirm"
                        disabled={books.busy}
                        onClick={() => {
                          setConfirmId(null)
                          void books.removeBook(book.id)
                        }}
                        className="no-drag btn btn-danger min-h-8"
                      >
                        Delete
                      </button>
                      <button type="button" data-testid="books-delete-cancel" onClick={() => setConfirmId(null)} className="no-drag btn btn-ghost min-h-8">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        data-testid="books-open"
                        disabled={books.busy || books.opening}
                        onClick={() => void books.openReader(book.id)}
                        className="no-drag btn min-h-8 flex-1 font-semibold"
                        title={book.parsedAt ? 'Open and keep reading' : 'Open and read this PDF'}
                      >
                        <BookOpen size={12} /> {books.opening ? 'Opening…' : book.parsedAt ? 'Continue reading' : 'Read'}
                      </button>
                      <button type="button" data-testid="books-rename" onClick={() => startRename(book)} className="no-drag btn btn-ghost min-h-8 min-w-8 shrink-0 px-0" title="Rename book" aria-label="Rename book">
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        data-testid="books-delete"
                        disabled={books.busy}
                        onClick={() => setConfirmId(book.id)}
                        className="no-drag btn btn-ghost min-h-8 min-w-8 shrink-0 px-0 hover:text-danger"
                        title="Delete book"
                        aria-label="Delete book"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 text-center text-2xs leading-snug text-muted">PDFs are stored on this device. AI reading sends page images to your configured provider; offline text/OCR processing stays local.</div>
    </div>
  )
}
