import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { BrowserWindow, ipcMain } from 'electron'
import { writeFileAtomic } from '@shared/atomicWrite'
import {
  MAX_BOTS,
  isValidBotId,
  normalizeBotInput,
  normalizeStoredBot,
  type BotDefinition,
} from '@shared/bots'
import { YIRA_HOME } from '../paths'

export const BOTS_CHANGED_CHANNEL = 'bots:changed'

const BOTS_FILE_VERSION = 1

export interface BotStore {
  list(): Promise<BotDefinition[]>
  get(id: string): Promise<BotDefinition | null>
  save(input: unknown): Promise<BotDefinition>
  remove(id: unknown): Promise<boolean>
}

function parseStoredBots(content: string): BotDefinition[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return []
  }
  const entries = (parsed as { bots?: unknown } | null)?.bots
  if (!Array.isArray(entries)) return []

  const bots: BotDefinition[] = []
  for (const entry of entries) {
    const bot = normalizeStoredBot(entry)
    if (bot) bots.push(bot)
  }
  return bots
}

export function createBotStore(
  filePath: string,
  now: () => string = () => new Date().toISOString(),
  newId: () => string = () => `bot-${randomUUID()}`,
): BotStore {
  let cache: BotDefinition[] | null = null
  let writeQueue: Promise<unknown> = Promise.resolve()

  async function load(): Promise<BotDefinition[]> {
    if (cache) return cache
    try {
      cache = parseStoredBots(await fs.readFile(filePath, 'utf8'))
    } catch {
      cache = []
    }
    return cache
  }

  async function persist(bots: BotDefinition[]): Promise<void> {
    await fs.mkdir(dirname(filePath), { recursive: true })
    await writeFileAtomic(filePath, JSON.stringify({ version: BOTS_FILE_VERSION, bots }, null, 2))
    cache = bots
  }

  // Serializes mutations so two quick saves never overwrite each other.
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = writeQueue.then(task)
    writeQueue = result.catch(() => undefined)
    return result
  }

  async function saveBot(input: unknown): Promise<BotDefinition> {
    const normalized = normalizeBotInput(input)
    const bots = await load()
    const timestamp = now()

    if (normalized.id !== undefined) {
      const existing = bots.find((bot) => bot.id === normalized.id)
      if (!existing) throw new Error('Bot not found')
      const updated: BotDefinition = { ...normalized, id: existing.id, createdAt: existing.createdAt, updatedAt: timestamp }
      await persist(bots.map((bot) => (bot.id === existing.id ? updated : bot)))
      return updated
    }

    if (bots.length >= MAX_BOTS) throw new Error(`At most ${MAX_BOTS} bots are supported`)
    const created: BotDefinition = { ...normalized, id: newId(), createdAt: timestamp, updatedAt: timestamp }
    await persist([...bots, created])
    return created
  }

  async function removeBot(id: unknown): Promise<boolean> {
    if (!isValidBotId(id)) return false
    const bots = await load()
    if (!bots.some((bot) => bot.id === id)) return false
    await persist(bots.filter((bot) => bot.id !== id))
    return true
  }

  return {
    list: async () => [...(await load())],
    get: async (id) => (await load()).find((bot) => bot.id === id) ?? null,
    save: (input) => enqueue(() => saveBot(input)),
    remove: (id) => enqueue(() => removeBot(id)),
  }
}

export function getBotRoleFilePath(botId: string): string {
  if (!isValidBotId(botId)) throw new Error('Bot id is invalid')
  return join(YIRA_HOME, 'bots', 'roles', `${botId}.md`)
}

export async function writeBotRoleFile(bot: Pick<BotDefinition, 'id' | 'role'>): Promise<string> {
  const rolePath = getBotRoleFilePath(bot.id)
  await fs.mkdir(dirname(rolePath), { recursive: true })
  await writeFileAtomic(rolePath, bot.role)
  return rolePath
}

const defaultBotStore = createBotStore(join(YIRA_HOME, 'bots.json'))

export function getBotById(id: string): Promise<BotDefinition | null> {
  return defaultBotStore.get(id)
}

export function listBots(): Promise<BotDefinition[]> {
  return defaultBotStore.list()
}

function broadcastBots(bots: BotDefinition[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    try {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send(BOTS_CHANGED_CHANNEL, bots)
      }
    } catch {
      // A window can close while the list is broadcasting.
    }
  }
}

export function registerBotsIPC(store: BotStore = defaultBotStore): void {
  ipcMain.handle('bots:list', (): Promise<BotDefinition[]> => store.list())

  ipcMain.handle('bots:save', async (_event, input: unknown): Promise<BotDefinition> => {
    const saved = await store.save(input)
    broadcastBots(await store.list())
    return saved
  })

  ipcMain.handle('bots:delete', async (_event, id: unknown): Promise<boolean> => {
    const removed = await store.remove(id)
    if (removed) broadcastBots(await store.list())
    return removed
  })
}
