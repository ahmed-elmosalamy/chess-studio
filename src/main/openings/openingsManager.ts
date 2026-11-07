import { app, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { OpeningsChannel, type OpeningsQuery, type TokenState } from '@shared/openings'
import { fetchOpening } from './openingsFetch'

export default class OpeningsManager {
  private readonly tokenFile = join(app.getPath('userData'), 'openings.json')

  private async readToken(): Promise<string> {
    try {
      const parsed = JSON.parse(await readFile(this.tokenFile, 'utf8')) as { token?: unknown }
      return typeof parsed.token === 'string' ? parsed.token : ''
    } catch {
      return ''
    }
  }

  private async writeToken(token: string): Promise<void> {
    await writeFile(this.tokenFile, JSON.stringify({ token }, null, 2), 'utf8')
  }

  register(): void {
    ipcMain.handle(OpeningsChannel.Query, async (_event, query: OpeningsQuery) => fetchOpening(query, await this.readToken()))
    ipcMain.handle(OpeningsChannel.TokenSet, async (_event, token: string) => {
      await this.writeToken(token.trim())
      return { hasToken: token.trim().length > 0 } satisfies TokenState
    })
    ipcMain.handle(OpeningsChannel.TokenClear, async () => {
      await this.writeToken('')
      return { hasToken: false } satisfies TokenState
    })
    ipcMain.handle(OpeningsChannel.TokenState, async () => ({ hasToken: (await this.readToken()).trim().length > 0 }) satisfies TokenState)
  }
}