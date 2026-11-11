import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { AppChannel, WindowChannel, type AppInfo, type StudioApi, type WindowState } from '@shared/ipc'
import { BookChannel } from '@shared/book'
import { EngineChannel, type AnalyzeRequest, type EngineSettings, type EngineSource, type EngineStatusPayload } from '@shared/engine'
import { LibraryChannel } from '@shared/library'
import { OpeningsChannel } from '@shared/openings'
import { AiChannel, type AiExplainResponse, type AiModel, type AiResponse, type AiState } from '@shared/ai'
import { TablebaseChannel } from '@shared/tablebase'
import { TrainerChannel } from '@shared/trainer'

const api: StudioApi = {
  getAppInfo: () => ipcRenderer.invoke(AppChannel.Info) as Promise<AppInfo>,
  window: {
    minimize: () => ipcRenderer.send(WindowChannel.Minimize),
    toggleMaximize: () => ipcRenderer.send(WindowChannel.ToggleMaximize),
    close: () => ipcRenderer.send(WindowChannel.Close),
    onStateChange: (listener) => {
      const handler = (_event: IpcRendererEvent, state: WindowState): void => listener(state)
      ipcRenderer.on(WindowChannel.State, handler)
      return () => ipcRenderer.removeListener(WindowChannel.State, handler)
    }
  },
  engine: {
    analyze: (request: AnalyzeRequest) => ipcRenderer.send(EngineChannel.Analyze, request),
    stop: () => ipcRenderer.send(EngineChannel.Stop),
    setSource: (source: EngineSource) => ipcRenderer.send(EngineChannel.SetSource, source),
    setSettings: (settings: Partial<EngineSettings>) => ipcRenderer.send(EngineChannel.SetSettings, settings),
    nativeStatus: () => ipcRenderer.invoke(EngineChannel.NativeStatus),
    pickPath: () => ipcRenderer.invoke(EngineChannel.PickPath),
    onEvent: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: EngineStatusPayload): void => listener(payload)
      ipcRenderer.on(EngineChannel.Status, handler)
      return () => ipcRenderer.removeListener(EngineChannel.Status, handler)
    }
  },
  library: {
    list: () => ipcRenderer.invoke(LibraryChannel.List),
    save: (pgn) => ipcRenderer.invoke(LibraryChannel.Save, pgn),
    read: (id) => ipcRenderer.invoke(LibraryChannel.Read, id),
    remove: (id) => ipcRenderer.invoke(LibraryChannel.Remove, id),
    exportGame: (id) => ipcRenderer.invoke(LibraryChannel.Export, id),
    exportReport: (data, name) => ipcRenderer.invoke(LibraryChannel.ExportReport, data, name),
    importFiles: () => ipcRenderer.invoke(LibraryChannel.ImportFiles),
    fetchOnline: (request) => ipcRenderer.invoke(LibraryChannel.FetchOnline, request)
  },
  books: {
    list: () => ipcRenderer.invoke(BookChannel.List),
    import: () => ipcRenderer.invoke(BookChannel.Import),
    remove: (id) => ipcRenderer.invoke(BookChannel.Remove, id),
    rename: (id, title) => ipcRenderer.invoke(BookChannel.Rename, id, title),
    read: (id) => ipcRenderer.invoke(BookChannel.Read, id),
    readSource: (id) => ipcRenderer.invoke(BookChannel.ReadSource, id),
    saveParse: (id, parsed) => ipcRenderer.invoke(BookChannel.SaveParse, id, parsed),
    readNote: (id) => ipcRenderer.invoke(BookChannel.ReadNote, id),
    saveNote: (id, note) => ipcRenderer.invoke(BookChannel.SaveNote, id, note),
    saveAnchor: (id, blockId, fen) => ipcRenderer.invoke(BookChannel.SaveAnchor, id, blockId, fen),
    clearAnchor: (id, blockId) => ipcRenderer.invoke(BookChannel.ClearAnchor, id, blockId),
    readOcrPage: (id, page) => ipcRenderer.invoke(BookChannel.ReadOcrPage, id, page),
    saveOcrPage: (id, record) => ipcRenderer.invoke(BookChannel.SaveOcrPage, id, record),
    listAiPages: (id) => ipcRenderer.invoke(BookChannel.ListAiPages, id),
    readAiPage: (id, page) => ipcRenderer.invoke(BookChannel.ReadAiPage, id, page),
    saveAiPage: (id, record) => ipcRenderer.invoke(BookChannel.SaveAiPage, id, record),
    readAiBatch: (id, firstPage, count) => ipcRenderer.invoke(BookChannel.ReadAiBatch, id, firstPage, count),
    saveAiBatch: (id, batch) => ipcRenderer.invoke(BookChannel.SaveAiBatch, id, batch),
    listAiBatches: (id) => ipcRenderer.invoke(BookChannel.ListAiBatches, id)
  },
  openings: {
    query: (query) => ipcRenderer.invoke(OpeningsChannel.Query, query),
    setToken: (token) => ipcRenderer.invoke(OpeningsChannel.TokenSet, token),
    clearToken: () => ipcRenderer.invoke(OpeningsChannel.TokenClear),
    tokenState: () => ipcRenderer.invoke(OpeningsChannel.TokenState)
  },
  ai: {
    state: () => ipcRenderer.invoke(AiChannel.State) as Promise<AiState>,
    setKey: (key) => ipcRenderer.invoke(AiChannel.SetKey, key) as Promise<AiState>,
    clearKey: () => ipcRenderer.invoke(AiChannel.ClearKey) as Promise<AiState>,
    setSettings: (patch) => ipcRenderer.invoke(AiChannel.SetSettings, patch) as Promise<AiState>,
    models: () => ipcRenderer.invoke(AiChannel.Models) as Promise<AiModel[]>,
    readPages: (request) => ipcRenderer.invoke(AiChannel.ReadPages, request) as Promise<AiResponse>,
    explain: (request) => ipcRenderer.invoke(AiChannel.Explain, request) as Promise<AiExplainResponse>
  },
  tablebase: {
    query: (query) => ipcRenderer.invoke(TablebaseChannel.Query, query)
  },
  trainer: {
    list: () => ipcRenderer.invoke(TrainerChannel.List),
    add: (drafts) => ipcRenderer.invoke(TrainerChannel.Add, drafts),
    attempt: (id, solved) => ipcRenderer.invoke(TrainerChannel.Attempt, id, solved),
    remove: (id) => ipcRenderer.invoke(TrainerChannel.Remove, id),
    clear: () => ipcRenderer.invoke(TrainerChannel.Clear)
  }
}

contextBridge.exposeInMainWorld('studio', api)
