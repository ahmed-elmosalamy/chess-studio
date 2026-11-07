import type { EvalLine, EngineScore } from './engine'

export function parseInfo(line: string): EvalLine | null {
  if (!line.startsWith('info ') || !line.includes(' pv ')) return null

  const tokens = line.slice(5).trim().split(/\s+/)
  let multipv = 1
  let depth = 0
  let seldepth = 0
  let score: EngineScore | null = null
  let nodes = 0
  let nps = 0
  let timeMs = 0
  let pv: string[] = []

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const value = tokens[index + 1]
    if (!value) break

    switch (token) {
      case 'multipv':
        multipv = Number(value)
        index += 1
        break
      case 'depth':
        depth = Number(value)
        index += 1
        break
      case 'seldepth':
        seldepth = Number(value)
        index += 1
        break
      case 'nodes':
        nodes = Number(value)
        index += 1
        break
      case 'nps':
        nps = Number(value)
        index += 1
        break
      case 'time':
        timeMs = Number(value)
        index += 1
        break
      case 'score': {
        const type = value
        const raw = Number(tokens[index + 2])
        if ((type === 'cp' || type === 'mate') && Number.isFinite(raw)) score = { type, value: raw }
        index += 2
        break
      }
      case 'pv':
        pv = tokens.slice(index + 1)
        index = tokens.length
        break
      default:
        break
    }
  }

  if (!score) return null

  return { multipv, depth, seldepth, score, nodes, nps, time: timeMs, pv }
}

export function parseIdName(line: string): string | null {
  const match = /^id name (.+)$/.exec(line)
  return match ? match[1] : null
}

export function parseBestmove(line: string): string | null {
  const match = /^bestmove (\S+)/.exec(line)
  return match ? match[1] : null
}

export function formatScore(score: EngineScore | null, perspective: 'white' | 'black'): string {
  if (!score) return '—'
  if (score.type === 'mate') {
    const value = perspective === 'black' ? -score.value : score.value
    return `${value > 0 ? '+' : '-'}M${Math.abs(value)}`
  }
  const cp = perspective === 'black' ? -score.value : score.value
  return `${cp > 0 ? '+' : cp < 0 ? '-' : ''}${(Math.abs(cp) / 100).toFixed(2)}`
}

export function winChance(score: EngineScore | null): number {
  if (!score) return 50
  if (score.type === 'mate') return score.value > 0 ? 100 : 0
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * score.value)) - 1)
}
