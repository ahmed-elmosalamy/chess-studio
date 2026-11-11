import { app, ipcMain } from 'electron'
import { TrainerChannel, type PuzzleDraft } from '@shared/trainer'
import { createTrainerStore } from './trainerStore'

export default class TrainerManager {
  private readonly store = createTrainerStore(app.getPath('userData'))

  register(): void {
    ipcMain.handle(TrainerChannel.List, () => this.store.list())
    ipcMain.handle(TrainerChannel.Add, (_event, drafts: PuzzleDraft[]) => this.store.add(drafts))
    ipcMain.handle(TrainerChannel.Attempt, (_event, id: string, solved: boolean) => this.store.attempt(id, solved))
    ipcMain.handle(TrainerChannel.Remove, async (_event, id: string) => {
      await this.store.remove(id)
    })
    ipcMain.handle(TrainerChannel.Clear, async () => {
      await this.store.clear()
    })
  }
}
