import type { ExplorerResult, OpeningsQuery } from '../../shared/openings.ts'

const BASE = 'https://explorer.lichess.org/masters'
const USER_AGENT = 'ChessStudio (desktop chess study app)'
const TIMEOUT_MS = 20000
const DEFAULT_MOVES = 12

export async function fetchOpening(query: OpeningsQuery, token: string, fetchImpl: typeof fetch = fetch): Promise<ExplorerResult> {
  if (!token.trim()) throw new Error('No Lichess token configured. Add a free personal token in Settings.')

  const url =
    `${BASE}?fen=${encodeURIComponent(query.fen)}` +
    `&play=${encodeURIComponent(query.play.join(','))}` +
    `&moves=${query.moves ?? DEFAULT_MOVES}&topGames=0`

  let response: Response
  try {
    response = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error(`Lichess explorer timed out after ${TIMEOUT_MS / 1000}s`)
    if (error instanceof TypeError) throw new Error('Could not reach Lichess explorer. Check your connection.')
    throw error instanceof Error ? error : new Error(String(error))
  }

  if (response.status === 401) throw new Error('Lichess token missing or invalid. Add a free personal token in Settings.')
  if (response.status === 429) throw new Error('Lichess explorer rate limit reached. Try again shortly.')
  if (!response.ok) throw new Error(`Lichess explorer returned HTTP ${response.status}`)

  const body = (await response.json()) as ExplorerResult
  if (!Array.isArray(body.moves) || typeof body.white !== 'number' || typeof body.draws !== 'number' || typeof body.black !== 'number') {
    throw new Error('Lichess explorer returned an unexpected response.')
  }
  return body
}