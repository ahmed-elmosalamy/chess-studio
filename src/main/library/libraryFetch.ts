import type { FetchReport, FetchRequest, FetchedGame, SkippedGame } from '../../shared/library.ts'
import { pgnSummary, splitPgnGames } from '../../shared/pgn.ts'

const USER_AGENT = 'ChessStudio (desktop chess study app)'
const TIMEOUT_MS = 20000
const USERNAME_PATTERN = /^[A-Za-z0-9_-]{1,40}$/
const GAME_ID_PATTERN = /^[A-Za-z0-9]{8}$/
const MAX_GAMES = 50
const MAX_ARCHIVES = 12

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function request(fetchImpl: typeof fetch, url: string, accept: string): Promise<Response> {
  let response: Response
  try {
    response = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: accept },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error(`${url} timed out after ${TIMEOUT_MS / 1000}s`)
    throw error instanceof Error ? error : new Error(String(error))
  }
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  return response
}

function toGame(pgn: string): FetchedGame {
  const { headers, plies } = pgnSummary(pgn)
  return {
    pgn,
    white: headers['White'] ?? '?',
    black: headers['Black'] ?? '?',
    event: headers['Event'] ?? '?',
    date: headers['Date'] ?? '????.??.??',
    result: headers['Result'] ?? '*',
    plies
  }
}

function summarize(pgns: string[], skipped: SkippedGame[]): FetchedGame[] {
  const games: FetchedGame[] = []
  pgns.forEach((pgn, index) => {
    try {
      games.push(toGame(pgn))
    } catch (error) {
      skipped.push({ index, reason: messageOf(error) })
    }
  })
  return games
}

async function chessCom(username: string, max: number, fetchImpl: typeof fetch): Promise<FetchReport> {
  const base = `https://api.chess.com/pub/player/${username}/games`
  const archiveList = (await (await request(fetchImpl, `${base}/archives`, 'application/json')).json()) as { archives?: string[] }
  const urls = Array.isArray(archiveList.archives) ? archiveList.archives.slice(-MAX_ARCHIVES).reverse() : []

  const skipped: SkippedGame[] = []
  const games: FetchedGame[] = []
  const used: string[] = []
  for (const url of urls) {
    if (games.length >= max) break
    const month = (await (await request(fetchImpl, url, 'application/json')).json()) as { games?: { pgn?: string }[] }
    used.push(url.slice(-7))
    const pgns = (month.games ?? []).map((game) => game.pgn ?? '')
    /* Archives are oldest-first inside each month; walk backwards so "last games" means most recent. */
    for (let index = pgns.length - 1; index >= 0 && games.length < max; index -= 1) {
      try {
        games.push(toGame(pgns[index]))
      } catch (error) {
        skipped.push({ index, reason: messageOf(error) })
      }
    }
  }
  return { source: `chess.com/${username} (${used.join(', ') || 'no games'})`, games, skipped }
}

async function lichessUser(username: string, max: number, fetchImpl: typeof fetch): Promise<FetchReport> {
  const url = `https://lichess.org/api/games/user/${username}?max=${max}&moves=true&tags=true`
  const text = await (await request(fetchImpl, url, 'application/x-chess-pgn')).text()
  const skipped: SkippedGame[] = []
  const games = summarize(splitPgnGames(text), skipped)
  return { source: `lichess.org/${username}`, games: games.slice(0, max), skipped }
}

async function lichessGame(gameId: string, fetchImpl: typeof fetch): Promise<FetchReport> {
  const url = `https://lichess.org/game/export/${gameId}`
  const text = await (await request(fetchImpl, url, 'application/x-chess-pgn')).text()
  const skipped: SkippedGame[] = []
  return { source: url, games: summarize(splitPgnGames(text), skipped), skipped }
}

export async function fetchGames(request: FetchRequest, fetchImpl: typeof fetch = fetch): Promise<FetchReport> {
  const max = Math.min(Math.max(Math.trunc(('max' in request ? request.max : 10) || 10), 1), MAX_GAMES)

  if (request.provider === 'chesscom' || request.provider === 'lichess') {
    const username = request.username.trim()
    if (!USERNAME_PATTERN.test(username)) throw new Error(`Invalid username: ${request.username}`)
    return request.provider === 'chesscom' ? chessCom(username, max, fetchImpl) : lichessUser(username, max, fetchImpl)
  }

  if (request.provider === 'lichess-game') {
    if (!GAME_ID_PATTERN.test(request.gameId)) throw new Error(`Invalid game id: ${request.gameId}`)
    return lichessGame(request.gameId, fetchImpl)
  }

  throw new Error(`Unknown provider: ${String((request as { provider?: unknown }).provider)}`)
}