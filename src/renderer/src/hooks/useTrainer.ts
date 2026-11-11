import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { duePuzzles, type AddPuzzlesResult, type PuzzleDraft, type TrainerPuzzle } from '@shared/trainer'
import type { Arrow } from './useChessGame.ts'

function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
}

export default function useTrainer() {
  const [puzzles, setPuzzles] = useState<TrainerPuzzle[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [hint, setHint] = useState<Arrow | null>(null)
  const hintTimer = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    try {
      setPuzzles(await window.studio.trainer.list())
      setError(null)
    } catch (caught) {
      setError(cleanError(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    return () => {
      if (hintTimer.current !== null) window.clearTimeout(hintTimer.current)
    }
  }, [])

  const due = useMemo(() => duePuzzles(puzzles), [puzzles])

  const saveMistakes = useCallback(
    async (drafts: PuzzleDraft[]): Promise<AddPuzzlesResult | null> => {
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        const result = await window.studio.trainer.add(drafts)
        const added = result.added.length
        setNotice(
          added === 0
            ? result.duplicates === 1
              ? 'That mistake is already in the trainer'
              : `All ${result.duplicates} mistakes are already in the trainer`
            : `${added} puzzle${added === 1 ? '' : 's'} added${result.duplicates > 0 ? ` · ${result.duplicates} already saved` : ''}`
        )
        await refresh()
        return result
      } catch (caught) {
        setError(cleanError(caught))
        return null
      } finally {
        setBusy(false)
      }
    },
    [refresh]
  )

  const attempt = useCallback(
    async (id: string, solved: boolean): Promise<TrainerPuzzle | null> => {
      try {
        const updated = await window.studio.trainer.attempt(id, solved)
        await refresh()
        return updated
      } catch (caught) {
        setError(cleanError(caught))
        return null
      }
    },
    [refresh]
  )

  const remove = useCallback(
    async (id: string) => {
      try {
        await window.studio.trainer.remove(id)
        await refresh()
      } catch (caught) {
        setError(cleanError(caught))
      }
    },
    [refresh]
  )

  const clear = useCallback(async () => {
    try {
      await window.studio.trainer.clear()
      setNotice('Trainer cleared')
      await refresh()
    } catch (caught) {
      setError(cleanError(caught))
    }
  }, [refresh])

  const showHint = useCallback((from: string, to: string) => {
    setHint({ from, to, color: 'green' })
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => setHint(null), 3000)
  }, [])

  const clearHint = useCallback(() => {
    setHint(null)
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current)
    hintTimer.current = null
  }, [])

  return {
    puzzles,
    due,
    loading,
    busy,
    error,
    notice,
    refresh,
    saveMistakes,
    attempt,
    remove,
    clear,
    hint,
    showHint,
    clearHint
  }
}

export type Trainer = ReturnType<typeof useTrainer>
