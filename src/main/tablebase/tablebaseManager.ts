import { ipcMain } from 'electron'
import { TablebaseChannel, type TablebaseQuery } from '@shared/tablebase'
import { fetchTablebase } from './tablebaseFetch'

export default class TablebaseManager {
  register(): void {
    ipcMain.handle(TablebaseChannel.Query, async (_event, query: TablebaseQuery) => fetchTablebase(query.fen))
  }
}