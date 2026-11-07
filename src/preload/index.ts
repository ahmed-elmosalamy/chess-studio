import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { AppChannel, WindowChannel, type AppInfo, type StudioApi, type WindowState } from '@shared/ipc'
import { EngineChannel, type AnalyzeRequest, type EngineSettings, type EngineSource, type EngineStatusPayload } from '@shared/engine'
import { LibraryChannel } from '@shared/library'
import { OpeningsChannel } from '@shared/openings'
import { TablebaseChannel } from '@shared/tablebase'

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
    importFiles: () => ipcRenderer.invoke(LibraryChannel.ImportFiles),
    fetchOnline: (request) => ipcRenderer.invoke(LibraryChannel.FetchOnline, request)
  },
  openings: {
    query: (query) => ipcRenderer.invoke(OpeningsChannel.Query, query),
    setToken: (token) => ipcRenderer.invoke(OpeningsChannel.TokenSet, token),
    clearToken: () => ipcRenderer.invoke(OpeningsChannel.TokenClear),
    tokenState: () => ipcRenderer.invoke(OpeningsChannel.TokenState)
  },
  tablebase: {
    query: (query) => ipcRenderer.invoke(TablebaseChannel.Query, query)
  }
}

contextBridge.exposeInMainWorld('studio', api)
