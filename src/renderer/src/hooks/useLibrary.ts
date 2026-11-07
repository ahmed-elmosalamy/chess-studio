import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FetchReport, FetchRequest, LibraryEntry } from '@shared/library'

function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
}

export default function useLibrary() {
  const [entries, setEntries] = useState<LibraryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchReport, setFetchReport] = useState<FetchReport | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setEntries(await window.studio.library.list())
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

  const saveCurrent = useCallback(
    async (pgn: string) => {
      setBusy(true)
      setError(null)
      setWarnings([])
      setNotice(null)
      try {
        const entry = await window.studio.library.save(pgn)
        setNotice(`Saved ${entry.white} vs ${entry.black}`)
        await refresh()
      } catch (caught) {
        setError(cleanError(caught))
      } finally {
        setBusy(false)
      }
    },
    [refresh]
  )

  const importFiles = useCallback(async () => {
    setBusy(true)
    setError(null)
    setWarnings([])
    setNotice(null)
    try {
      const report = await window.studio.library.importFiles()
      if (report.cancelled) return
      const saved = report.files.reduce((total, file) => total + file.saved, 0)
      const skipped = report.files.flatMap((file) => file.skipped.map((game) => `${file.name}, game ${game.index + 1}: ${game.reason}`))
      setNotice(`${saved} game${saved === 1 ? '' : 's'} imported from ${report.files.length} file${report.files.length === 1 ? '' : 's'}`)
      setWarnings(skipped)
      await refresh()
    } catch (caught) {
      setError(cleanError(caught))
    } finally {
      setBusy(false)
    }
  }, [refresh])

  const removeGame = useCallback(
    async (id: string) => {
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        await window.studio.library.remove(id)
        setNotice('Game deleted')
        await refresh()
      } catch (caught) {
        setError(cleanError(caught))
      } finally {
        setBusy(false)
      }
    },
    [refresh]
  )

  const exportGame = useCallback(async (id: string) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const path = await window.studio.library.exportGame(id)
      if (path) setNotice(`Exported to ${path}`)
    } catch (caught) {
      setError(cleanError(caught))
    } finally {
      setBusy(false)
    }
  }, [])

  const readGame = useCallback(async (id: string): Promise<string | null> => {
    setBusy(true)
    setError(null)
    try {
      return await window.studio.library.read(id)
    } catch (caught) {
      setError(cleanError(caught))
      return null
    } finally {
      setBusy(false)
    }
  }, [])

  const fetchOnline = useCallback(async (request: FetchRequest) => {
    setFetching(true)
    setFetchError(null)
    setFetchReport(null)
    try {
      setFetchReport(await window.studio.library.fetchOnline(request))
    } catch (caught) {
      setFetchError(cleanError(caught))
    } finally {
      setFetching(false)
    }
  }, [])

  const saveFetched = useCallback(
    async (pgns: string[]) => {
      setBusy(true)
      setError(null)
      setWarnings([])
      setNotice(null)
      try {
        let saved = 0
        const skipped: string[] = []
        for (const [index, pgn] of pgns.entries()) {
          try {
            await window.studio.library.save(pgn)
            saved += 1
          } catch (caught) {
            skipped.push(`game ${index + 1}: ${cleanError(caught)}`)
          }
        }
        setNotice(`${saved} game${saved === 1 ? '' : 's'} saved to the library`)
        setWarnings(skipped)
        setFetchReport(null)
        await refresh()
      } catch (caught) {
        setError(cleanError(caught))
      } finally {
        setBusy(false)
      }
    },
    [refresh]
  )

  const clearFetch = useCallback(() => {
    setFetchReport(null)
    setFetchError(null)
  }, [])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return entries
    return entries.filter((entry) => `${entry.white} ${entry.black} ${entry.event} ${entry.date} ${entry.result}`.toLowerCase().includes(needle))
  }, [entries, query])

  return {
    entries: visible,
    total: entries.length,
    loading,
    busy,
    error,
    warnings,
    notice,
    query,
    setQuery,
    refresh,
    saveCurrent,
    importFiles,
    removeGame,
    exportGame,
    readGame,
    fetching,
    fetchReport,
    fetchError,
    fetchOnline,
    saveFetched,
    clearFetch
  }
}

export type Library = ReturnType<typeof useLibrary>