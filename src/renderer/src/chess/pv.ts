import { Chess } from 'chess.js'

export type PvArrow = { from: string; to: string; capture: boolean }

export type PvStep = { san: string; arrow: PvArrow }

export function pvSteps(fen: string, pv: string[], limit = 6): PvStep[] {
  const chess = new Chess(fen)
  const steps: PvStep[] = []

  for (const move of pv.slice(0, limit)) {
    let played
    try {
      played = chess.move(move, { strict: false })
    } catch {
      break
    }
    if (!played) break
    steps.push({ san: played.san, arrow: { from: played.from, to: played.to, capture: played.flags.includes('c') || played.flags.includes('e') } })
  }

  return steps
}
