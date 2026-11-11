import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { parseBestmove, parseIdName, parseInfo } from '../../shared/uci.ts'
import type { EngineRunState, EngineSettings, EvalLine } from '../../shared/engine.ts'
import { configScript, searchScript } from './uciCommands.ts'

export type UciEvents = {
  onLine?: (line: EvalLine, epoch: number) => void
  onBestmove?: (move: string, epoch: number) => void
  onName?: (name: string) => void
  onState?: (state: EngineRunState, error?: string | null) => void
}

export default class UciProcess {
  private child: ChildProcessWithoutNullStreams | null = null
  private reader: ReturnType<typeof createInterface> | null = null
  private name = ''
  private searchEpoch = 0
  private disposed = false
  private searching = false
  private stopRequested = false
  private bestmoveWaiter: (() => void) | null = null
  private readonly path: string
  private readonly events: UciEvents

  constructor(path: string, events: UciEvents = {}) {
    this.path = path
    this.events = events
  }

  get engineName(): string {
    return this.name
  }

  get running(): boolean {
    return this.child !== null
  }

  private write(command: string): void {
    this.child?.stdin.write(`${command}\n`)
  }

  private handleLine(line: string): void {
    if (this.disposed) return
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
      this.events.onLine?.(info, this.searchEpoch)
      return
    }

    const best = parseBestmove(trimmed)
    if (best) {
      this.searching = false
      this.stopRequested = false
      const waiter = this.bestmoveWaiter
      this.bestmoveWaiter = null
      waiter?.()
      this.events.onBestmove?.(best, this.searchEpoch)
    }
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

    this.disposed = false
    this.events.onState?.('starting', null)

    try {
      this.child = spawn(this.path, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (error) {
      this.events.onState?.('error', error instanceof Error ? error.message : 'spawn failed')
      throw error
    }

    this.reader = createInterface({ input: this.child.stdout })

    this.reader.on('line', (line) => this.handleLine(line))

    this.child.on('error', (error) => {
      if (this.disposed) return
      this.events.onState?.('error', error.message)
    })

    this.child.on('exit', (code) => {
      this.child = null
      this.reader = null
      if (this.disposed) return
      if (code !== 0 && code !== null) this.events.onState?.('error', `engine exited with code ${code}`)
      else this.events.onState?.('idle', null)
    })

    this.write('uci')
    await this.waitFor('uciok', 10000)
    this.events.onState?.('ready', null)
    return this.name
  }

  configure(settings: EngineSettings): void {
    for (const command of configScript(settings)) this.write(command)
  }

  async isReady(): Promise<void> {
    this.write('isready')
    await this.waitFor('readyok', 10000)
  }

  private waitForBestmove(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.bestmoveWaiter = null
        resolve()
      }, timeoutMs)
      timer.unref()
      this.bestmoveWaiter = () => {
        clearTimeout(timer)
        resolve()
      }
    })
  }

  async search(fen: string, settings: EngineSettings, epoch: number): Promise<void> {
    if (!this.child) await this.start()

    if (this.searching) {
      if (!this.stopRequested) this.write('stop')
      this.stopRequested = true
      await this.waitForBestmove(2000)
    }

    this.searchEpoch = epoch
    this.configure(settings)
    await this.isReady()
    for (const command of searchScript(fen, settings, false)) this.write(command)
    this.searching = true
    this.stopRequested = false
    this.events.onState?.('searching', null)
  }

  stop(): void {
    if (!this.child || this.stopRequested) return
    this.stopRequested = true
    this.write('stop')
  }

  quit(): void {
    const child = this.child
    if (!child) return
    this.disposed = true
    this.write('quit')
    this.child = null
    this.reader?.close()
    this.reader = null
    // a wedged engine can ignore "quit"; kill it so it cannot outlive the app
    const timer = setTimeout(() => {
      if (!child.killed) child.kill()
    }, 2000)
    timer.unref()
    child.once('exit', () => clearTimeout(timer))
  }

  get activeEpoch(): number {
    return this.searchEpoch
  }
}
