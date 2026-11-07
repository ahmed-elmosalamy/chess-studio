import { dialog, ipcMain, type WebContents } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EngineChannel, defaultEngineSettings, type AnalyzeRequest, type EngineSettings, type EngineSource, type EngineStatus, type NativeEngineInfo } from '@shared/engine'
import UciProcess from './uciProcess'

type Config = { source: EngineSource; path: string | null; settings: EngineSettings }

export default class EngineManager {
  private config: Config = { source: 'wasm', path: null, settings: defaultEngineSettings }
  private engine: UciProcess | null = null
  private status: EngineStatus = { state: 'idle', source: 'wasm', name: '', error: null }
  private epoch = 0

  constructor(private readonly target: () => WebContents | null) {}

  private get configFile(): string {
    return join(process.env['APPDATA'] ?? '.', 'chess-studio', 'engine.json')
  }

  load(): void {
    try {
      const raw = JSON.parse(readFileSync(this.configFile, 'utf-8')) as Partial<Config>
      this.config = {
        source: raw.source === 'native' ? 'native' : 'wasm',
        path: typeof raw.path === 'string' && raw.path ? raw.path : null,
        settings: { ...defaultEngineSettings, ...raw.settings }
      }
    } catch {
      /* first run has no config file yet */
    }
  }

  private save(): void {
    try {
      writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf-8')
    } catch {
      /* settings still apply for this session if the write fails */
    }
  }

  private publish(status: EngineStatus): void {
    this.status = status
    this.target()?.send(EngineChannel.Status, { kind: 'status', status })
  }

  private nativeInfo(): NativeEngineInfo {
    return {
      path: this.config.path,
      exists: Boolean(this.config.path && existsSync(this.config.path)),
      name: this.engine?.engineName ?? '',
      state: this.status.state,
      error: this.status.error,
      source: this.config.source,
      settings: this.config.settings
    }
  }

  register(): void {
    this.load()

    ipcMain.handle(EngineChannel.NativeStatus, () => this.nativeInfo())

    ipcMain.handle(EngineChannel.PickPath, async () => {
      const result = await dialog.showOpenDialog({
        title: 'Choose a UCI engine',
        filters: [{ name: 'UCI engines', extensions: ['exe', 'com', ''] }],
        properties: ['openFile']
      })
      if (result.canceled || result.filePaths.length === 0) return this.nativeInfo()

      this.config.path = result.filePaths[0]
      this.save()
      await this.teardownNative()
      return this.nativeInfo()
    })

    ipcMain.on(EngineChannel.SetSource, (_event, source: EngineSource) => {
      this.config.source = source
      this.save()
      this.publish({ ...this.status, source, state: 'idle', name: source === 'wasm' ? 'Stockfish lite (WASM)' : this.engine?.engineName ?? '' })
    })

    ipcMain.on(EngineChannel.SetSettings, (_event, settings: Partial<EngineSettings>) => {
      this.config.settings = { ...this.config.settings, ...settings }
      this.save()
    })

    ipcMain.on(EngineChannel.Analyze, (_event, request: AnalyzeRequest) => {
      void this.handleAnalyze(request)
    })

    ipcMain.on(EngineChannel.Stop, () => {
      this.engine?.stop()
      this.publish({ ...this.status, state: 'ready' })
    })

    this.publish({ ...this.status, name: this.config.source === 'wasm' ? 'Stockfish lite (WASM)' : '' })
  }

  private async handleAnalyze(request: AnalyzeRequest): Promise<void> {
    if (request.source === 'wasm') return

    this.epoch = request.epoch

    if (!this.config.path) {
      this.publish({ state: 'error', source: 'native', name: '', error: 'No engine executable selected.' })
      return
    }

    try {
      if (!this.engine) {
        this.engine = new UciProcess(this.config.path, {
          onLine: (line) => {
            this.target()?.send(EngineChannel.Status, { kind: 'line', epoch: this.epoch, line })
          },
          onBestmove: (move) => {
            this.target()?.send(EngineChannel.Status, { kind: 'best', epoch: this.epoch, move })
            this.publish({ state: 'ready', source: 'native', name: this.engine?.engineName ?? '', error: null })
          },
          onName: (name) => this.publish({ state: 'ready', source: 'native', name, error: null }),
          onState: (state, error) => this.publish({ state, source: 'native', name: this.engine?.engineName ?? '', error: error ?? null })
        })
      }

      await this.engine.search(request.fen, request.settings, request.epoch)
    } catch (error) {
      this.publish({ state: 'error', source: 'native', name: this.engine?.engineName ?? '', error: error instanceof Error ? error.message : 'engine failed' })
      await this.teardownNative()
    }
  }

  private async teardownNative(): Promise<void> {
    this.engine?.quit()
    this.engine = null
    this.publish({ state: 'idle', source: this.config.source, name: '', error: null })
  }

  dispose(): void {
    this.engine?.quit()
    this.engine = null
  }
}
