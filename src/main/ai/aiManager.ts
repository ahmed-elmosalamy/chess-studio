import { app, ipcMain } from 'electron'
import {
  AiChannel,
  AiError,
  type AiExplainRequest,
  type AiExplainResponse,
  type AiModel,
  type AiRequest,
  type AiResponse,
  type AiSettings,
  type AiState
} from '@shared/ai'
import { isKeyless } from '@shared/aiProviders'
import { createAiSettings, fileCrypto, settingsFileFor, type AiSettingsStore } from './aiSettings'
import { explain, listModels, readPages } from './aiFetch'

export default class AiManager {
  private store: AiSettingsStore | null = null

  private async settings(): Promise<AiSettingsStore> {
    if (!this.store) this.store = createAiSettings(settingsFileFor(app.getPath('userData')), await fileCrypto())
    return this.store
  }

  private async state(store: AiSettingsStore): Promise<AiState> {
    const settings = await store.settings()
    return { hasKey: (await store.key()).trim().length > 0 || isKeyless(settings), settings }
  }

  register(): void {
    ipcMain.handle(AiChannel.State, async () => this.state(await this.settings()))

    ipcMain.handle(AiChannel.SetKey, async (_event, key: string) => {
      const store = await this.settings()
      await store.setKey(String(key ?? ''))
      return this.state(store)
    })

    ipcMain.handle(AiChannel.ClearKey, async () => {
      const store = await this.settings()
      await store.setKey('')
      return this.state(store)
    })

    ipcMain.handle(AiChannel.SetSettings, async (_event, patch: Partial<AiSettings>) => {
      const store = await this.settings()
      await store.setSettings(patch ?? {})
      return this.state(store)
    })

    ipcMain.handle(AiChannel.Models, async (): Promise<AiModel[]> => {
      const store = await this.settings()
      return listModels(await store.settings(), await store.key())
    })

    ipcMain.handle(AiChannel.ReadPages, async (_event, request: AiRequest): Promise<AiResponse> => {
      const store = await this.settings()
      try {
        return await readPages(request, await store.settings(), await store.key())
      } catch (error) {
        if (error instanceof AiError) throw new Error(`${error.kind}: ${error.message}`)
        throw error
      }
    })

    ipcMain.handle(AiChannel.Explain, async (_event, request: AiExplainRequest): Promise<AiExplainResponse> => {
      const store = await this.settings()
      try {
        return await explain(request, await store.settings(), await store.key())
      } catch (error) {
        if (error instanceof AiError) throw new Error(`${error.kind}: ${error.message}`)
        throw error
      }
    })
  }
}
