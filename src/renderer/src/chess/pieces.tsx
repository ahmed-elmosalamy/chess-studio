import type { PieceColor, PieceType } from './squares.ts'
import wK from '../assets/pieces/cburnett/wK.svg?raw'
import wQ from '../assets/pieces/cburnett/wQ.svg?raw'
import wR from '../assets/pieces/cburnett/wR.svg?raw'
import wB from '../assets/pieces/cburnett/wB.svg?raw'
import wN from '../assets/pieces/cburnett/wN.svg?raw'
import wP from '../assets/pieces/cburnett/wP.svg?raw'
import bK from '../assets/pieces/cburnett/bK.svg?raw'
import bQ from '../assets/pieces/cburnett/bQ.svg?raw'
import bR from '../assets/pieces/cburnett/bR.svg?raw'
import bB from '../assets/pieces/cburnett/bB.svg?raw'
import bN from '../assets/pieces/cburnett/bN.svg?raw'
import bP from '../assets/pieces/cburnett/bP.svg?raw'

function inner(svg: string): string {
  return svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
}

const art: Record<string, string> = {
  wK: inner(wK),
  wQ: inner(wQ),
  wR: inner(wR),
  wB: inner(wB),
  wN: inner(wN),
  wP: inner(wP),
  bK: inner(bK),
  bQ: inner(bQ),
  bR: inner(bR),
  bB: inner(bB),
  bN: inner(bN),
  bP: inner(bP)
}

const SCALE = 100 / 45

export default function PieceGlyph({ type, color }: { type: PieceType; color: PieceColor }) {
  return <g transform={`scale(${SCALE})`} dangerouslySetInnerHTML={{ __html: art[`${color}${type.toUpperCase()}`] }} />
}

export function PieceSymbol({ type, color, size = 44 }: { type: PieceType; color: PieceColor; size?: number }) {
  return <svg viewBox="0 0 45 45" width={size} height={size} aria-hidden="true" dangerouslySetInnerHTML={{ __html: art[`${color}${type.toUpperCase()}`] }} />
}