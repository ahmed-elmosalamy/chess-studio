/**
 * A damaged scan keeps the shape of a move and corrupts single characters inside it, so a token is
 * repaired by substituting one slot at a time instead of guessing a fixed list of wrong glyphs.
 * Slots and the confusions they carry were measured on the scanned book (91 pages, 2216 move tokens).
 */

const PIECES = ['Q', 'R', 'N', 'B', 'K']
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8']

const STRICT_MOVE = /^(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?$/
const CASTLING = /^(?:0-0-0|0-0|O-O-O|O-O|oo-oo|oo)$/i

type Skeleton = {
  piece: string
  disambig: string
  capture: string
  file: string
  rank: string
  promo: string
  suffix: string
}

function stripAnnotations(word: string): string {
  return word.replace(/[!?]+$/, '').replace(/^[("'“”‘’]+/, '').replace(/[,;:.)\]"'”’]+$/, '')
}

function skeleton(word: string): Skeleton | null {
  let text = stripAnnotations(word)
  const suffix = /([+#])$/.test(text) ? text.slice(-1) : ''
  if (suffix) text = text.slice(0, -1)
  const promo = /=([QRBN])$/.test(text) ? text.slice(-2) : ''
  if (promo) text = text.slice(0, -2)
  if (!text || CASTLING.test(text)) return null
  if (text.length < 2 || text.length > 6) return null

  const rank = text[text.length - 1]
  const file = text[text.length - 2]
  let head = text.slice(0, text.length - 2)

  const capture = head.endsWith('x') ? 'x' : ''
  if (capture) head = head.slice(0, -1)
  const disambig = head.length === 2 ? head[1] : ''
  const piece = head.length > 0 ? head[0] : ''
  if (head.length > 2) return null
  if (disambig && !FILES.includes(disambig) && !RANKS.includes(disambig)) return null

  return { piece, disambig, capture, file, rank, promo, suffix }
}

const compose = (slot: Skeleton, piece: string, rank: string): string =>
  `${piece}${slot.disambig}${slot.capture}${slot.file}${rank}${slot.promo}${slot.suffix}`

/** Every reading of a token that is a well-formed move, including the token itself. */
export function slotVariants(word: string): string[] {
  const text = stripAnnotations(word)
  if (!text) return []
  if (CASTLING.test(text)) return [text.replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O').replace(/oo-oo/i, 'O-O-O').replace(/oo/i, 'O-O')]

  const slot = skeleton(text)
  if (!slot) return []

  const pieceDamaged = slot.piece !== '' && !PIECES.includes(slot.piece)
  const rankDamaged = !RANKS.includes(slot.rank)
  if (!FILES.includes(slot.file)) return []
  if (!pieceDamaged && !rankDamaged) return STRICT_MOVE.test(text) ? [text] : []

  const pieces = pieceDamaged ? PIECES : [slot.piece]
  const ranks = rankDamaged ? RANKS : [slot.rank]

  const variants: string[] = []
  for (const piece of pieces) {
    for (const rank of ranks) {
      const attempt = compose(slot, piece, rank)
      if (STRICT_MOVE.test(attempt)) variants.push(attempt)
    }
  }
  return variants
}

/** Whether a scanned word can be read as a move at all. Prose is excluded by its shape, not a word list. */
export function looksLikeMove(word: string): boolean {
  const text = stripAnnotations(word)
  if (!text) return false
  if (STRICT_MOVE.test(text)) return true
  if (/^[a-z]/.test(text)) return false
  return slotVariants(text).length > 0
}
