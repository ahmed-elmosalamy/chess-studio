import type { BookAnchors, BookBlock, SanToken } from '../../../shared/book.ts'
import { replayTokens, type MoveCandidate } from './parseText.ts'
import { isValidFen, type AnchorStats } from './anchorMoves.ts'

export type AiAnchorReport = { blocks: BookBlock[]; overridden: number; stats: AnchorStats }

const EMPTY_STATS: AnchorStats = { sequences: 0, accepted: 0, repaired: 0, ambiguous: 0, unfixable: 0 }

function toCandidate(token: SanToken): MoveCandidate {
  return { san: token.san, moveNumber: token.moveNumber, color: token.color, variationDepth: token.variationDepth, explicit: true }
}

const replayable = (tokens: SanToken[]): number => tokens.filter((token) => !token.flagged).length

/** A position set by hand replaces the model's FEN only when the whole line replays better from it. */
export function applyAiAnchors(blocks: BookBlock[], anchors: BookAnchors): AiAnchorReport {
  const stats: AnchorStats = { ...EMPTY_STATS }
  let overridden = 0

  const rebuilt = blocks.map((block) => {
    if (block.kind !== 'moves') return block
    const tokens = block.moves ?? []
    const anchor = anchors[block.id]
    const start = anchor && isValidFen(anchor) ? anchor : null
    const replayed = start && tokens.length > 0 ? replayTokens(tokens.map(toCandidate), start) : null
    const use = replayed && replayable(replayed.tokens) > replayable(tokens) ? replayed : null

    const chosen = use ? use.tokens : tokens
    stats.sequences += 1
    stats.accepted += replayable(chosen)
    stats.unfixable += chosen.length - replayable(chosen)

    if (!use || !start) return block
    overridden += 1
    const positionState: BookBlock['positionState'] = replayable(chosen) === chosen.length ? 'verified' : 'replay-failed'
    return { ...block, fen: start, positionState, moves: chosen }
  })

  return { blocks: rebuilt, overridden, stats }
}
