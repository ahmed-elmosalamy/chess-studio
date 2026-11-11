import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { pieceCount, TABLEBASE_MAX_PIECES, type TablebaseResult } from '@shared/tablebase'
import type { ChessGame } from './useChessGame.ts'

function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
}

export default function useTablebase(game: ChessGame, enabled: boolean) {
  const [result, setResult] = useState<TablebaseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  const fen = game.fen
  const count = useMemo(() => pieceCount(fen), [fen])
  const eligible = count <= TABLEBASE_MAX_PIECES

  const refresh = useCallback(async () => {
    const request = ++requestRef.current
    if (!enabled || !eligible) {
      setResult(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const next = await window.studio.tablebase.query({ fen })
      if (request !== requestRef.current) return
      setResult(next)
    } catch (caught) {
      if (request !== requestRef.current) return
      setError(cleanError(caught))
      setResult(null)
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }, [enabled, eligible, fen])

  useEffect(() => {
    if (!enabled || !eligible) {
      setResult(null)
      setError(null)
      setLoading(false)
      return
    }
    setResult(null)
    setError(null)
    setLoading(true)
    const timer = setTimeout(() => void refresh(), 350)
    return () => clearTimeout(timer)
  }, [enabled, eligible, refresh])

  return { result, loading, error, count, eligible, refresh }
}

export type Tablebase = ReturnType<typeof useTablebase>