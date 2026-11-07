import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { defaultEngineSettings, type EngineSettings, type EngineSource, type EngineStatus, type EvalLine, type NativeEngineInfo } from '@shared/engine'
import { winChance } from '@shared/uci'
import WasmEngine from '../engine/wasmEngine.ts'
import NativeEngine from '../engine/nativeEngine.ts'
import { nextEpoch } from '../engine/epoch.ts'
import type { EngineEvents } from '../engine/engineClient.ts'
import type { Color } from 'chess.js'

const emptyNative: NativeEngineInfo = { path: null, exists: false, name: '', state: 'idle', error: null, source: 'wasm', settings: defaultEngineSettings }
const idleStatus: EngineStatus = { state: 'idle', source: 'wasm', name: '', error: null }

export default function useEngine(fen: string, turn: Color) {
  const [enabled, setEnabled] = useState(false)
  const [source, setSourceState] = useState<EngineSource>('wasm')
  const [settings, setSettingsState] = useState<EngineSettings>(defaultEngineSettings)
  const [native, setNative] = useState<NativeEngineInfo>(emptyNative)
  const [status, setStatus] = useState<EngineStatus>(idleStatus)
  const [best, setBest] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [lineMap, setLineMap] = useState<Record<number, EvalLine>>({})

  const epoch = useRef(0)
  const clients = useRef<{ wasm: WasmEngine; native: NativeEngine } | null>(null)

  // Created here rather than in a memo: the extra dev-mode remount runs a cleanup that has
  // already disposed the engine subscriptions, and a memo would survive it.
  useEffect(() => {
    const events: EngineEvents = {
      onLine: (line) => {
        setLineMap((previous) => {
          const known = previous[line.multipv]
          if (known && known.depth > line.depth) return previous
          return { ...previous, [line.multipv]: line }
        })
      },
      onBest: (move) => setBest(move),
      onState: (state, name, error) => setStatus((previous) => ({ ...previous, state, name, error }))
    }

    clients.current = { wasm: new WasmEngine(events), native: new NativeEngine(events) }

    return () => {
      epoch.current = nextEpoch()
      clients.current?.wasm.dispose()
      clients.current?.native.dispose()
      clients.current = null
    }
  }, [])

  useEffect(() => {
    void window.studio.engine.nativeStatus().then((info) => {
      setNative(info)
      setSourceState(info.source)
      setSettingsState(info.settings)
    })
  }, [])

  useEffect(() => {
    const active = clients.current
    if (!active) return

    setSelected(null)

    if (!enabled) {
      epoch.current = nextEpoch()
      active[source].stop()
      setLineMap({})
      setBest(null)
      setStatus((previous) => ({ ...previous, state: 'idle', error: null }))
      return
    }

    const timer = window.setTimeout(() => {
      epoch.current = nextEpoch()
      setLineMap({})
      setBest(null)
      active[source].analyze(fen, settings, epoch.current)
    }, 120)

    return () => window.clearTimeout(timer)
  }, [enabled, fen, source, settings])

  const setSource = useCallback(
    (next: EngineSource) => {
      epoch.current = nextEpoch()
      clients.current?.[source].stop()
      window.studio.engine.setSource(next)
      setSourceState(next)
      setStatus((previous) => ({ ...previous, source: next, state: 'idle', error: null }))
    },
    [source]
  )

  const setSettings = useCallback((patch: Partial<EngineSettings>) => {
    setSettingsState((previous) => {
      const next = { ...previous, ...patch }
      window.studio.engine.setSettings(next)
      return next
    })
  }, [])

  const pickPath = useCallback(async () => {
    const info = await window.studio.engine.pickPath()
    setNative(info)
  }, [])

  const toggle = useCallback(() => setEnabled((previous) => !previous), [])
  const disable = useCallback(() => setEnabled(false), [])

  const lines = useMemo(() => Object.values(lineMap).sort((a, b) => a.multipv - b.multipv), [lineMap])

  const activeMultipv = selected === 0 ? null : (selected ?? 1)
  const arrowLine = activeMultipv === null ? null : (lines.find((line) => line.multipv === activeMultipv) ?? lines[0] ?? null)
  const primary = lines.find((line) => line.multipv === (selected ?? 1)) ?? lines[0] ?? null
  const whiteChance = primary ? (turn === 'w' ? winChance(primary.score) : 100 - winChance(primary.score)) : 50

  return { enabled, toggle, disable, source, setSource, settings, setSettings, native, pickPath, status, lines, best, selected, setSelected, activeMultipv, arrowLine, primary, whiteChance }
}
