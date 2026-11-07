import { useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { ClipboardCopy, Database, Eraser, Lock, RefreshCw, Sparkles } from 'lucide-react'
import { composeFen, epOptions, parseFen, sanitizeCastling, toggleCastling, validEpSquare, type FenParts, type PlacementPiece } from '@shared/fen'
import { categoryLabel, invertCategory, sortedMoves, TABLEBASE_MAX_PIECES } from '@shared/tablebase'
import { PieceSymbol } from '../chess/pieces.tsx'
import type { ChessGame } from '../hooks/useChessGame.ts'
import type { Tablebase } from '../hooks/useTablebase.ts'

export type PaletteSelection = PlacementPiece | 'eraser'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const KINGS_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1'

const palette: PlacementPiece[] = [
  { type: 'k', color: 'w' },
  { type: 'q', color: 'w' },
  { type: 'r', color: 'w' },
  { type: 'b', color: 'w' },
  { type: 'n', color: 'w' },
  { type: 'p', color: 'w' },
  { type: 'k', color: 'b' },
  { type: 'q', color: 'b' },
  { type: 'r', color: 'b' },
  { type: 'b', color: 'b' },
  { type: 'n', color: 'b' },
  { type: 'p', color: 'b' }
]

const castlingRights: { right: 'K' | 'Q' | 'k' | 'q'; label: string }[] = [
  { right: 'K', label: 'White O-O' },
  { right: 'Q', label: 'White O-O-O' },
  { right: 'k', label: 'Black O-O' },
  { right: 'q', label: 'Black O-O-O' }
]

const actionButton =
  'no-drag flex h-7 items-center justify-center gap-1 rounded-md border border-line bg-surface-2 px-2 text-[11px] text-muted transition-colors hover:border-accent hover:text-text disabled:cursor-not-allowed disabled:opacity-50'

const fieldClass = 'h-7 rounded-md border border-line bg-surface-2 px-2 text-[11px] text-text outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50'

type Props = {
  game: ChessGame
  armed: PaletteSelection | null
  onArm: (selection: PaletteSelection | null) => void
  tablebase: Tablebase
  onPlayMove: (uci: string) => void
}

export default function StudyPanel({ game, armed, onArm, tablebase, onPlayMove }: Props) {
  const [fenText, setFenText] = useState(game.fen)
  const [loadConfirm, setLoadConfirm] = useState(false)
  const [editConfirm, setEditConfirm] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setFenText(game.fen)
    setLoadConfirm(false)
    setEditConfirm(false)
  }, [game.fen])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const parts = parseFen(game.fen) as FenParts
  const hasMoves = game.tree[game.rootId].childIds.length > 0
  const plies = Object.keys(game.tree).length - 1
  const possibleRights = sanitizeCastling(parts.placement, 'KQkq')

  const loadError = useMemo(() => {
    const trimmed = fenText.trim()
    if (!trimmed) return 'Paste or type a FEN string.'
    if (!parseFen(trimmed)) return 'Invalid FEN: expected placement, turn, castling, en passant, halfmove and fullmove fields.'
    try {
      new Chess(trimmed)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Invalid FEN.'
    }
  }, [fenText])

  const loadPosition = (): void => {
    if (loadError) return
    game.newGame(fenText.trim())
    onArm(null)
    setLoadConfirm(false)
  }

  const updateParts = (patch: Partial<FenParts>): void => {
    const next = { ...parts, ...patch }
    next.castling = sanitizeCastling(next.placement, next.castling)
    if (!validEpSquare(next.ep, next.turn)) next.ep = '-'
    game.newGame(composeFen(next))
  }

  const copyFen = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(game.fen)
    } catch {
      const area = document.createElement('textarea')
      area.value = game.fen
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    setCopied(true)
  }

  const startEditing = (): void => {
    game.newGame(game.tree[game.rootId].fen)
    onArm(null)
    setEditConfirm(false)
  }

  const armedPiece = armed && armed !== 'eraser' ? armed : null
  const tbCategory = tablebase.result?.category ?? null
  const tbTone = tbCategory === null ? '' : tbCategory === 'draw' ? 'border-line text-muted' : tbCategory.includes('win') ? 'border-accent text-accent' : 'border-danger text-danger'

  return (
    <div data-testid="study-panel" className="flex shrink-0 flex-col gap-2 rounded-lg border border-line bg-surface p-3">
      <div className="flex shrink-0 items-center gap-2">
        <Sparkles size={13} className="text-muted" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Study tools</span>
      </div>

      {hasMoves && (
        <div data-testid="study-edit-banner" className="flex shrink-0 flex-col gap-1.5 rounded-md border border-line bg-surface-2 p-2">
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <Lock size={11} className="shrink-0" />
            <span className="flex-1">Position editing is locked while the game has moves.</span>
          </div>
          {editConfirm ? (
            <div className="flex items-center gap-1.5">
              <span className="flex-1 text-[10px] leading-snug text-muted">Discard {plies} plies and edit the starting position?</span>
              <button type="button" data-testid="study-edit-confirm" onClick={startEditing} className={`${actionButton} border-accent text-text`}>
                Discard &amp; edit
              </button>
              <button type="button" data-testid="study-edit-cancel" onClick={() => setEditConfirm(false)} className={actionButton}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" data-testid="study-edit-start" onClick={() => setEditConfirm(true)} className={`${actionButton} self-start`}>
              Start editing
            </button>
          )}
        </div>
      )}

      <div className="flex shrink-0 flex-col gap-1.5 rounded-md border border-line bg-surface-2 p-2">
        <label htmlFor="study-fen" className="text-[11px] font-semibold text-muted">
          Position (FEN)
        </label>
        <textarea
          id="study-fen"
          data-testid="study-fen"
          rows={3}
          spellCheck={false}
          value={fenText}
          onChange={(event) => setFenText(event.target.value)}
          className="no-drag resize-none rounded-md border border-line bg-surface px-2 py-1 font-mono text-[10px] leading-relaxed text-text outline-none focus:border-accent"
        />
        {loadError && (
          <div data-testid="study-fen-error" className="rounded-md border border-danger bg-surface px-2 py-1 text-[10px] leading-snug text-danger">
            {loadError}
          </div>
        )}
        {loadConfirm ? (
          <div className="flex items-center gap-1.5">
            <span className="flex-1 text-[10px] leading-snug text-muted">Loading discards {plies} plies. Continue?</span>
            <button type="button" data-testid="study-load-confirm" onClick={loadPosition} className={`${actionButton} border-accent text-text`}>
              Load &amp; discard
            </button>
            <button type="button" data-testid="study-load-cancel" onClick={() => setLoadConfirm(false)} className={actionButton}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <button
              type="button"
              data-testid="study-load"
              disabled={loadError !== null}
              onClick={() => (hasMoves ? setLoadConfirm(true) : loadPosition())}
              className={`${actionButton} flex-1`}
              title="Load the FEN as a new position"
            >
              Load position
            </button>
            <button type="button" data-testid="study-copy" onClick={() => void copyFen()} className={`${actionButton} flex-1`} title="Copy the current FEN">
              <ClipboardCopy size={11} /> {copied ? 'Copied' : 'Copy FEN'}
            </button>
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2 rounded-md border border-line bg-surface-2 p-2">
        <div className="flex items-center gap-1.5">
          <span className="w-[70px] shrink-0 text-[11px] text-muted">Side to move</span>
          <button
            type="button"
            data-testid="study-turn-w"
            disabled={hasMoves}
            onClick={() => updateParts({ turn: 'w' })}
            className={`${actionButton} flex-1 ${parts.turn === 'w' ? 'border-accent text-text' : ''}`}
          >
            White
          </button>
          <button
            type="button"
            data-testid="study-turn-b"
            disabled={hasMoves}
            onClick={() => updateParts({ turn: 'b' })}
            className={`${actionButton} flex-1 ${parts.turn === 'b' ? 'border-accent text-text' : ''}`}
          >
            Black
          </button>
        </div>

        <div className="flex items-start gap-1.5">
          <span className="w-[70px] shrink-0 pt-1 text-[11px] text-muted">Castling</span>
          <div className="grid flex-1 grid-cols-2 gap-1">
            {castlingRights.map(({ right, label }) => (
              <label key={right} className={`flex items-center gap-1.5 text-[10px] ${hasMoves || !possibleRights.includes(right) ? 'text-muted opacity-60' : 'text-text'}`}>
                <input
                  type="checkbox"
                  data-testid={`study-castling-${right}`}
                  checked={parts.castling.includes(right)}
                  disabled={hasMoves || !possibleRights.includes(right)}
                  onChange={() => updateParts({ castling: toggleCastling(parts.castling, right) })}
                  className="no-drag accent-[var(--accent)]"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="w-[70px] shrink-0 text-[11px] text-muted">En passant</span>
          <select
            data-testid="study-ep"
            value={parts.ep}
            disabled={hasMoves}
            onChange={(event) => updateParts({ ep: event.target.value })}
            className={`${fieldClass} min-w-0 flex-1`}
          >
            <option value="-">none</option>
            {epOptions(parts.turn).map((square) => (
              <option key={square} value={square}>
                {square}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="w-[70px] shrink-0 text-[11px] text-muted">Halfmove</span>
          <input
            type="number"
            min={0}
            data-testid="study-halfmove"
            value={parts.halfmove}
            disabled={hasMoves}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (event.target.value !== '' && Number.isInteger(value) && value >= 0) updateParts({ halfmove: value })
            }}
            className={`${fieldClass} w-16`}
          />
          <span className="ml-2 text-[11px] text-muted">Fullmove</span>
          <input
            type="number"
            min={1}
            data-testid="study-fullmove"
            value={parts.fullmove}
            disabled={hasMoves}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (event.target.value !== '' && Number.isInteger(value) && value >= 1) updateParts({ fullmove: value })
            }}
            className={`${fieldClass} w-16`}
          />
        </div>

        <div className="flex gap-1.5">
          <button
            type="button"
            data-testid="study-start"
            disabled={hasMoves}
            onClick={() => {
              game.newGame(START_FEN)
              onArm(null)
            }}
            className={`${actionButton} flex-1`}
            title="Reset to the standard starting position"
          >
            Start position
          </button>
          <button
            type="button"
            data-testid="study-clear"
            disabled={hasMoves}
            onClick={() => {
              game.newGame(KINGS_FEN)
              onArm(null)
            }}
            className={`${actionButton} flex-1`}
            title="Remove every piece except the two kings"
          >
            <Eraser size={11} /> Clear board
          </button>
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-1.5 rounded-md border border-line bg-surface-2 p-2">
        <div className="text-[11px] font-semibold text-muted">Piece palette</div>
        <div className="grid grid-cols-6 gap-1">
          {palette.map((piece) => {
            const active = armedPiece !== null && armedPiece.type === piece.type && armedPiece.color === piece.color
            return (
              <button
                key={`${piece.color}${piece.type}`}
                type="button"
                data-testid={`study-palette-${piece.color}${piece.type}`}
                disabled={hasMoves}
                onClick={() => onArm(active ? null : piece)}
                className={`no-drag flex aspect-square items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  active ? 'border-accent bg-surface' : 'border-line bg-surface hover:border-accent'
                }`}
                title={`${piece.color === 'w' ? 'White' : 'Black'} ${piece.type}`}
              >
                <PieceSymbol type={piece.type} color={piece.color} size={28} />
              </button>
            )
          })}
        </div>
        <button
          type="button"
          data-testid="study-palette-eraser"
          disabled={hasMoves}
          onClick={() => onArm(armed === 'eraser' ? null : 'eraser')}
          className={`${actionButton} ${armed === 'eraser' ? 'border-accent text-text' : ''}`}
          title="Click a piece on the board to remove it (kings stay)"
        >
          <Eraser size={11} /> Eraser
        </button>
        <div data-testid="study-armed-hint" className="text-[10px] leading-snug text-muted">
          {armed === 'eraser'
            ? 'Click a piece on the board to remove it. Kings cannot be removed. Press Esc to stop.'
            : armedPiece
              ? 'Click a square on the board to place the piece. Press Esc to stop.'
              : 'Pick a piece, then click squares on the board. Right-drag still draws arrows.'}
        </div>
      </div>

      <div data-testid="study-tablebase" className="flex shrink-0 flex-col gap-1.5 rounded-md border border-line bg-surface-2 p-2">
        <div className="flex items-center gap-1.5">
          <Database size={11} className="text-muted" />
          <span className="text-[11px] font-semibold text-muted">Tablebase</span>
          <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] text-muted">{TABLEBASE_MAX_PIECES}-piece</span>
          <div className="flex-1" />
          <button
            type="button"
            data-testid="study-tablebase-refresh"
            onClick={() => void tablebase.refresh()}
            disabled={!tablebase.eligible || tablebase.loading}
            className={actionButton}
            title="Refresh tablebase"
          >
            <RefreshCw size={11} />
          </button>
        </div>

        {!tablebase.eligible && (
          <div data-testid="study-tablebase-too-many" className="text-[10px] leading-snug text-muted">
            Tablebases cover up to {TABLEBASE_MAX_PIECES} pieces. This position has {tablebase.count}.
          </div>
        )}

        {tablebase.eligible && tablebase.error && (
          <div data-testid="study-tablebase-error" className="rounded-md border border-danger bg-surface px-2 py-1 text-[10px] leading-snug text-danger">
            {tablebase.error}
          </div>
        )}

        {tablebase.eligible && tablebase.loading && !tablebase.result && (
          <div data-testid="study-tablebase-loading" className="text-[10px] text-muted">
            Probing tablebase…
          </div>
        )}

        {tablebase.eligible && tablebase.result && (
          <>
            <div className="flex items-center gap-2 rounded-md border border-line bg-surface px-2 py-1.5">
              <span data-testid="study-tablebase-category" className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${tbTone}`}>
                {categoryLabel(tablebase.result.category)}
              </span>
              <span className="text-[10px] text-muted">for {parts.turn === 'w' ? 'White' : 'Black'}</span>
              <div className="flex-1" />
              <span data-testid="study-tablebase-dtz" className="font-mono text-[10px] text-muted">
                DTZ {tablebase.result.dtz ?? '—'}
              </span>
              <span data-testid="study-tablebase-dtm" className="font-mono text-[10px] text-muted">
                DTM {tablebase.result.dtm ?? '—'}
              </span>
            </div>
            <div data-testid="study-tablebase-moves" className="flex flex-col gap-1">
              {tablebase.result.moves.length === 0 && (
                <div data-testid="study-tablebase-empty" className="px-1 py-1 text-[10px] text-muted">
                  No legal moves — game over.
                </div>
              )}
              {sortedMoves(tablebase.result)
                .slice(0, 8)
                .map((move) => {
                  const dtm = move.dtm === null ? '—' : -move.dtm
                  return (
                  <button
                    key={move.uci}
                    type="button"
                    data-testid="study-tablebase-move"
                    data-uci={move.uci}
                    onClick={() => onPlayMove(move.uci)}
                    title={`${move.san}: ${categoryLabel(invertCategory(move.category))} for the mover, DTM ${dtm}`}
                    className="no-drag flex items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-left transition-colors hover:border-accent hover:bg-surface"
                  >
                    <span className="w-12 shrink-0 text-[11px] font-semibold">{move.san}</span>
                    <span className="w-20 shrink-0 text-[10px] text-muted">{categoryLabel(invertCategory(move.category))}</span>
                    {move.checkmate && <span className="shrink-0 text-[10px] font-semibold text-accent">#</span>}
                    <div className="flex-1" />
                    <span className="shrink-0 font-mono text-[10px] text-muted">DTM {dtm}</span>
                  </button>
                  )
                })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}