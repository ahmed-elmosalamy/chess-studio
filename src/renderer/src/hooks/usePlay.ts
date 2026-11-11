import { useCallback, useEffect, useRef, useState } from 'react'
import { chooseEngineMove, DEFAULT_PLAY_LEVEL, settingsForLevel, timeControlSpec, type TimeControlId } from '@shared/play'
import { applyMove, createClock, flagged, tick, type Clock } from '../chess/clock.ts'
import SearchQueue from '../engine/searchQueue.ts'
import type { Arrow, ChessGame } from './useChessGame.ts'
import type useEngine from './useEngine.ts'
import type useReview from './useReview.ts'
import type { Color } from 'chess.js'

type Props = {
  game: ChessGame
  engine: ReturnType<typeof useEngine>
  review: ReturnType<typeof useReview>
}

export type PlayStartOptions = {
  color: Color | 'random'
  level: number
  timeControl: TimeControlId
}

const ENGINE_DELAY_MS = 250
const TICK_MS = 250
const HINT_DEPTH = 12

function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
}

export default function usePlay({ game, engine, review }: Props) {
  const [active, setActive] = useState(false)
  const [playerColor, setPlayerColor] = useState<Color>('w')
  const [level, setLevel] = useState(DEFAULT_PLAY_LEVEL)
  const [timeControl, setTimeControl] = useState<TimeControlId>('none')
  const [clock, setClock] = useState<Clock | null>(null)
  const [thinking, setThinking] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<Arrow | null>(null)
  const [session, setSession] = useState(0)

  const requestMoveRef = useRef(game.requestMove)
  requestMoveRef.current = game.requestMove
  const turnRef = useRef(game.turn)
  turnRef.current = game.turn
  const plyRef = useRef(game.ply)
  const hintTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (hintTimer.current !== null) window.clearTimeout(hintTimer.current)
    }
  }, [])

  // Stockfish answers whenever it is its turn and the game is still live.
  useEffect(() => {
    if (!active || result || game.turn === playerColor) return

    const fen = game.fen
    let cancelled = false
    let queue: SearchQueue | null = null

    const timer = window.setTimeout(() => {
      const settings = { ...engine.settings, ...settingsForLevel(level) }
      queue = new SearchQueue(engine.source, settings)
      setThinking(true)
      setError(null)
      void queue
        .search(fen)
        .then((lines) => {
          if (cancelled) return
          const move = chooseEngineMove(lines, level)
          if (!move || move.length < 4) {
            setError('Stockfish returned no move for this position.')
            return
          }
          requestMoveRef.current(move.slice(0, 2), move.slice(2, 4), (move[4] as 'q' | 'r' | 'b' | 'n') || undefined)
        })
        .catch((reason: unknown) => {
          if (!cancelled) setError(cleanError(reason))
        })
        .finally(() => {
          if (!cancelled) setThinking(false)
          queue?.dispose()
          queue = null
        })
    }, ENGINE_DELAY_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      queue?.dispose()
      setThinking(false)
    }
  }, [active, engine.settings, engine.source, game.fen, game.turn, level, playerColor, result, session])

  // Elapsed time follows the side to move; the ref keeps the interval from restarting every tick.
  useEffect(() => {
    if (!active || result) return
    let last = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const elapsed = now - last
      last = now
      setClock((current) => tick(current, elapsed, turnRef.current))
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [active, result])

  // Increment goes to the side that just moved, identified by the flipped side to move.
  useEffect(() => {
    if (game.ply === plyRef.current + 1) {
      if (active) setClock((current) => applyMove(current, game.turn === 'w' ? 'b' : 'w'))
    }
    plyRef.current = game.ply
  }, [active, game.ply, game.turn])

  useEffect(() => {
    if (!active || result) return
    const side = flagged(clock)
    if (!side) return
    setResult(side === playerColor ? 'You flagged' : 'You win on time')
  }, [active, clock, playerColor, result])

  useEffect(() => {
    if (!active || result) return
    if (game.positionStatus === 'Checkmate') {
      setResult(game.turn === playerColor ? 'Stockfish wins' : 'You win')
      return
    }
    if (['Stalemate', 'Draw by repetition', 'Draw, insufficient material', 'Draw'].includes(game.positionStatus)) {
      setResult('Draw')
    }
  }, [active, game.positionStatus, game.turn, playerColor, result])

  const start = useCallback(
    (options: PlayStartOptions) => {
      const color: Color = options.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : options.color
      const control = timeControlSpec(options.timeControl)

      review.clear()
      engine.disable()
      setHint(null)
      setThinking(false)
      setError(null)
      setResult(null)
      setLevel(options.level)
      setTimeControl(options.timeControl)
      setPlayerColor(color)
      setClock(control.minutes > 0 ? createClock(control.minutes, control.increment) : null)
      plyRef.current = 0
      setActive(true)
      setSession((count) => count + 1)
      game.newGame()
      game.setHeaders(
        color === 'w'
          ? { White: 'You', Black: 'Stockfish', Event: 'Play vs Stockfish', Result: '*' }
          : { White: 'Stockfish', Black: 'You', Event: 'Play vs Stockfish', Result: '*' }
      )
    },
    [engine, game, review]
  )

  const stop = useCallback(() => {
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current)
    hintTimer.current = null
    setHint(null)
    setThinking(false)
    setActive(false)
    setResult(null)
    setClock(null)
  }, [])

  const resign = useCallback(() => {
    if (!active || result) return
    setResult('You resigned')
  }, [active, result])

  const undo = useCallback(() => {
    if (!active || result || game.turn !== playerColor || game.ply < 2) return
    game.step('prev')
    game.step('prev')
    setHint(null)
  }, [active, game, playerColor, result])

  const requestHint = useCallback(async () => {
    if (!active || result || game.turn !== playerColor) return
    const fen = game.fen
    const queue = new SearchQueue(engine.source, { ...engine.settings, depth: HINT_DEPTH, multipv: 1 })
    setError(null)
    try {
      const lines = await queue.search(fen)
      const move = lines.find((line) => line.multipv === 1)?.pv[0] ?? lines[0]?.pv[0]
      if (!move || move.length < 4) return
      setHint({ from: move.slice(0, 2), to: move.slice(2, 4), color: 'blue' })
      if (hintTimer.current !== null) window.clearTimeout(hintTimer.current)
      hintTimer.current = window.setTimeout(() => setHint(null), 3000)
    } catch (reason) {
      setError(cleanError(reason))
    } finally {
      queue.dispose()
    }
  }, [active, result, game.turn, game.fen, engine.source, engine.settings, playerColor])

  return {
    active,
    playerColor,
    level,
    setLevel,
    timeControl,
    clock,
    thinking,
    result,
    error,
    hint,
    start,
    stop,
    resign,
    undo,
    requestHint
  }
}

export type Play = ReturnType<typeof usePlay>
