import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { ipcMain, type WebContents } from 'electron'

import type {
  TerminalCreateResult,
  WorkspaceConfig,
  WorkspaceScript,
  WorkspaceScriptRun,
  WorkspaceScriptsSnapshot,
} from '@shared/types'
import type { TerminalSessionTarget } from '@shared/terminalSessionIdentity'
import { normalizeWorkspaceConfig } from '@shared/workspaceConfig'
import { discoverWorkspaceScripts, workspaceScriptTileId } from '../workspaceScripts'
import { normalizeAgentOpaqueId } from '../agents/query'
import { CONFIG_PATH } from '../paths'
import {
  createWorkspaceScriptSession,
  destroyWorkspaceScriptSession,
  listWorkspaceScriptSessions,
  subscribeWorkspaceScriptSessionEvents,
  type WorkspaceScriptSessionEvent,
} from './terminal'
import { getWorkspaceAgentConfigById } from './workspace'

export const SCRIPTS_CHANGED_CHANNEL = 'scripts:changed'

type WorkspaceScriptsConfig = Pick<WorkspaceConfig, 'rootFolderPath' | 'sourceControlRepositoryPaths' | 'customScripts'>

export interface ScriptsIPCOptions {
  ipc?: Pick<typeof ipcMain, 'handle'>
  discover?: typeof discoverWorkspaceScripts
  workspaceConfig?: (workspaceId: string) => Promise<WorkspaceScriptsConfig | null>
  createSession?: (target: TerminalSessionTarget, spec: { command: string; cwd: string }) => Promise<TerminalCreateResult>
  destroySession?: (target: TerminalSessionTarget) => Promise<void>
  listSessions?: (workspaceId: string) => Promise<TerminalSessionTarget[]>
  subscribeSessionEvents?: (listener: (event: WorkspaceScriptSessionEvent) => void) => () => void
}

interface ScriptsSubscription {
  sender: WebContents
  token: string
  workspaceId: string
  onDestroyed: () => void
  tail: Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeWorkspaceId(value: unknown): string {
  const normalized = normalizeAgentOpaqueId(value)
  if (!normalized) throw new Error('Invalid scripts workspace id')
  return normalized
}

function normalizeScriptId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 1024 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('Invalid workspace script id')
  }
  return value
}

function runKey(workspaceId: string, scriptId: string): string {
  return JSON.stringify([workspaceId, scriptId])
}

function targetKey(target: TerminalSessionTarget): string {
  return JSON.stringify([target.workspaceId, target.tileId])
}

function normalizeExitCode(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

async function defaultWorkspaceScriptsConfig(workspaceId: string): Promise<WorkspaceScriptsConfig | null> {
  const agentConfig = await getWorkspaceAgentConfigById(workspaceId)
  if (!agentConfig) return null

  // The existing workspace getter omits customScripts, so read and normalize that field from config.json.
  try {
    const raw: unknown = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'))
    if (!isRecord(raw) || !Array.isArray(raw.workspaces)) return agentConfig
    const workspace = raw.workspaces.find((candidate) => isRecord(candidate) && candidate.id === workspaceId)
    if (!isRecord(workspace) || !isRecord(workspace.config)) return agentConfig
    const customScripts = normalizeWorkspaceConfig({
      customScripts: workspace.config.customScripts as WorkspaceConfig['customScripts'],
    }).customScripts
    return { ...agentConfig, customScripts }
  } catch {
    return agentConfig
  }
}

/** Register workspace script discovery, execution, stop, and change subscriptions. */
export function registerScriptsIPC(options: ScriptsIPCOptions = {}): void {
  const ipc = options.ipc ?? ipcMain
  const discover = options.discover ?? discoverWorkspaceScripts
  const workspaceConfig = options.workspaceConfig ?? defaultWorkspaceScriptsConfig
  const createSession = options.createSession ?? createWorkspaceScriptSession
  const destroySession = options.destroySession ?? destroyWorkspaceScriptSession
  const listSessions = options.listSessions ?? listWorkspaceScriptSessions
  const subscribeSessionEvents = options.subscribeSessionEvents ?? subscribeWorkspaceScriptSessionEvents

  const runs = new Map<string, WorkspaceScriptRun>()
  const pendingRuns = new Map<string, Promise<WorkspaceScriptRun>>()
  const pendingExits = new Map<string, number | undefined>()
  const suppressedDestroyTargets = new Set<string>()
  const subscriptionsBySender = new Map<number, ScriptsSubscription>()
  const subscriptionsByToken = new Map<string, ScriptsSubscription>()

  function removeSubscription(senderId: number, token?: string): boolean {
    const subscription = subscriptionsBySender.get(senderId)
    if (!subscription || (token !== undefined && subscription.token !== token)) return false
    subscriptionsBySender.delete(senderId)
    subscriptionsByToken.delete(subscription.token)
    try { subscription.sender.removeListener('destroyed', subscription.onDestroyed) } catch { /* sender teardown */ }
    return true
  }

  function sendSnapshot(subscription: ScriptsSubscription, snapshot: WorkspaceScriptsSnapshot): void {
    try {
      if (!subscription.sender.isDestroyed()) subscription.sender.send(SCRIPTS_CHANGED_CHANNEL, snapshot)
    } catch {
      removeSubscription(subscription.sender.id, subscription.token)
    }
  }

  async function discoverForWorkspace(workspaceId: string): Promise<WorkspaceScript[]> {
    const config = await workspaceConfig(workspaceId)
    return discover({
      rootFolderPath: config?.rootFolderPath,
      sourceControlRepositoryPaths: config?.sourceControlRepositoryPaths,
      customScripts: config?.customScripts,
    })
  }

  async function reconcileRuns(workspaceId: string, scripts: WorkspaceScript[]): Promise<void> {
    const discoveredByTile = new Map(scripts.map((script) => [workspaceScriptTileId(script.id), script]))
    const liveSessions = await listSessions(workspaceId)

    for (const target of liveSessions) {
      if (target.workspaceId !== workspaceId || !/^script-[0-9a-f]{24}$/.test(target.tileId)) continue
      const script = discoveredByTile.get(target.tileId)
      const scriptId = script?.id ?? target.tileId
      const key = runKey(workspaceId, scriptId)
      for (const [previousKey, previousRun] of runs) {
        if (previousRun.tileId === target.tileId && previousKey !== key
          && previousKey.startsWith(`[${JSON.stringify(workspaceId)},`)) {
          runs.delete(previousKey)
        }
      }
      const previous = runs.get(key)
      runs.set(key, {
        scriptId,
        tileId: target.tileId,
        state: 'running',
        startedAt: previous?.state === 'running' ? previous.startedAt : new Date().toISOString(),
      })
    }
  }

  async function buildSnapshot(workspaceId: string): Promise<WorkspaceScriptsSnapshot> {
    const scripts = await discoverForWorkspace(workspaceId)
    await reconcileRuns(workspaceId, scripts)
    return {
      workspaceId,
      scripts,
      runs: [...runs.entries()]
        .filter(([key]) => key.startsWith(`[${JSON.stringify(workspaceId)},`))
        .map(([, run]) => run),
    }
  }

  function emitWorkspaceSnapshot(workspaceId: string): void {
    for (const subscription of subscriptionsBySender.values()) {
      if (subscription.workspaceId !== workspaceId) continue
      const next = subscription.tail.then(async () => {
        if (subscriptionsByToken.get(subscription.token) !== subscription) return
        const snapshot = await buildSnapshot(workspaceId)
        if (subscriptionsByToken.get(subscription.token) === subscription) sendSnapshot(subscription, snapshot)
      }).catch(() => undefined)
      subscription.tail = next
    }
  }

  function handleSessionEvent(event: WorkspaceScriptSessionEvent): void {
    const key = targetKey(event.target)
    if (event.type === 'exit') {
      let matched = false
      for (const [runId, run] of runs) {
        if (run.tileId !== event.target.tileId || !runId.startsWith(`[${JSON.stringify(event.target.workspaceId)},`)) continue
        const exitCode = normalizeExitCode(event.exitEvent?.exitCode)
        runs.set(runId, {
          ...run,
          state: 'exited',
          ...(exitCode !== undefined ? { exitCode } : {}),
        })
        matched = true
      }
      if (!matched) pendingExits.set(key, normalizeExitCode(event.exitEvent?.exitCode))
      emitWorkspaceSnapshot(event.target.workspaceId)
      return
    }

    if (suppressedDestroyTargets.has(key)) return
    for (const [runId, run] of runs) {
      if (run.tileId !== event.target.tileId || !runId.startsWith(`[${JSON.stringify(event.target.workspaceId)},`)) continue
      runs.delete(runId)
    }
    pendingExits.delete(key)
    emitWorkspaceSnapshot(event.target.workspaceId)
  }

  subscribeSessionEvents(handleSessionEvent)

  function runScript(workspaceId: string, scriptId: string): Promise<WorkspaceScriptRun> {
    const key = runKey(workspaceId, scriptId)
    const pending = pendingRuns.get(key)
    if (pending) return pending

    const operation = (async () => {
      const scripts = await discoverForWorkspace(workspaceId)
      const script = scripts.find((candidate) => candidate.id === scriptId)
      if (!script) throw new Error('Workspace script was not found')
      const current = runs.get(key)
      if (current?.state === 'running') return current

      const tileId = workspaceScriptTileId(script.id)
      const target = { workspaceId, tileId }
      const previous = current
      if (previous?.state === 'exited') {
        const destroyKey = targetKey(target)
        suppressedDestroyTargets.add(destroyKey)
        try {
          await destroySession(target)
        } finally {
          suppressedDestroyTargets.delete(destroyKey)
        }
        runs.delete(key)
      }

      const startedAt = new Date().toISOString()
      try {
        const result = await createSession(target, { command: script.command, cwd: script.cwd })
        const hasPendingExit = pendingExits.has(targetKey(target))
        const pendingExit = pendingExits.get(targetKey(target))
        pendingExits.delete(targetKey(target))
        const exitCode = normalizeExitCode(result.exitEvent?.exitCode) ?? pendingExit
        const run: WorkspaceScriptRun = {
          scriptId,
          tileId,
          state: result.exitEvent || hasPendingExit ? 'exited' : 'running',
          startedAt,
          ...(exitCode !== undefined ? { exitCode } : {}),
        }
        runs.set(key, run)
        emitWorkspaceSnapshot(workspaceId)
        return run
      } catch (error) {
        if (previous?.state === 'exited') emitWorkspaceSnapshot(workspaceId)
        throw error
      }
    })()

    pendingRuns.set(key, operation)
    void operation.finally(() => {
      if (pendingRuns.get(key) === operation) pendingRuns.delete(key)
    }).catch(() => undefined)
    return operation
  }

  ipc.handle('scripts:snapshot', async (_event, rawWorkspaceId: unknown): Promise<WorkspaceScriptsSnapshot> => {
    const workspaceId = normalizeWorkspaceId(rawWorkspaceId)
    return buildSnapshot(workspaceId)
  })

  ipc.handle('scripts:run', async (_event, input: unknown): Promise<WorkspaceScriptRun> => {
    if (!isRecord(input)) throw new Error('Invalid workspace script input')
    const workspaceId = normalizeWorkspaceId(input.workspaceId)
    const scriptId = normalizeScriptId(input.scriptId)
    return runScript(workspaceId, scriptId)
  })

  ipc.handle('scripts:stop', async (_event, input: unknown): Promise<void> => {
    if (!isRecord(input)) throw new Error('Invalid workspace script input')
    const workspaceId = normalizeWorkspaceId(input.workspaceId)
    const scriptId = normalizeScriptId(input.scriptId)
    const key = runKey(workspaceId, scriptId)
    const pending = pendingRuns.get(key)
    if (pending) await pending

    const snapshot = await buildSnapshot(workspaceId)
    const knownRun = runs.get(key)
    const script = snapshot.scripts.find((candidate) => candidate.id === scriptId)
    const orphanTileId = /^script-[0-9a-f]{24}$/.test(scriptId) ? scriptId : undefined
    if (!knownRun && !script && !orphanTileId) throw new Error('Workspace script was not found')

    const target = {
      workspaceId,
      tileId: knownRun?.tileId ?? (script ? workspaceScriptTileId(script.id) : orphanTileId!),
    }
    const destroyKey = targetKey(target)
    suppressedDestroyTargets.add(destroyKey)
    try {
      await destroySession(target)
    } finally {
      suppressedDestroyTargets.delete(destroyKey)
    }
    for (const [runId, run] of runs) {
      if (run.tileId === target.tileId && runId.startsWith(`[${JSON.stringify(workspaceId)},`)) runs.delete(runId)
    }
    pendingExits.delete(destroyKey)
    emitWorkspaceSnapshot(workspaceId)
  })

  ipc.handle('scripts:subscribe', (event, rawWorkspaceId: unknown): string | false => {
    let workspaceId: string
    try {
      workspaceId = normalizeWorkspaceId(rawWorkspaceId)
    } catch {
      return false
    }
    removeSubscription(event.sender.id)
    const token = randomUUID()
    const subscription: ScriptsSubscription = {
      sender: event.sender,
      token,
      workspaceId,
      onDestroyed: () => removeSubscription(event.sender.id, token),
      tail: Promise.resolve(),
    }
    subscriptionsBySender.set(event.sender.id, subscription)
    subscriptionsByToken.set(token, subscription)
    event.sender.once('destroyed', subscription.onDestroyed)
    return token
  })

  ipc.handle('scripts:unsubscribe', (event, token: unknown): boolean => {
    if (typeof token !== 'string' || !token) return false
    return removeSubscription(event.sender.id, token)
  })
}
