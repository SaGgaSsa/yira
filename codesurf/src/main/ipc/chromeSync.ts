import { ipcMain } from 'electron'
import {
  listProfiles,
  syncCookiesToPartition,
  getBookmarks,
  searchHistory,
} from '../chrome-sync'

let lastSync: number | null = null

export function registerChromeSyncIPC(): void {
  ipcMain.handle('chromeSync:listProfiles', () => {
    return listProfiles()
  })

  ipcMain.handle('chromeSync:getStatus', (_event, settings: { enabled: boolean; profileDir: string | null }) => {
    return {
      enabled: settings.enabled,
      profileDir: settings.profileDir,
      lastSync,
      profiles: listProfiles(),
    }
  })

  ipcMain.handle('chromeSync:syncCookies', async (_event, profileDir: string, partition: string) => {
    const result = await syncCookiesToPartition(profileDir, partition)
    if (result.errors.length === 0) lastSync = Date.now()
    return result
  })

  ipcMain.handle('chromeSync:getBookmarks', (_event, profileDir: string) => {
    return getBookmarks(profileDir)
  })

  ipcMain.handle('chromeSync:searchHistory', async (_event, profileDir: string, query: string, limit?: number) => {
    return searchHistory(profileDir, query, limit)
  })
}
