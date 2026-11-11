import type { AnalyzeRequest, EngineSettings, EngineSource, EngineStatusPayload, NativeEngineInfo } from './engine'
import type { AiBatchRecord, AiPageRecord, BookAnchors, BookImportReport, BookMeta, BookNote, BookOcrPage, BookReadResult, ParsedBook } from './book'
import type { FetchReport, FetchRequest, LibraryEntry, LibraryImportReport, SaveResult } from './library'
import type { ExplorerResult, OpeningsQuery, TokenState } from './openings'
import type { AiExplainRequest, AiExplainResponse, AiModel, AiRequest, AiResponse, AiSettings, AiState } from './ai'
import type { TablebaseQuery, TablebaseResult } from './tablebase'
import type { AddPuzzlesResult, PuzzleDraft, TrainerPuzzle } from './trainer'

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
    save: (pgn: string) => Promise<SaveResult>
    read: (id: string) => Promise<string>
    remove: (id: string) => Promise<void>
    exportGame: (id: string) => Promise<string | null>
    exportReport: (data: Uint8Array, name: string) => Promise<string | null>
    importFiles: () => Promise<LibraryImportReport>
    fetchOnline: (request: FetchRequest) => Promise<FetchReport>
  }
  books: {
    list: () => Promise<BookMeta[]>
    import: () => Promise<BookImportReport>
    remove: (id: string) => Promise<void>
    rename: (id: string, title: string) => Promise<BookMeta>
    read: (id: string) => Promise<BookReadResult>
    readSource: (id: string) => Promise<Uint8Array>
    saveParse: (id: string, parsed: ParsedBook) => Promise<BookMeta>
    readNote: (id: string) => Promise<BookNote | null>
    saveNote: (id: string, note: BookNote) => Promise<BookNote>
    saveAnchor: (id: string, blockId: string, fen: string) => Promise<BookAnchors>
    clearAnchor: (id: string, blockId: string) => Promise<BookAnchors>
    readOcrPage: (id: string, page: number) => Promise<BookOcrPage | null>
    saveOcrPage: (id: string, record: BookOcrPage) => Promise<void>
    listAiPages: (id: string) => Promise<number[]>
    readAiPage: (id: string, page: number) => Promise<AiPageRecord | null>
    saveAiPage: (id: string, record: AiPageRecord) => Promise<void>
    readAiBatch: (id: string, firstPage: number, count: number) => Promise<AiBatchRecord | null>
    saveAiBatch: (id: string, batch: AiBatchRecord) => Promise<void>
    listAiBatches: (id: string) => Promise<{ firstPage: number; count: number }[]>
  }
  openings: {
    query: (query: OpeningsQuery) => Promise<ExplorerResult>
    setToken: (token: string) => Promise<TokenState>
    clearToken: () => Promise<TokenState>
    tokenState: () => Promise<TokenState>
  }
  ai: {
    state: () => Promise<AiState>
    setKey: (key: string) => Promise<AiState>
    clearKey: () => Promise<AiState>
    setSettings: (patch: Partial<AiSettings>) => Promise<AiState>
    models: () => Promise<AiModel[]>
    readPages: (request: AiRequest) => Promise<AiResponse>
    explain: (request: AiExplainRequest) => Promise<AiExplainResponse>
  }
  tablebase: {
    query: (query: TablebaseQuery) => Promise<TablebaseResult>
  }
  trainer: {
    list: () => Promise<TrainerPuzzle[]>
    add: (drafts: PuzzleDraft[]) => Promise<AddPuzzlesResult>
    attempt: (id: string, solved: boolean) => Promise<TrainerPuzzle>
    remove: (id: string) => Promise<void>
    clear: () => Promise<void>
  }
}

declare global {
  interface Window {
    studio: StudioApi
  }
}
