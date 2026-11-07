import { Chess } from 'chess.js'

const HEADER_LINE = /^\[[A-Za-z0-9_]+\s+"(?:[^"\\]|\\.)*"\s*\]\s*$/
const HEADER_PAIR = /^\[([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]/

export type PgnSummary = { headers: Record<string, string>; plies: number }

export function pgnHeaders(text: string): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    const match = HEADER_PAIR.exec(line)
    if (match) headers[match[1]] = match[2].replace(/\\(.)/g, '$1')
    else if (line.length > 0) break
  }
  return headers
}

export function pgnSummary(text: string): PgnSummary {
  const chess = new Chess()
  try {
    chess.loadPgn(text, { strict: false })
  } catch (error) {
    throw new Error(`PGN could not be parsed: ${error instanceof Error ? error.message : String(error)}`)
  }
  const plies = chess.history().length
  if (plies === 0) throw new Error('PGN has no playable moves')
  return { headers: pgnHeaders(text), plies }
}

export function splitPgnGames(text: string): string[] {
  const games: string[] = []
  let current: string[] = []
  let hasMoves = false
  let commentDepth = 0

  const flush = (): void => {
    const body = current.join('\n').trim()
    if (body) games.push(body)
    current = []
    hasMoves = false
  }

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    const isHeader = commentDepth === 0 && HEADER_LINE.test(line)
    if (isHeader && hasMoves) flush()
    current.push(line)
    if (isHeader) continue

    for (const char of line) {
      if (commentDepth > 0) {
        if (char === '{') commentDepth += 1
        else if (char === '}') commentDepth -= 1
        continue
      }
      if (char === '{') commentDepth += 1
      else if (char.trim().length > 0) hasMoves = true
    }
  }

  flush()
  return games
}