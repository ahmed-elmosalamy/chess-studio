import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { parseBestmove, parseIdName, parseInfo } from '@shared/uci'
import type { EngineRunState, EngineSettings, EvalLine } from '@shared/engine'

export type UciEvents = {
  onLine?: (line: EvalLine) => void
  onBestmove?: (move: string) => void
  onName?: (name: string) => void
  onState?: (state: EngineRunState, error?: string | null) => void
}

export default class UciProcess {
  private child: ChildProcessWithoutNullStreams | null = null
  private reader: ReturnType<typeof createInterface> | null = null
  private name = ''
  private searchEpoch = 0

  constructor(
    private readonly path: string,
    private readonly events: UciEvents = {}
  ) {}

  get engineName(): string {
    return this.name
  }

  get running(): boolean {
    return this.child !== null
  }

  private write(command: string): void {
    this.child?.stdin.write(`${command}\n`)
  }

  private waitFor(token: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.reader) {
        reject(new Error('engine process is not started'))
        return
      }

      const timer = setTimeout(() => {
        this.reader?.off('line', listener)
        reject(new Error(`engine did not answer "${token}" within ${timeoutMs}ms`))
      }, timeoutMs)

      const listener = (line: string): void => {
        if (!line.startsWith(token)) return
        clearTimeout(timer)
        this.reader?.off('line', listener)
        resolve()
      }

      this.reader.on('line', listener)
    })
  }

  async start(): Promise<string> {
    if (this.child) return this.name

    this.events.onState?.('starting', null)

    try {
      this.child = spawn(this.path, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (error) {
      this.events.onState?.('error', error instanceof Error ? error.message : 'spawn failed')
      throw error
    }

    this.reader = createInterface({ input: this.child.stdout })

    this.reader.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed) return

      const idName = parseIdName(trimmed)
      if (idName) {
        this.name = idName
        this.events.onName?.(idName)
        return
      }

      const info = parseInfo(trimmed)
      if (info) {
        this.events.onLine?.(info)
        return
      }

      const best = parseBestmove(trimmed)
      if (best) this.events.onBestmove?.(best)
    })

    this.child.on('error', (error) => {
      this.events.onState?.('error', error.message)
    })

    this.child.on('exit', (code) => {
      this.child = null
      this.reader = null
      if (code !== 0 && code !== null) this.events.onState?.('error', `engine exited with code ${code}`)
      else this.events.onState?.('idle', null)
    })

    this.write('uci')
    await this.waitFor('uciok', 10000)
    this.events.onState?.('ready', null)
    return this.name
  }

  configure(settings: EngineSettings): void {
    this.write(`setoption name MultiPV value ${settings.multipv}`)
    this.write(`setoption name Threads value ${settings.threads}`)
    this.write(`setoption name Hash value ${settings.hash}`)
  }

  async isReady(): Promise<void> {
    this.write('isready')
    await this.waitFor('readyok', 10000)
  }

  async search(fen: string, settings: EngineSettings, epoch: number): Promise<void> {
    if (!this.child) await this.start()
    this.searchEpoch = epoch

    this.configure(settings)
    await this.isReady()
    this.write(`position fen ${fen}`)
    this.write(`go depth ${settings.depth}`)
    this.events.onState?.('searching', null)
  }

  stop(): void {
    if (this.child) this.write('stop')
  }

  quit(): void {
    if (!this.child) return
    this.write('quit')
    this.child = null
    this.reader?.close()
    this.reader = null
  }

  get activeEpoch(): number {
    return this.searchEpoch
  }
}
