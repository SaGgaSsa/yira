import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { BrowserWindow, ipcMain } from 'electron'
import { writeFileAtomic } from '@shared/atomicWrite'
import {
  MAX_ROUTINES,
  ROUTINE_ERROR_MAX_LENGTH,
  isValidRoutineId,
  normalizeRoutineInput,
  normalizeStoredRoutine,
  type Routine,
  type RoutineInput,
  type RoutineRunResult,
} from '@shared/routines'
import { YIRA_HOME } from '../paths'
import { getBotById } from './bots'

export const ROUTINES_CHANGED_CHANNEL = 'routines:changed'

const ROUTINES_FILE_VERSION = 1

export type RoutineRunPatch = Partial<
  Pick<Routine, 'lastRunAt' | 'lastResult' | 'lastError' | 'lastTileId' | 'consecutiveFailures' | 'pausedAt' | 'enabled'>
>

export interface RoutineStore {
  list(): Promise<Routine[]>
  get(id: string): Promise<Routine | null>
  /** Create or update from a RoutineInput. */
  save(input: unknown): Promise<Routine>
  remove(id: unknown): Promise<boolean>
  /** Main-only: record run state. Unknown id gives null. */
  recordRun(id: string, patch: RoutineRunPatch): Promise<Routine | null>
  /** Called after every write. */
  subscribe(listener: (routines: Routine[]) => void): () => void
}

export interface RoutineStoreOptions {
  getBot?: (id: string) => Promise<unknown | null>
}

function parseStoredRoutines(content: string): Routine[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return []
  }
  const entries = (parsed as { routines?: unknown } | null)?.routines
  if (!Array.isArray(entries)) return []

  const routines: Routine[] = []
  for (const entry of entries) {
    const routine = normalizeStoredRoutine(entry)
    if (routine) routines.push(routine)
  }
  return routines
}

function removeUndefinedFields<T extends object>(value: T): T {
  const entries = Object.entries(value).filter(([, field]) => field !== undefined)
  return Object.fromEntries(entries) as T
}

function hasScheduleChanged(existing: Routine, input: RoutineInput): boolean {
  return JSON.stringify(existing.schedule) !== JSON.stringify(input.schedule)
}

export function createRoutineStore(
  filePath: string,
  now: () => string = () => new Date().toISOString(),
  newId: () => string = () => `routine-${randomUUID()}`,
  options: RoutineStoreOptions = {},
): RoutineStore {
  let cache: Routine[] | null = null
  let writeQueue: Promise<unknown> = Promise.resolve()
  const listeners = new Set<(routines: Routine[]) => void>()

  async function load(): Promise<Routine[]> {
    if (cache) return cache
    try {
      cache = parseStoredRoutines(await fs.readFile(filePath, 'utf8'))
    } catch {
      cache = []
    }
    return cache
  }

  function notify(routines: Routine[]): void {
    for (const listener of [...listeners]) {
      try {
        listener([...routines])
      } catch {
        // A failing listener must not break the write that already succeeded.
      }
    }
  }

  async function persist(routines: Routine[]): Promise<void> {
    await fs.mkdir(dirname(filePath), { recursive: true })
    await writeFileAtomic(filePath, JSON.stringify({ version: ROUTINES_FILE_VERSION, routines }, null, 2))
    cache = routines
    notify(routines)
  }

  // Serializes mutations so two quick saves never overwrite each other.
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = writeQueue.then(task)
    writeQueue = result.catch(() => undefined)
    return result
  }

  async function assertBotExists(botId: string): Promise<void> {
    if (!options.getBot) return
    if ((await options.getBot(botId)) === null) throw new Error('Bot not found')
  }

  function updateRoutine(existing: Routine, input: RoutineInput, timestamp: string): Routine {
    const reEnabled = input.enabled && !existing.enabled
    const resetAnchor = reEnabled || hasScheduleChanged(existing, input)
    const updated: Routine = {
      ...existing,
      botId: input.botId,
      workspaceId: input.workspaceId,
      name: input.name,
      instruction: input.instruction,
      schedule: input.schedule,
      enabled: input.enabled,
      anchorAt: resetAnchor ? timestamp : existing.anchorAt,
      updatedAt: timestamp,
    }
    if (!reEnabled) return updated
    const { pausedAt: _pausedAt, ...withoutPause } = updated
    return { ...withoutPause, consecutiveFailures: 0 }
  }

  async function saveRoutine(raw: unknown): Promise<Routine> {
    const input = normalizeRoutineInput(raw)
    await assertBotExists(input.botId)
    const routines = await load()
    const timestamp = now()

    if (input.id !== undefined) {
      const existing = routines.find((routine) => routine.id === input.id)
      if (!existing) throw new Error('Routine not found')
      const updated = updateRoutine(existing, input, timestamp)
      await persist(routines.map((routine) => (routine.id === existing.id ? updated : routine)))
      return updated
    }

    if (routines.length >= MAX_ROUTINES) throw new Error(`At most ${MAX_ROUTINES} routines are supported`)
    const created: Routine = {
      botId: input.botId,
      workspaceId: input.workspaceId,
      name: input.name,
      instruction: input.instruction,
      schedule: input.schedule,
      enabled: input.enabled,
      id: newId(),
      anchorAt: timestamp,
      consecutiveFailures: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await persist([...routines, created])
    return created
  }

  async function removeRoutine(id: unknown): Promise<boolean> {
    if (!isValidRoutineId(id)) return false
    const routines = await load()
    if (!routines.some((routine) => routine.id === id)) return false
    await persist(routines.filter((routine) => routine.id !== id))
    return true
  }

  async function recordRunState(id: string, patch: RoutineRunPatch): Promise<Routine | null> {
    const routines = await load()
    const existing = routines.find((routine) => routine.id === id)
    if (!existing) return null
    const merged = removeUndefinedFields({ ...existing, ...patch, updatedAt: now() })
    const updated: Routine = merged.lastError === undefined
      ? merged
      : { ...merged, lastError: merged.lastError.slice(0, ROUTINE_ERROR_MAX_LENGTH) }
    await persist(routines.map((routine) => (routine.id === id ? updated : routine)))
    return updated
  }

  return {
    list: async () => [...(await load())],
    get: async (id) => (await load()).find((routine) => routine.id === id) ?? null,
    save: (input) => enqueue(() => saveRoutine(input)),
    remove: (id) => enqueue(() => removeRoutine(id)),
    recordRun: (id, patch) => enqueue(() => recordRunState(id, patch)),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

let defaultStore: RoutineStore | null = null

export function getRoutineStore(): RoutineStore {
  defaultStore ??= createRoutineStore(join(YIRA_HOME, 'routines.json'), undefined, undefined, { getBot: getBotById })
  return defaultStore
}

type RoutineRunHandler = (id: string) => Promise<RoutineRunResult>

let runHandler: RoutineRunHandler | null = null

/** The scheduler sets the function that starts a routine run. */
export function setRoutineRunHandler(handler: RoutineRunHandler): void {
  runHandler = handler
}

function broadcastRoutines(routines: Routine[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    try {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send(ROUTINES_CHANGED_CHANNEL, routines)
      }
    } catch {
      // A window can close while the list is broadcasting.
    }
  }
}

export function registerRoutinesIPC(store: RoutineStore = getRoutineStore()): void {
  store.subscribe(broadcastRoutines)

  ipcMain.handle('routines:list', (): Promise<Routine[]> => store.list())

  ipcMain.handle('routines:save', (_event, input: unknown): Promise<Routine> => store.save(input))

  ipcMain.handle('routines:delete', (_event, id: unknown): Promise<boolean> => store.remove(id))

  ipcMain.handle('routines:runNow', async (_event, id: unknown): Promise<RoutineRunResult> => {
    if (!runHandler) throw new Error('Routines are not ready yet')
    if (!isValidRoutineId(id)) throw new Error('Routine id is invalid')
    return runHandler(id)
  })
}
