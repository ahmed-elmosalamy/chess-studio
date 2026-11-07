import { parseBestmove, parseIdName, parseInfo } from '@shared/uci'
import type { EngineSettings } from '@shared/engine'
import type { EngineClient, EngineEvents } from './engineClient.ts'

const SCRIPT = 'stockfish/stockfish.js'
const DEFAULT_NAME = 'Stockfish lite (WASM)'

export default class WasmEngine implements EngineClient {
  private worker: Worker | null = null
  private handshaked = false
  private queued: { fen: string; settings: EngineSettings } | null = null
  private searching = false
  private name = DEFAULT_NAME

  constructor(private readonly events: EngineEvents) {}

  analyze(fen: string, settings: EngineSettings): void {
    this.queued = { fen, settings }
    if (!this.worker) {
      this.spawn()
      return
    }
    if (this.handshaked) {
      if (this.searching) {
        this.write('stop')
        return
      }
      this.launch()
    }
  }

  stop(): void {
    if (this.searching) this.write('stop')
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = null
    this.handshaked = false
    this.searching = false
    this.queued = null
  }

  private spawn(): void {
    this.events.onState('starting', this.name, null)

    const worker = new Worker(new URL(SCRIPT, document.baseURI).href)
    this.worker = worker
    worker.onmessage = (event: MessageEvent) => this.receive(typeof event.data === 'string' ? event.data : '')
    worker.onerror = (event) => {
      this.worker = null
      this.handshaked = false
      this.searching = false
      this.events.onState('error', this.name, event.message || 'Stockfish worker could not start')
    }

    worker.postMessage('uci')
  }

  private launch(): void {
    const job = this.queued
    if (!job) return
    this.queued = null

    this.write(`setoption name MultiPV value ${job.settings.multipv}`)
    this.write(`setoption name Hash value ${job.settings.hash}`)
    this.write(`position fen ${job.fen}`)
    this.write(`go depth ${job.settings.depth}`)
    this.searching = true
    this.events.onState('searching', this.name, null)
  }

  private receive(line: string): void {
    if (!line) return

    if (line.startsWith('uciok')) {
      this.handshaked = true
      this.write('isready')
      return
    }

    if (line.startsWith('readyok')) {
      this.launch()
      return
    }

    const name = parseIdName(line)
    if (name) {
      this.name = name
      return
    }

    const info = parseInfo(line)
    if (info) {
      this.events.onLine(info)
      return
    }

    const best = parseBestmove(line)
    if (best) {
      this.searching = false
      if (best !== '0000' && best !== '(none)') this.events.onBest(best)
      this.events.onState('ready', this.name, null)
      if (this.queued) this.launch()
    }
  }

  private write(command: string): void {
    this.worker?.postMessage(command)
  }
}
