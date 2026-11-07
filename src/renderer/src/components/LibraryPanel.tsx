import { useEffect, useState } from 'react'
import { Download, FolderOpen, Globe, Library as LibraryIcon, RefreshCw, Save, Search, Trash2, X } from 'lucide-react'
import type { FetchRequest, LibraryEntry } from '@shared/library'
import type { Library } from '../hooks/useLibrary.ts'

type Props = {
  library: Library
  currentPgn: string
  canSave: boolean
  onOpenGame: (pgn: string) => void
}

type Provider = FetchRequest['provider']

const actionButton =
  'no-drag flex h-7 items-center justify-center gap-1 rounded-md border border-line bg-surface-2 px-2 text-[11px] text-muted transition-colors hover:border-accent hover:text-text disabled:cursor-not-allowed disabled:opacity-50'

const fieldClass =
  'h-7 rounded-md border border-line bg-surface-2 px-2 text-[11px] text-text outline-none focus:border-accent'

function movesOf(entry: { plies: number }): number {
  return Math.ceil(entry.plies / 2)
}

export default function LibraryPanel({ library, currentPgn, canSave, onOpenGame }: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [fetchOpen, setFetchOpen] = useState(false)
  const [provider, setProvider] = useState<Provider>('chesscom')
  const [username, setUsername] = useState('')
  const [max, setMax] = useState(10)
  const [unchecked, setUnchecked] = useState<Record<number, boolean>>({})

  useEffect(() => {
    setUnchecked({})
  }, [library.fetchReport])

  const open = async (entry: LibraryEntry): Promise<void> => {
    const pgn = await library.readGame(entry.id)
    if (pgn) onOpenGame(pgn)
  }

  const runFetch = (): void => {
    const handle = username.trim()
    if (!handle) return
    const request: FetchRequest = provider === 'lichess-game' ? { provider, gameId: handle } : { provider, username: handle, max }
    void library.fetchOnline(request)
  }

  const report = library.fetchReport
  const selected = report ? report.games.filter((_, index) => !unchecked[index]) : []

  return (
    <div data-testid="library-panel" className="flex min-h-0 flex-1 flex-col gap-2 rounded-lg border border-line bg-surface p-3">
      <div className="flex shrink-0 items-center gap-2">
        <LibraryIcon size={13} className="text-muted" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Game library</span>
        <span data-testid="library-count" className="ml-auto rounded-full border border-line bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted">
          {library.total}
        </span>
        <button type="button" className={actionButton} onClick={() => void library.refresh()} title="Reload library" data-testid="library-refresh">
          <RefreshCw size={11} />
        </button>
      </div>

      <div className="flex shrink-0 gap-1.5">
        <button
          type="button"
          data-testid="library-save"
          disabled={!canSave || library.busy}
          onClick={() => void library.saveCurrent(currentPgn)}
          className="no-drag flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-accent bg-accent px-2 text-[11px] font-semibold text-bg transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
          title={canSave ? 'Save the game on the board' : 'Play or load a game first'}
        >
          <Save size={12} /> Save current
        </button>
        <button
          type="button"
          data-testid="library-import"
          disabled={library.busy}
          onClick={() => void library.importFiles()}
          className={`${actionButton} h-8 flex-1`}
          title="Import PGN files from disk"
        >
          <FolderOpen size={12} /> Import files
        </button>
        <button
          type="button"
          data-testid="library-fetch-toggle"
          onClick={() => setFetchOpen((current) => !current)}
          className={`${actionButton} h-8 ${fetchOpen ? 'border-accent text-text' : ''}`}
          title="Fetch games from Chess.com or Lichess"
        >
          <Globe size={12} /> Online
        </button>
      </div>

      {fetchOpen && (
        <div data-testid="library-fetch-form" className="flex shrink-0 flex-col gap-1.5 rounded-md border border-line bg-surface-2 p-2">
          <div className="flex items-center gap-1.5">
            <select
              data-testid="library-fetch-provider"
              value={provider}
              onChange={(event) => setProvider(event.target.value as Provider)}
              className={`${fieldClass} min-w-0 flex-1`}
            >
              <option value="chesscom">Chess.com username</option>
              <option value="lichess">Lichess username</option>
              <option value="lichess-game">Lichess game ID</option>
            </select>
            <button type="button" data-testid="library-fetch-close" onClick={() => setFetchOpen(false)} className={`${actionButton} w-7 px-0`} title="Close online fetch">
              <X size={11} />
            </button>
          </div>
          <div className="flex gap-1.5">
            <input
              data-testid="library-fetch-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && runFetch()}
              placeholder={provider === 'lichess-game' ? 'Game ID, e.g. HqjDTU4A' : 'Username, e.g. Hikaru'}
              className={`${fieldClass} min-w-0 flex-1`}
            />
            {provider !== 'lichess-game' && (
              <select data-testid="library-fetch-max" value={max} onChange={(event) => setMax(Number(event.target.value))} className={`${fieldClass} w-16 shrink-0`} title="Maximum games">
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            )}
            <button
              type="button"
              data-testid="library-fetch-run"
              disabled={library.fetching || username.trim().length === 0}
              onClick={runFetch}
              className="no-drag h-7 rounded-md border border-accent bg-accent px-2 text-[11px] font-semibold text-bg hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {library.fetching ? 'Fetching…' : 'Fetch'}
            </button>
          </div>
          <div className="text-[10px] leading-snug text-muted">
            {provider === 'chesscom'
              ? 'Recent monthly archives, newest first. Single-game links are not supported by Chess.com.'
              : provider === 'lichess'
                ? 'Latest games of the username, as a PGN stream.'
                : 'One game by its 8-character Lichess ID.'}
          </div>
        </div>
      )}

      {library.fetchError && (
        <div data-testid="library-fetch-error" className="flex shrink-0 items-start gap-1.5 rounded-md border border-danger bg-surface-2 px-2 py-1 text-[10px] leading-snug text-danger">
          <span className="min-w-0 flex-1 break-words">{library.fetchError}</span>
          <button type="button" data-testid="library-fetch-error-dismiss" onClick={library.clearFetch} className="no-drag shrink-0 text-danger hover:text-text" title="Dismiss error">
            <X size={11} />
          </button>
        </div>
      )}

      {report ? (
        <>
          <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted">
            <span data-testid="library-fetch-source" className="truncate" title={report.source}>
              {report.games.length} game{report.games.length === 1 ? '' : 's'} · {report.source}
            </span>
          </div>
          {report.skipped.length > 0 && (
            <div data-testid="library-fetch-skipped" className="shrink-0 text-[10px] text-danger">
              {report.skipped.length} game{report.skipped.length === 1 ? '' : 's'} skipped while parsing
            </div>
          )}
          <div className="min-h-[120px] flex-1 overflow-y-auto">
            {report.games.length === 0 ? (
              <div data-testid="library-fetch-empty" className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[11px] text-muted">
                No games returned for this handle.
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {report.games.map((game, index) => (
                  <li key={index} data-testid="library-fetch-row" className="flex items-center gap-1.5 rounded-md border border-line bg-surface-2 p-1.5">
                    <input
                      type="checkbox"
                      data-testid="library-fetch-check"
                      checked={!unchecked[index]}
                      onChange={() => setUnchecked((current) => ({ ...current, [index]: !current[index] }))}
                      className="h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-semibold text-text">
                        {game.white} vs {game.black}
                      </div>
                      <div className="truncate text-[10px] text-muted">
                        {game.result} · {game.date} · {movesOf(game)} moves
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              data-testid="library-fetch-save"
              disabled={selected.length === 0 || library.busy}
              onClick={() => void library.saveFetched(selected.map((game) => game.pgn))}
              className="no-drag flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-accent bg-accent px-2 text-[11px] font-semibold text-bg hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={12} /> Save selected ({selected.length})
            </button>
            <button type="button" data-testid="library-fetch-discard" onClick={library.clearFetch} className={`${actionButton} h-8`}>
              Discard
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2">
            <Search size={11} className="shrink-0 text-muted" />
            <input
              data-testid="library-search"
              value={library.query}
              onChange={(event) => library.setQuery(event.target.value)}
              placeholder="Search players, event, date"
              className="w-full bg-transparent text-[11px] text-text outline-none placeholder:text-muted"
            />
          </label>

          {library.notice && (
            <div data-testid="library-notice" className="shrink-0 rounded-md border border-line bg-surface-2 px-2 py-1 text-[10px] leading-snug text-muted">
              {library.notice}
            </div>
          )}

          {library.error && (
            <div data-testid="library-error" className="shrink-0 rounded-md border border-danger bg-surface-2 px-2 py-1 text-[10px] leading-snug text-danger">
              {library.error}
            </div>
          )}

          {library.warnings.length > 0 && (
            <div data-testid="library-warnings" className="shrink-0 rounded-md border border-line bg-surface-2 px-2 py-1 text-[10px] leading-snug text-muted">
              <div className="font-semibold text-danger">
                {library.warnings.length} game{library.warnings.length === 1 ? '' : 's'} skipped
              </div>
              {library.warnings.slice(0, 3).map((warning, index) => (
                <div key={index} className="truncate" title={warning}>
                  {warning}
                </div>
              ))}
              {library.warnings.length > 3 && <div>and {library.warnings.length - 3} more…</div>}
            </div>
          )}

          <div className="min-h-[120px] flex-1 overflow-y-auto">
            {library.loading ? (
              <div className="px-1 py-3 text-[11px] text-muted">Loading library…</div>
            ) : library.entries.length === 0 ? (
              <div
                data-testid="library-empty"
                className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 py-8 text-center"
              >
                <LibraryIcon size={22} className="text-muted" />
                <div className="text-[12px] font-semibold">{library.total === 0 ? 'No games saved yet' : 'No matches'}</div>
                <div className="max-w-[240px] text-[11px] leading-relaxed text-muted">
                  {library.total === 0 ? 'Save the game on the board, or import PGN files to start your library.' : 'Try a different player, event or date.'}
                </div>
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {library.entries.map((entry) => (
                  <li
                    key={entry.id}
                    data-testid="library-row"
                    data-entry-id={entry.id}
                    className="flex items-center gap-1.5 rounded-md border border-line bg-surface-2 p-1.5 transition-colors hover:border-accent"
                  >
                    {confirmId === entry.id ? (
                      <>
                        <span className="flex-1 truncate text-[11px] text-danger">Delete this game?</span>
                        <button
                          type="button"
                          data-testid="library-delete-confirm"
                          disabled={library.busy}
                          onClick={() => {
                            setConfirmId(null)
                            void library.removeGame(entry.id)
                          }}
                          className="no-drag h-7 rounded-md border border-danger bg-surface-2 px-2 text-[11px] font-semibold text-danger hover:bg-danger hover:text-white"
                        >
                          Delete
                        </button>
                        <button type="button" data-testid="library-delete-cancel" onClick={() => setConfirmId(null)} className={`${actionButton} h-7`}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" data-testid="library-open" onClick={() => void open(entry)} className="min-w-0 flex-1 text-left" title="Open on the board">
                          <div className="flex items-center gap-1.5">
                            <span className="shrink-0 rounded border border-line bg-surface px-1 font-mono text-[10px] text-muted">{entry.result}</span>
                            <span className="truncate text-[11px] font-semibold text-text">
                              {entry.white} vs {entry.black}
                            </span>
                          </div>
                          <div className="truncate text-[10px] text-muted" title={`Saved ${new Date(entry.savedAt).toLocaleString()}`}>
                            {entry.event} · {entry.date} · {movesOf(entry)} moves
                          </div>
                        </button>
                        <button
                          type="button"
                          data-testid="library-export"
                          disabled={library.busy}
                          onClick={() => void library.exportGame(entry.id)}
                          className={`${actionButton} h-7 w-7 px-0`}
                          title="Export as PGN file"
                        >
                          <Download size={11} />
                        </button>
                        <button
                          type="button"
                          data-testid="library-delete"
                          disabled={library.busy}
                          onClick={() => setConfirmId(entry.id)}
                          className={`${actionButton} h-7 w-7 px-0 hover:border-danger hover:text-danger`}
                          title="Delete from library"
                        >
                          <Trash2 size={11} />
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <div className="shrink-0 text-[10px] leading-snug text-muted">Stored as PGN files in the app data folder. Nothing is saved automatically.</div>
    </div>
  )
}