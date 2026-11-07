import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlacementPiece } from '@shared/fen'
import PieceGlyph, { PieceSymbol } from '../../chess/pieces.tsx'
import { BOARD_UNITS, FILES, SQUARE_UNITS, screenToSquare, squareToScreen, isLightSquare, allSquares, type SquareName } from '../../chess/squares.ts'
import AnnotationCanvas, { arrowColorFor } from './AnnotationCanvas.tsx'
import type { Arrow } from '../../hooks/useChessGame.ts'
import type { ChessGame } from '../../hooks/useChessGame.ts'

const squares = allSquares()
const promotionChoices: ('q' | 'r' | 'b' | 'n')[] = ['q', 'r', 'b', 'n']

type DragState = { from: SquareName; startX: number; startY: number; x: number; y: number; active: boolean }

export type Placement = { piece: PlacementPiece | null; onPlace: (square: SquareName) => void }

export default function ChessBoard({ game, pvArrows, placement }: { game: ChessGame; pvArrows?: Arrow[]; placement?: Placement }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(520)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [arrowPreview, setArrowPreview] = useState<Arrow | null>(null)

  const { flipped, selected, turn, arrows, highlighted, legalTargets, lastMove, checkSquare, pendingPromotion } = game

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width
      if (width > 0) setSize(width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const pieceMap = useMemo(() => {
    const map = new Map<string, { type: string; color: 'w' | 'b' }>()
    for (const piece of game.boardPieces) map.set(piece.square, { type: piece.type, color: piece.color })
    return map
  }, [game.boardPieces])

  const squareAtClient = useCallback(
    (clientX: number, clientY: number): SquareName | null => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return null
      const col = Math.min(7, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * 8)))
      const row = Math.min(7, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * 8)))
      return screenToSquare(col, row, flipped)
    },
    [flipped]
  )

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const square = squareAtClient(event.clientX, event.clientY)
    if (!square) return
    event.currentTarget.setPointerCapture(event.pointerId)

    if (event.button === 2) {
      setArrowPreview({ from: square, to: square, color: arrowColorFor({ shift: event.shiftKey, alt: event.altKey, ctrl: event.ctrlKey }) })
      return
    }

    if (event.button !== 0) return

    if (event.altKey) {
      game.addHighlight(square)
      return
    }

    if (placement) {
      placement.onPlace(square)
      return
    }

    const piece = pieceMap.get(square)
    game.pointerToSquare(square)

    if (piece && piece.color === turn && !pendingPromotion) {
      setDrag({ from: square, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false })
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (arrowPreview) {
      const square = squareAtClient(event.clientX, event.clientY)
      if (square && square !== arrowPreview.to) setArrowPreview({ ...arrowPreview, to: square })
      return
    }

    if (!drag) return
    const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > SQUARE_UNITS / 100 * 6
    setDrag({ ...drag, x: event.clientX, y: event.clientY, active: drag.active || moved })
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (arrowPreview) {
      const target = squareAtClient(event.clientX, event.clientY)
      if (target && target !== arrowPreview.from) game.addArrow({ ...arrowPreview, to: target })
      setArrowPreview(null)
      return
    }

    if (!drag) return
    const target = squareAtClient(event.clientX, event.clientY)
    if (drag.active && target && target !== drag.from) game.requestMove(drag.from, target)
    setDrag(null)
  }

  const dragPiece = drag?.active ? pieceMap.get(drag.from) : null
  const rect = containerRef.current?.getBoundingClientRect()
  const ghost = dragPiece && rect ? { x: drag!.x - rect.left, y: drag!.y - rect.top } : null

  return (
    <div
      ref={containerRef}
      data-testid="board"
      className={`relative h-full w-full touch-none select-none overflow-hidden rounded-lg border border-line ${placement ? 'cursor-copy' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        setDrag(null)
        setArrowPreview(null)
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <svg viewBox={`0 0 ${BOARD_UNITS} ${BOARD_UNITS}`} className="absolute inset-0 h-full w-full" aria-label="Chess board">
        {squares.map((square) => {
          const { col, row } = squareToScreen(square, flipped)
          return (
            <rect
              key={square}
              x={col * SQUARE_UNITS}
              y={row * SQUARE_UNITS}
              width={SQUARE_UNITS}
              height={SQUARE_UNITS}
              fill={isLightSquare(square) ? 'var(--square-light)' : 'var(--square-dark)'}
            />
          )
        })}

        {lastMove &&
          [lastMove.from, lastMove.to].map((square) => {
            const { col, row } = squareToScreen(square, flipped)
            return (
              <rect key={`last-${square}`} x={col * SQUARE_UNITS} y={row * SQUARE_UNITS} width={SQUARE_UNITS} height={SQUARE_UNITS} fill="var(--highlight-last)" />
            )
          })}

        {selected &&
          (() => {
            const { col, row } = squareToScreen(selected, flipped)
            return <rect x={col * SQUARE_UNITS} y={row * SQUARE_UNITS} width={SQUARE_UNITS} height={SQUARE_UNITS} fill="var(--highlight-select)" />
          })()}

        {checkSquare &&
          (() => {
            const { col, row } = squareToScreen(checkSquare, flipped)
            return <rect x={col * SQUARE_UNITS} y={row * SQUARE_UNITS} width={SQUARE_UNITS} height={SQUARE_UNITS} fill="var(--highlight-check)" />
          })()}

        {game.boardPieces
          .filter((piece) => !(drag && piece.square === drag.from))
          .map((piece) => {
            const { col, row } = squareToScreen(piece.square, flipped)
            return (
              <g key={`${piece.square}-${piece.color}-${piece.type}`} transform={`translate(${col * SQUARE_UNITS} ${row * SQUARE_UNITS})`}>
                <PieceGlyph type={piece.type as never} color={piece.color} />
              </g>
            )
          })}

        {legalTargets.map(({ to, capture }) => {
          const { col, row } = squareToScreen(to, flipped)
          const cx = col * SQUARE_UNITS + SQUARE_UNITS / 2
          const cy = row * SQUARE_UNITS + SQUARE_UNITS / 2
          return capture ? (
            <circle key={`cap-${to}`} cx={cx} cy={cy} r={SQUARE_UNITS * 0.46} fill="none" stroke="var(--hint-capture)" strokeWidth={SQUARE_UNITS * 0.09} />
          ) : (
            <circle key={`dot-${to}`} cx={cx} cy={cy} r={SQUARE_UNITS * 0.16} fill="var(--hint-quiet)" />
          )
        })}

        {ghost && dragPiece && (
          <g transform={`translate(${(ghost.x / size) * BOARD_UNITS - SQUARE_UNITS / 2} ${(ghost.y / size) * BOARD_UNITS - SQUARE_UNITS / 2}) scale(1.08)`}>
            <PieceGlyph type={dragPiece.type as never} color={dragPiece.color} />
          </g>
        )}

        {FILES.map((file, col) => {
          const square = screenToSquare(col, 7, flipped) as string
          const onLight = isLightSquare(square)
          return (
            <text
              key={`file-${file}`}
              x={col * SQUARE_UNITS + 9}
              y={BOARD_UNITS - 10}
              className={`board-label ${onLight ? 'board-label-on-light' : 'board-label-on-dark'}`}
            >
              {file}
            </text>
          )
        })}

        {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => {
          const square = screenToSquare(0, row, flipped) as string
          const onLight = isLightSquare(square)
          return (
            <text
              key={`rank-${row}`}
              x={9}
              y={row * SQUARE_UNITS + SQUARE_UNITS - 10}
              className={`board-label ${onLight ? 'board-label-on-light' : 'board-label-on-dark'}`}
            >
              {square[1]}
            </text>
          )
        })}
      </svg>

      <AnnotationCanvas arrows={pvArrows ? [...arrows, ...pvArrows] : arrows} preview={arrowPreview} highlighted={highlighted} flipped={flipped} size={size} />

      {pendingPromotion &&
        (() => {
          const { col } = squareToScreen(pendingPromotion.to, flipped)
          const leftPercent = (col / 8) * 100
          const topPercent = pendingPromotion.color === 'w' ? (flipped ? 50 : 0) : flipped ? 0 : 50
          return (
            <div className="absolute z-10 flex flex-col rounded-md border border-line bg-surface shadow-lg" style={{ left: `${leftPercent}%`, top: `${topPercent}%`, width: '12.5%' }}>
              {promotionChoices.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className="flex items-center justify-center py-0.5 hover:bg-surface-3"
                  onClick={() => game.resolvePromotion(choice)}
                  title={choice}
                >
                  <PieceSymbol type={choice} color={pendingPromotion.color} size={40} />
                </button>
              ))}
            </div>
          )
        })()}
    </div>
  )
}
