import type { EngineSettings, EngineSource, EvalLine } from '@shared/engine'
import WasmEngine from './wasmEngine.ts'
import NativeEngine from './nativeEngine.ts'
import { nextEpoch } from './epoch.ts'
import type { EngineClient, EngineEvents } from './engineClient.ts'

type Pending = {
  lines: Map<number, EvalLine>
  resolve: (lines: EvalLine[]) => void
  reject: (error: Error) => void
}

const SEARCH_TIMEOUT_MS = 90_000

/** One search at a time, resolved when the engine answers, so a review can walk a whole game. */
export default class SearchQueue {
  private client: EngineClient
  private pending: Pending | null = null
  private timer: number | null = null
  private closed = false

  constructor(source: EngineSource, private readonly settings: EngineSettings) {
    const events: EngineEvents = {
      onLine: (line) => {
        if (!this.pending) return
        const known = this.pending.lines.get(line.multipv)
        if (!known || known.depth <= line.depth) this.pending.lines.set(line.multipv, line)
      },
      onBest: () => {
        // A bestmove that arrives before any line belongs to the search this review interrupted,
        // not to the one being waited for; a real search always reports at least one line first.
        if (this.pending && this.pending.lines.size === 0) return
        this.settle()
      },
      onState: (state, name, error) => {
        if (state !== 'error' || !this.pending) return
        const message = error ?? `${name || 'Engine'} could not start`
        this.reject(new Error(message))
      }
    }

    this.client = source === 'native' ? new NativeEngine(events) : new WasmEngine(events)
  }

  search(fen: string): Promise<EvalLine[]> {
    if (this.closed) return Promise.reject(new Error('Review search queue is closed'))

    return new Promise<EvalLine[]>((resolve, reject) => {
      this.pending = { lines: new Map(), resolve, reject }
      this.timer = window.setTimeout(() => this.reject(new Error(`Engine did not answer for ${fen.slice(0, 40)}…`)), SEARCH_TIMEOUT_MS)
      this.client.analyze(fen, this.settings, nextEpoch())
    })
  }

  stop(): void {
    this.closed = true
    this.client.stop()
    this.settle()
  }

  dispose(): void {
    this.closed = true
    this.client.dispose()
    this.settle()
  }

  private settle(): void {
    const pending = this.pending
    if (!pending) return
    this.clearTimer()
    this.pending = null
    pending.resolve([...pending.lines.values()].sort((a, b) => a.multipv - b.multipv))
  }

  private reject(error: Error): void {
    const pending = this.pending
    if (!pending) return
    this.clearTimer()
    this.pending = null
    pending.reject(error)
  }

  private clearTimer(): void {
    if (this.timer === null) return
    window.clearTimeout(this.timer)
    this.timer = null
  }
}
