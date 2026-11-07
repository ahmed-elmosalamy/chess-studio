import type { TablebaseResult } from '../../shared/tablebase.ts'

const BASE = 'https://tablebase.lichess.ovh/standard'
const USER_AGENT = 'ChessStudio (desktop chess study app)'
const TIMEOUT_MS = 20000

export async function fetchTablebase(fen: string, fetchImpl: typeof fetch = fetch): Promise<TablebaseResult> {
  const url = `${BASE}?fen=${encodeURIComponent(fen)}`

  let response: Response
  try {
    response = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error(`Lichess tablebase timed out after ${TIMEOUT_MS / 1000}s`)
    if (error instanceof TypeError) throw new Error('Could not reach Lichess tablebase. Check your connection.')
    throw error instanceof Error ? error : new Error(String(error))
  }

  if (response.status === 404) throw new Error('Position is not in the 7-piece tablebase.')
  if (response.status === 429) throw new Error('Lichess tablebase rate limit reached. Try again shortly.')
  if (!response.ok) throw new Error(`Lichess tablebase returned HTTP ${response.status}`)

  const body = (await response.json()) as TablebaseResult
  if (typeof body.category !== 'string' || !Array.isArray(body.moves)) {
    throw new Error('Lichess tablebase returned an unexpected response.')
  }
  return body
}