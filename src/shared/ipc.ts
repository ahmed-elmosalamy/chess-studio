import type { AnalyzeRequest, EngineSettings, EngineSource, EngineStatusPayload, NativeEngineInfo } from './engine'
import type { FetchReport, FetchRequest, LibraryEntry, LibraryImportReport } from './library'
import type { ExplorerResult, OpeningsQuery, TokenState } from './openings'
import type { TablebaseQuery, TablebaseResult } from './tablebase'

export const WindowChannel = {
  Minimize: 'window:minimize',
  ToggleMaximize: 'window:toggle-maximize',
  Close: 'window:close',
  State: 'window:state'
} as const

export const AppChannel = {
  Info: 'app:info'
} as const

export type WindowState = {
  maximized: boolean
  fullscreen: boolean
}

export type AppInfo = {
  name: string
  version: string
  electron: string
  node: string
  chrome: string
  platform: string
  arch: string
}

export type StudioApi = {
  getAppInfo: () => Promise<AppInfo>
  window: {
    minimize: () => void
    toggleMaximize: () => void
    close: () => void
    onStateChange: (listener: (state: WindowState) => void) => () => void
  }
  engine: {
    analyze: (request: AnalyzeRequest) => void
    stop: () => void
    setSource: (source: EngineSource) => void
    setSettings: (settings: Partial<EngineSettings>) => void
    nativeStatus: () => Promise<NativeEngineInfo>
    pickPath: () => Promise<NativeEngineInfo>
    onEvent: (listener: (payload: EngineStatusPayload) => void) => () => void
  }
  library: {
    list: () => Promise<LibraryEntry[]>
    save: (pgn: string) => Promise<LibraryEntry>
    read: (id: string) => Promise<string>
    remove: (id: string) => Promise<void>
    exportGame: (id: string) => Promise<string | null>
    importFiles: () => Promise<LibraryImportReport>
    fetchOnline: (request: FetchRequest) => Promise<FetchReport>
  }
  openings: {
    query: (query: OpeningsQuery) => Promise<ExplorerResult>
    setToken: (token: string) => Promise<TokenState>
    clearToken: () => Promise<TokenState>
    tokenState: () => Promise<TokenState>
  }
  tablebase: {
    query: (query: TablebaseQuery) => Promise<TablebaseResult>
  }
}

declare global {
  interface Window {
    studio: StudioApi
  }
}
