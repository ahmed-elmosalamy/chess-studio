import { Chess } from 'chess.js'
import type { BookBlock, SanToken } from '@shared/book'
import { START_FEN, type MoveCandidate, scanMoveCandidates } from './parseText.ts'
import { slotVariants } from './moveSlots.ts'

/** Every well-formed reading of a damaged token; the position decides which one is real. */
export function repairVariants(raw: string): string[] {
  return slotVariants(raw)
}

export function isValidFen(fen: string): boolean {
  try {
    new Chess(fen)
    return true
  } catch {
    return false
  }
}

export type AnchorStats = { sequences: number; accepted: number; repaired: number; ambiguous: number; unfixable: number }

export type AnchorReplay = { tokens: SanToken[]; fen: string; stats: AnchorStats }

const emptyStats = (): AnchorStats => ({ sequences: 0, accepted: 0, repaired: 0, ambiguous: 0, unfixable: 0 })

/** The one legal move the corrupted san can mean, or why it cannot be trusted. */
function uniqueReading(chess: Chess, raw: string): { san: string; repaired: boolean } | 'ambiguous' | null {
  const found: { san: string; key: string; repaired: boolean }[] = []
  for (const candidate of repairVariants(raw)) {
    try {
      const move = chess.move(candidate)
      const key = `${move.from}${move.to}${move.promotion ?? ''}`
      chess.undo()
      if (!found.some((entry) => entry.key === key)) found.push({ san: move.san, key, repaired: candidate !== raw })
    } catch {
      // this reading is not legal from this position
    }
  }
  if (found.length === 0) return null
  if (found.length > 1) return 'ambiguous'
  return found[0]
}

export function replayAnchored(candidates: MoveCandidate[], startFen: string): AnchorReplay {
  const chess = new Chess(isValidFen(startFen) ? startFen : START_FEN)
  const tokens: SanToken[] = []
  const stats = emptyStats()

  for (const candidate of candidates) {
    const before = { moveNumber: candidate.moveNumber, color: candidate.color, variationDepth: candidate.variationDepth }
    const flag = (why: 'ambiguous' | 'unfixable'): void => {
      tokens.push({ ...before, san: candidate.san, fenAfter: chess.fen(), flagged: true })
      stats[why] += 1
    }
    if (candidate.color && candidate.color !== chess.turn()) {
      flag('unfixable')
      continue
    }
    const reading = uniqueReading(chess, candidate.san)
    if (reading === 'ambiguous') flag('ambiguous')
    else if (reading === null) flag('unfixable')
    else {
      const move = chess.move(reading.san)
      stats.accepted += 1
      if (reading.repaired) stats.repaired += 1
      tokens.push({ ...before, san: reading.san, color: move.color, fenAfter: chess.fen(), repaired: reading.repaired || undefined })
    }
  }

  return { tokens, fen: chess.fen(), stats }
}

export function applyAnchors(blocks: BookBlock[], anchors: Record<string, string>): { blocks: BookBlock[]; stats: AnchorStats } {
  const total = emptyStats()
  let cursor = START_FEN

  const rebuilt = blocks.map((block) => {
    if (block.kind !== 'moves') return block
    const candidates = scanMoveCandidates(block.text, true)
    if (candidates.length === 0) return block

    const restarts = candidates.some((candidate) => candidate.explicit && candidate.moveNumber === 1 && candidate.color === 'w')
    const anchor = anchors[block.id]
    const start = anchor && isValidFen(anchor) ? anchor : restarts ? START_FEN : cursor
    const replayed = replayAnchored(candidates, start)

    cursor = replayed.fen
    total.sequences += 1
    total.accepted += replayed.stats.accepted
    total.repaired += replayed.stats.repaired
    total.ambiguous += replayed.stats.ambiguous
    total.unfixable += replayed.stats.unfixable
    return { ...block, moves: replayed.tokens }
  })

  return { blocks: rebuilt, stats: total }
}
