import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, ipcMain, type WebContents } from 'electron'
import type {
  AgentProviderAvailabilitySnapshot,
  AgentProvider,
  AgentProviderConfig,
  AgentSessionCapabilities,
  AgentSessionCloseResult,
  AgentSessionCreateResult,
  AgentSessionHistoryResult,
  AgentSessionTranscriptQuery,
  AgentSessionTranscriptResult,
  AgentActiveSessionSnapshot,
  AgentUsageSnapshot,
  AgentUsageDetailsSnapshot,
  AgentUsageHistoryRequest,
  AgentUsageHistorySnapshot,
  AgentDetectionSnapshot,
  WorkspaceConfig,
} from '@shared/types'
import type { AgentUsageService } from '../agentUsage'
import type { AgentUsageDetailsService } from '../agentUsageDetails'
import type { AgentUsageIndex } from '../agentUsageIndex'
import { hasManagedAgentHooks } from '../agentHookConfiguration'
import {
  getAgentHomeDirectory,
  getAgentProviderAvailability,
  normalizeResumeId,
} from '../agents/providers'
import { agentSessionRegistry, type AgentSessionRegistry } from '../agents/registry'
import { readAgentSessionHistory } from '../agents/history'
import { readAgentSessionTranscript } from '../agents/transcript'
import {
  createAgentWorkspaceWorktrees,
  removeAgentWorktreeIfClean,
  resolveWorkspaceWorktreeRepositories,
  type AgentWorkspaceWorktree,
  type AgentWorkspaceWorktreeCreateInput,
  type AgentWorktreeRepository,
  type AgentWorktreeCleanupInput,
  type AgentWorktreeRemovalResult,
  type ResolveWorkspaceWorktreeRepositoriesInput,
} from '../agents/worktree'
import { resolveAgentCwd } from '../agents/terminal'
import {
  isSafeAgentHistoryQueryInput,
  isAgentProvider,
  normalizeAgentHistoryQuery,
  normalizeAgentOpaqueId,
} from '../agents/query'
import { YIRA_HOME } from '../paths'
import { getWorkspaceAgentConfigById, getWorkspaceRootFolderById } from './workspace'
import type { AgentsViewLaunchSpec } from './terminal'
import type { TerminalSessionTarget } from '@shared/terminalSessionIdentity'

export const AGENT_SESSIONS_CHANGED_CHANNEL = 'agents:sessions:changed'
export const AGENT_USAGE_CHANGED_CHANNEL = 'agents:usage:changed'

interface AgentSubscription {
  sender: WebContents
  token: string
  unsubscribe: () => void
  onDestroyed: () => void
}
export interface AgentIPCOptions {
  registry?: AgentSessionRegistry
  availability?: () => Promise<AgentProviderAvailabilitySnapshot>
  history?: (options: {
    provider?: 'claude' | 'codex'
    workspaceRoot?: string
    search?: string
    limit?: number
  }) => Promise<AgentSessionHistoryResult>
  transcript?: (
    query: AgentSessionTranscriptQuery,
    options: { workspaceRoot?: string },
  ) => Promise<AgentSessionTranscriptResult>
  usageService?: Pick<AgentUsageService, 'getSnapshot' | 'refresh' | 'subscribe'>
  usageDetailsService?: Pick<AgentUsageDetailsService, 'getSnapshot'>
  usageIndex?: Pick<AgentUsageIndex, 'getHistory'>
  enabledProviders?: () => Promise<AgentProvider[]>
  workspaces?: () => Promise<Array<{ id: string; rootFolderPath: string }>>
  createSession?: (target: TerminalSessionTarget, spec: AgentsViewLaunchSpec) => Promise<unknown>
  destroySession?: (target: TerminalSessionTarget) => Promise<void>
  workspaceAgentConfig?: (workspaceId: string) => Promise<Pick<WorkspaceConfig, 'rootFolderPath' | 'sourceControlRepositoryPaths' | 'agentProvider' | 'agentProviders'> | null>
  worktrees?: AgentIPCWorktrees
}

export interface AgentIPCWorktrees {
  resolveWorkspaceWorktreeRepositories: (input: ResolveWorkspaceWorktreeRepositoriesInput) => Promise<AgentWorktreeRepository[]>
  createAgentWorkspaceWorktrees: (input: AgentWorkspaceWorktreeCreateInput) => Promise<AgentWorkspaceWorktree>
  removeAgentWorktreeIfClean: (input: AgentWorktreeCleanupInput) => Promise<AgentWorktreeRemovalResult>
}

interface NormalizedAgentSessionCreateInput {
  workspaceId: string
  prompt?: string
  resumeSessionId?: string
  resumeCwd?: string
  worktree: boolean
  provider?: AgentProvider
}

const defaultWorktrees: AgentIPCWorktrees = {
  resolveWorkspaceWorktreeRepositories,
  createAgentWorkspaceWorktrees,
  removeAgentWorktreeIfClean,
}

async function removeWorkspaceWorktrees(
  worktree: { branch: string; worktrees: Array<{ path: string; baseSha: string }> },
  remove: AgentIPCWorktrees['removeAgentWorktreeIfClean'],
): Promise<boolean> {
  for (const entry of [...worktree.worktrees].reverse()) {
    const result = await remove({ path: entry.path, branch: worktree.branch, baseSha: entry.baseSha })
    if (result === 'kept') return false
  }
  return true
}

async function removeEmptyWorktreeRoot(root: string): Promise<void> {
  try {
    await fs.rmdir(root)
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    if (code !== 'ENOENT' && code !== 'ENOTEMPTY' && code !== 'EEXIST') throw error
  }
}

const subscriptions = new Map<number, AgentSubscription>()

function removeSubscription(senderId: number, token?: string): boolean {
  const subscription = subscriptions.get(senderId)
  if (!subscription || (token !== undefined && subscription.token !== token)) return false
  subscriptions.delete(senderId)
  try {
    subscription.sender.removeListener('destroyed', subscription.onDestroyed)
  } catch {
    // WebContents can finish tearing down while explicit unsubscribe runs.
  }
  try {
    subscription.unsubscribe()
  } catch {
    // A renderer teardown must not make an IPC lifecycle operation throw.
  }
  return true
}

function sendSnapshot(sender: WebContents, snapshot: AgentActiveSessionSnapshot): void {
  try {
    if (sender.isDestroyed()) return
    sender.send(AGENT_SESSIONS_CHANGED_CHANNEL, snapshot)
  } catch {
    // A renderer may disappear between isDestroyed and send.
  }
}

function broadcastUsageSnapshot(snapshot: AgentUsageSnapshot): void {
  for (const window of BrowserWindow.getAllWindows()) {
    try {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send(AGENT_USAGE_CHANGED_CHANNEL, snapshot)
      }
    } catch {
      // A window can close while a refresh is broadcasting.
    }
  }
}

function normalizedWorkspaceId(value: unknown): string | undefined {
  return value === undefined ? undefined : normalizeAgentOpaqueId(value)
}

async function historyForQuery(input: unknown, readHistory: AgentIPCOptions['history']): Promise<AgentSessionHistoryResult> {
  if (!isSafeAgentHistoryQueryInput(input)) return { items: [], hasMore: false }
  const query = normalizeAgentHistoryQuery(input)
  if (!query) return { items: [], hasMore: false }
  let workspaceRoot: string | undefined
  if (query.workspaceId) {
    workspaceRoot = await getWorkspaceRootFolderById(query.workspaceId) ?? ''
  }
  const reader = readHistory ?? readAgentSessionHistory
  return reader({
    provider: query.provider,
    workspaceRoot,
    search: query.search,
    limit: query.limit,
  })
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function normalizeTranscriptQuery(input: unknown): AgentSessionTranscriptQuery | null {
  if (!isPlainRecord(input) || !isAgentProvider(input.provider)) return null
  const identifier = normalizeResumeId(input.identifier)
  if (!identifier) return null

  const workspaceId = input.workspaceId === undefined
    ? undefined
    : normalizeAgentOpaqueId(input.workspaceId)
  if (input.workspaceId !== undefined && !workspaceId) return null
  if (input.before !== undefined && !isNonNegativeInteger(input.before)) return null
  if (input.limit !== undefined && !isNonNegativeInteger(input.limit)) return null

  return {
    provider: input.provider,
    identifier,
    ...(workspaceId ? { workspaceId } : {}),
    ...(input.before !== undefined ? { before: input.before } : {}),
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
  }
}

const emptyTranscriptResult = (): AgentSessionTranscriptResult => ({
  entries: [],
  start: 0,
  total: 0,
  found: false,
})

async function transcriptForQuery(
  input: unknown,
  readTranscript: AgentIPCOptions['transcript'],
): Promise<AgentSessionTranscriptResult> {
  const query = normalizeTranscriptQuery(input)
  if (!query) return emptyTranscriptResult()

  let workspaceRoot: string | undefined
  if (query.workspaceId) workspaceRoot = await getWorkspaceRootFolderById(query.workspaceId) ?? ''

  const reader = readTranscript ?? readAgentSessionTranscript
  return reader(query, { workspaceRoot })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeCreateInput(value: unknown): NormalizedAgentSessionCreateInput {
  if (!isRecord(value)) throw new Error('Invalid agent session input')

  const workspaceId = normalizeAgentOpaqueId(value.workspaceId)
  if (!workspaceId) throw new Error('Invalid agent workspace id')

  let resumeSessionId: string | undefined
  if (value.resumeSessionId !== undefined) {
    const normalizedId = normalizeAgentOpaqueId(value.resumeSessionId)
    resumeSessionId = normalizedId && normalizeResumeId(normalizedId) ? normalizedId : undefined
    if (!resumeSessionId) throw new Error('Invalid agent resume id')
  }

  let prompt: string | undefined
  if (value.prompt !== undefined) {
    if (typeof value.prompt !== 'string' || value.prompt.length > 20_000
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(value.prompt)) {
      throw new Error('Invalid agent prompt')
    }
    prompt = value.prompt
  }
  if (!resumeSessionId && (!prompt || !prompt.trim())) throw new Error('Agent prompt is required')

  let resumeCwd: string | undefined
  if (value.resumeCwd !== undefined) {
    if (typeof value.resumeCwd !== 'string') throw new Error('Invalid agent cwd')
    resumeCwd = value.resumeCwd
  }

  if (value.worktree !== undefined && typeof value.worktree !== 'boolean') {
    throw new Error('Invalid agent worktree option')
  }
  if (value.provider !== undefined && !isAgentProvider(value.provider)) {
    throw new Error('Invalid agent provider')
  }

  return {
    workspaceId,
    ...(prompt !== undefined ? { prompt } : {}),
    ...(resumeSessionId ? { resumeSessionId } : {}),
    ...(resumeCwd !== undefined ? { resumeCwd } : {}),
    worktree: value.worktree === true,
    ...(value.provider !== undefined ? { provider: value.provider } : {}),
  }
}

async function enabledProviders(options: AgentIPCOptions): Promise<AgentProvider[]> {
  if (options.enabledProviders) return options.enabledProviders()
  const settings = await import('./settings')
  return settings.getEnabledAgentProviders()
}

function effectiveWorkspaceProvider(
  config: Pick<WorkspaceConfig, 'agentProvider' | 'agentProviders'> | null,
  enabled: AgentProvider[],
): AgentProvider | null {
  const provider = config?.agentProvider
  if (!isAgentProvider(provider) || !enabled.includes(provider)) return null
  return config && config.agentProviders?.[provider]?.enabled === true ? provider : null
}

function sessionTitle(prompt: string | undefined, resumeSessionId: string | undefined): string {
  if (resumeSessionId) {
    const shortId = resumeSessionId.replace(/^agent-/, '').slice(0, 8)
    return `Resume ${shortId}`
  }
  return (prompt ?? '').split(/\r\n|\n|\r/, 1)[0].trim().slice(0, 80)
}

async function launchAgentSession(
  options: AgentIPCOptions,
  target: TerminalSessionTarget,
  spec: AgentsViewLaunchSpec,
): Promise<void> {
  if (options.createSession) {
    await options.createSession(target, spec)
    return
  }
  const terminal = await import('./terminal')
  await terminal.createAgentsViewSession(target, spec)
}

async function destroyAgentSession(options: AgentIPCOptions, target: TerminalSessionTarget): Promise<void> {
  if (options.destroySession) {
    await options.destroySession(target)
    return
  }
  const terminal = await import('./terminal')
  await terminal.destroyAgentsViewSession(target)
}

/** Register all renderer-facing agent operations with validated, data-only inputs. */
export function registerAgentsIPC(options: AgentIPCOptions = {}): void {
  const registry = options.registry ?? agentSessionRegistry
  const availability = options.availability ?? (() => getAgentProviderAvailability())
  const usageService = options.usageService
  const usageDetailsService = options.usageDetailsService
  const usageIndex = options.usageIndex

  ipcMain.handle('agents:availability', async (): Promise<AgentProviderAvailabilitySnapshot> => availability())
  ipcMain.handle('agents:detect', async (): Promise<AgentDetectionSnapshot> => {
    const home = homedir()
    const result = {} as AgentDetectionSnapshot
    for (const provider of ['claude', 'codex'] as const) {
      const root = getAgentHomeDirectory(provider, home)
      let installed = false
      let hooksInstalled = false
      try { installed = (await fs.stat(root)).isDirectory() } catch { /* absent */ }
      try {
        const hookPath = join(root, provider === 'claude' ? 'settings.json' : 'hooks.json')
        hooksInstalled = hasManagedAgentHooks(await fs.readFile(hookPath, 'utf8'), provider)
      } catch { /* absent or unreadable */ }
      result[provider] = { installed, hooksInstalled }
    }
    return result
  })
  ipcMain.handle('agents:usage:snapshot', async (): Promise<AgentUsageSnapshot | null> => {
    await usageService?.refresh()
    return usageService?.getSnapshot() ?? null
  })
  ipcMain.handle('agents:usage:details', async (): Promise<AgentUsageDetailsSnapshot | null> => {
    try {
      return usageDetailsService ? await usageDetailsService.getSnapshot() : null
    } catch {
      return null
    }
  })
  ipcMain.handle('agents:usage:history', async (_event, request: AgentUsageHistoryRequest): Promise<AgentUsageHistorySnapshot | null> => {
    try {
      if (!usageIndex || !request || !['today', '7d', '30d'].includes(request.period)) return null
      const enabled = await (options.enabledProviders?.() ?? Promise.resolve(['claude', 'codex'] as AgentProvider[]))
      const workspaces = await (options.workspaces?.() ?? Promise.resolve([]))
      return await usageIndex.getHistory(request, enabled, workspaces)
    } catch { return null }
  })
  usageService?.subscribe(broadcastUsageSnapshot)

  const workspaceAgentConfig = options.workspaceAgentConfig ?? getWorkspaceAgentConfigById
  const worktrees = options.worktrees ?? defaultWorktrees

  ipcMain.handle('agents:sessions:capabilities', async (_event, workspaceId: unknown): Promise<AgentSessionCapabilities> => {
    const normalizedWorkspaceId = normalizeAgentOpaqueId(workspaceId)
    if (!normalizedWorkspaceId) throw new Error('Invalid agent workspace id')
    const config = await workspaceAgentConfig(normalizedWorkspaceId)
    const enabled = await enabledProviders(options)
    const provider = effectiveWorkspaceProvider(config, enabled)
    const rootPath = config?.rootFolderPath
    let repositories: AgentWorktreeRepository[] = []
    if (typeof rootPath === 'string' && rootPath.trim().length > 0) {
      try {
        repositories = await worktrees.resolveWorkspaceWorktreeRepositories({
          rootPath,
          configuredRepositoryPaths: config?.sourceControlRepositoryPaths ?? [],
        })
      } catch {
        // An inaccessible workspace cannot offer a worktree capability.
      }
    }
    const providers = config
      ? enabled.filter((candidate) => config.agentProviders?.[candidate]?.enabled === true)
      : []
    const worktreeAvailable = repositories.length > 0
    return { provider, providers, worktreeAvailable }
  })

  ipcMain.handle('agents:sessions:create', async (_event, rawInput: unknown): Promise<AgentSessionCreateResult> => {
    const input = normalizeCreateInput(rawInput)
    const config = await workspaceAgentConfig(input.workspaceId)
    const enabled = await enabledProviders(options)
    if (!config) throw new Error('This workspace has no enabled agent')

    let provider: AgentProvider | null
    if (input.provider) {
      if (!enabled.includes(input.provider)) {
        throw new Error(`Agent provider "${input.provider}" is disabled in user settings`)
      }
      if (config.agentProviders[input.provider]?.enabled !== true) {
        throw new Error(`Agent provider "${input.provider}" is disabled for this workspace`)
      }
      provider = input.provider
    } else {
      provider = effectiveWorkspaceProvider(config, enabled)
    }
    if (!provider) throw new Error('This workspace has no enabled agent')

    const providerConfig: AgentProviderConfig = config.agentProviders[provider]

    const workspaceRoot = typeof config.rootFolderPath === 'string' && config.rootFolderPath.trim()
      ? config.rootFolderPath
      : homedir()
    let cwd = resolveAgentCwd(workspaceRoot, input.resumeCwd)
    const tileId = `agent-${randomUUID()}`
    const title = sessionTitle(input.prompt, input.resumeSessionId)
    let worktree: AgentWorkspaceWorktree | undefined

    if (input.worktree) {
      if (!config.rootFolderPath) throw new Error('Agent worktree requires a workspace folder')
      const repositories = await worktrees.resolveWorkspaceWorktreeRepositories({
        rootPath: config.rootFolderPath,
        configuredRepositoryPaths: config.sourceControlRepositoryPaths,
      })
      if (repositories.length === 0) {
        throw new Error('Agent worktrees require a Git repository with at least one commit')
      }
      if (repositories.length > 32) {
        throw new Error('Agent worktrees support up to 32 repositories')
      }
      worktree = await worktrees.createAgentWorkspaceWorktrees({
        rootPath: config.rootFolderPath,
        repositories,
        sessionId: tileId,
        baseDirectory: join(YIRA_HOME, 'worktrees'),
      })
      cwd = worktree.root
    }

    const target = { workspaceId: input.workspaceId, tileId }
    const spec: AgentsViewLaunchSpec = {
      provider,
      providerConfig,
      ...(!input.resumeSessionId && input.prompt !== undefined ? { prompt: input.prompt } : {}),
      ...(input.resumeSessionId ? { resumeSessionId: input.resumeSessionId } : {}),
      cwd,
      title,
      ...(worktree ? {
        worktree: {
          root: worktree.root,
          branch: worktree.branch,
          worktrees: worktree.worktrees.map(({ path, baseSha }) => ({ path, baseSha })),
        },
      } : {}),
    }

    try {
      await launchAgentSession(options, target, spec)
    } catch (error) {
      if (worktree) {
        try {
          const removed = await removeWorkspaceWorktrees(worktree, worktrees.removeAgentWorktreeIfClean)
          if (removed) await removeEmptyWorktreeRoot(worktree.root)
        } catch {
          // Preserve the launch failure while still attempting safe cleanup.
        }
      }
      throw error
    }

    return { workspaceId: input.workspaceId, tileId, provider }
  })

  ipcMain.handle('agents:sessions:close', async (_event, rawInput: unknown): Promise<AgentSessionCloseResult> => {
    if (!isRecord(rawInput)) throw new Error('Invalid agent session input')
    const workspaceId = normalizeAgentOpaqueId(rawInput.workspaceId)
    const tileId = normalizeAgentOpaqueId(rawInput.tileId)
    if (!workspaceId || !tileId) throw new Error('Invalid agent session id')

    const session = registry.get(workspaceId, tileId)
    if (!session) throw new Error('Agent session not found')
    if (session.surface !== 'agents-view') throw new Error('Only Agents View sessions can be closed here')

    const target = { workspaceId, tileId }
    await destroyAgentSession(options, target)
    registry.remove(workspaceId, tileId)

    let worktreeResult: AgentSessionCloseResult['worktree'] = 'none'
    let worktreeRoot: string | undefined
    if (session.worktreeRoot && session.worktreeBranch && session.worktrees?.length) {
      worktreeRoot = session.worktreeRoot
      try {
        const allRemoved = await removeWorkspaceWorktrees({
          branch: session.worktreeBranch,
          worktrees: session.worktrees,
        }, worktrees.removeAgentWorktreeIfClean)
        if (allRemoved) {
          await removeEmptyWorktreeRoot(session.worktreeRoot)
          worktreeResult = 'removed'
          worktreeRoot = undefined
        } else {
          worktreeResult = 'kept'
        }
      } catch {
        // The session is already closed. A worktree Git refuses to remove
        // (for example, files still locked on Windows) stays in place.
        worktreeResult = 'kept'
      }
    }
    return { worktree: worktreeResult, ...(worktreeResult === 'kept' && worktreeRoot ? { worktreeRoot } : {}) }
  })

  ipcMain.handle('agents:sessions:snapshot', (_event, workspaceId: unknown): AgentActiveSessionSnapshot => {
    const normalized = normalizedWorkspaceId(workspaceId)
    if (workspaceId !== undefined && !normalized) return { sessions: [] }
    return registry.snapshot(normalized)
  })

  ipcMain.handle('agents:sessions:subscribe', (event, workspaceId: unknown): string | false => {
    const normalized = normalizedWorkspaceId(workspaceId)
    if (workspaceId !== undefined && !normalized) return false
    removeSubscription(event.sender.id)
    const token = randomUUID()
    const unsubscribe = registry.subscribe(
      (snapshot) => sendSnapshot(event.sender, normalized ? {
        sessions: snapshot.sessions.filter((session) => session.workspaceId === normalized),
      } : snapshot),
    )
    const onDestroyed = () => removeSubscription(event.sender.id, token)
    subscriptions.set(event.sender.id, { sender: event.sender, token, unsubscribe, onDestroyed })
    event.sender.once('destroyed', onDestroyed)
    return token
  })

  ipcMain.handle('agents:sessions:unsubscribe', (event, token: unknown): boolean => {
    if (typeof token !== 'string' || !token) return false
    return removeSubscription(event.sender.id, token)
  })

  ipcMain.handle('agents:history', async (_event, input: unknown): Promise<AgentSessionHistoryResult> => {
    try {
      return await historyForQuery(input, options.history)
    } catch {
      // A provider can rotate or partially write local files while the query
      // runs. Renderer receives an empty normalized result, never an error or
      // an untrusted filesystem detail.
      return { items: [], hasMore: false }
    }
  })

  ipcMain.handle('agents:history:transcript', async (_event, input: unknown): Promise<AgentSessionTranscriptResult> => {
    try {
      return await transcriptForQuery(input, options.transcript)
    } catch {
      return emptyTranscriptResult()
    }
  })
}
