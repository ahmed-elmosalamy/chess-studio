import { useMemo, useState } from 'react'
import { ClipboardCopy, Eraser, FlipHorizontal2, RotateCcw, Sparkles } from 'lucide-react'
import { variationRows } from '../chess/tree.ts'
import { glyphOf, nagTable, pgnFromTree } from '../chess/game.ts'
import { gradeMeta } from '@shared/review'
import GradeBadge from './GradeBadge.tsx'
import type { EvaluationParts } from '../chess/review.ts'
import type { ChessGame } from '../hooks/useChessGame.ts'

const iconButton =
  'flex h-7 items-center gap-1 rounded-md border border-line bg-surface-2 px-2 text-[11px] text-muted transition-colors hover:border-accent hover:text-text'

export default function MoveList({ game, grades }: { game: ChessGame; grades?: Record<string, EvaluationParts> }) {
  const rows = useMemo(() => variationRows(game.tree, game.rootId), [game.tree, game.rootId])
  const [copied, setCopied] = useState(false)

  const currentNode = game.tree[game.currentId]

  const copyPgn = () => {
    void navigator.clipboard.writeText(pgnFromTree(game.tree, game.rootId, game.headers))
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap gap-1.5">
        <button type="button" className={iconButton} onClick={game.loadDemo} title="Load demo game">
          <Sparkles size={12} /> Demo
        </button>
        <button type="button" className={iconButton} onClick={() => game.newGame()} title="Clear board">
          <RotateCcw size={12} /> New
        </button>
        <button type="button" className={iconButton} onClick={() => game.setFlipped(!game.flipped)} title="Flip board (F)">
          <FlipHorizontal2 size={12} /> Flip
        </button>
        <button type="button" className={iconButton} onClick={game.clearAnnotations} title="Remove arrows and highlights">
          <Eraser size={12} /> Marks
        </button>
        <button type="button" className={iconButton} onClick={copyPgn} title="Copy PGN to clipboard">
          <ClipboardCopy size={12} /> {copied ? 'Copied' : 'PGN'}
        </button>
      </div>

      <div data-testid="move-list" className="min-h-0 flex-1 overflow-y-auto rounded-md border border-line bg-surface-2 p-2 text-[12px] leading-6">
        {rows.length === 0 && (
          <div className="px-1 py-2 text-[11px] text-muted">
            No moves yet. Drag a piece or click a square, then click a destination. Arrow keys walk the game.
          </div>
        )}

        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5" style={{ paddingLeft: row.depth * 14 }}>
            {row.cells.map((cell, cellIndex) => {
              const isCurrent = cell.nodeId === game.currentId
              const number = cell.ply % 2 === 1 ? `${Math.ceil(cell.ply / 2)}.` : null
              const glyph = glyphOf(cell.nag)
              const review = grades?.[cell.nodeId]
              const grade = review ? gradeMeta[review.grade] : null
              const title = review
                ? review.grade === 'book'
                  ? 'Book · theory move'
                  : `${gradeMeta[review.grade].label} · accuracy ${review.accuracy} · ${review.beforeLabel} → ${review.afterLabel}`
                : undefined

              return (
                <span key={cell.nodeId} className="flex items-baseline">
                  {number && (cellIndex === 0 || row.depth === 0) && <span className="mr-0.5 text-[11px] text-muted">{number}</span>}
                  <button
                    type="button"
                    data-testid={grade ? `grade-${cell.ply}` : undefined}
                    title={title}
                    onClick={() => game.navigate(cell.nodeId)}
                    className={`rounded px-1 font-mono transition-colors ${
                      isCurrent ? 'bg-accent text-bg font-semibold' : 'hover:bg-surface-3'
                    }`}
                  >
                    {cell.san}
                    {review && (
                      <span className="ml-1 inline-block align-middle">
                        <GradeBadge grade={review.grade} />
                      </span>
                    )}
                    {glyph && <span className={`ml-0.5 ${isCurrent ? 'text-bg' : 'text-accent-soft'}`}>{glyph}</span>}
                    {cell.comment && <span className="ml-0.5 text-[9px] text-muted">{'●'}</span>}
                  </button>
                </span>
              )
            })}
          </div>
        ))}
      </div>

      <div className="shrink-0 rounded-md border border-line bg-surface p-2">
        <div className="mb-1 flex items-center justify-between text-2xs uppercase tracking-wide text-muted">
          <span>Annotation · ply {currentNode.ply}</span>
          <select
            value={currentNode.nag ?? ''}
            onChange={(event) => game.setNag(event.target.value || null)}
            className="rounded border border-line bg-surface-2 px-1 py-0.5 text-2xs normal-case text-text"
          >
            <option value="">no glyph</option>
            {nagTable.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.glyph} {entry.label}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={currentNode.comment}
          onChange={(event) => game.setComment(event.target.value)}
          rows={2}
          placeholder="Comment on this position"
          className="w-full resize-none rounded border border-line bg-surface-2 px-2 py-1 text-[11px] leading-relaxed text-text outline-none focus:border-accent"
        />
      </div>
    </div>
  )
}
