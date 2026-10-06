import { randomUUID } from 'crypto'
import { BrowserWindow, ipcMain, type WebContents } from 'electron'
import { promises as fs } from 'fs'
import { dirname, join } from 'path'

import type {
  AgentProvider,
  AgentProviderConfig,
  RemotePreparationResult,
  RemotePreparationStatus,
  RemoteTerminalConfig,
  ShellProfile,
  TerminalCreateOptions,
  TerminalCreateResult,
} from '@shared/types'
import type { TerminalSessionIdentity, TerminalSessionTarget } from '@shared/terminalSessionIdentity'
import type { TerminalDaemonSpawn } from '@shared/terminalDaemonProtocol'
import type { TerminalProcessActivitySnapshot } from '@shared/terminalProcessActivity'
import { normalizeAgentProviderConfig } from '@shared/workspaceConfig'
import { detectShellProfiles, detectSshClient } from '../shell-profiles'
import { buildTerminalHistorySetup } from '../terminal-history'
import { resolveTerminalWorkspaceRoot } from '../workspace-root'
import {
  getWorkspacePathById,
  getWorkspaceRemoteTerminalById,
  getWorkspaceRootFolderById,
} from './workspace'
import { buildRemoteSshLaunch } from '../remote-ssh'
import { ensureRemoteSshReady } from '../remote-host-readiness'
import { SemanticAgentAlertState } from '../agentAlerts'
import { getEnabledAgentProviders } from './settings'
import { agentSessionRegistry } from '../agents/registry'
import { normalizeAgentOpaqueId } from '../agents/query'
import { buildAgentTerminalLaunch, type AgentTerminalLaunch } from '../agents/terminal'
import { agentSessionExists, buildAgentCommand, normalizeResumeId } from '../agents/providers'
import {
  buildAgentShellCommand,
  resolveAgentShellProfile,
  type AgentShellProfileId,
} from '../agents/shellLaunch'
import { connectTerminalDaemon, stopTerminalDaemon } from '../terminalDaemonClient'
import { YIRA_HOME } from '../paths'
import { disposeProcessLister } from '../processTree'
import { TerminalProcessActivityMonitor } from '../terminalProcessActivity'
import {
  PersistentTerminalSessions,
  type PersistentTerminalSubscriber,
  terminalResultFromSnapshot,
} from '../persistentTerminalSessions'

function normalizeTerminalId(value: unknown): string | undefined {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return undefined
  const normalized = value.trim()
  return normalized || undefined
}

function normalizeTerminalSessionTarget(
  input: TerminalSessionTarget,
  isAgent: boolean,
): TerminalSessionTarget {
  const tileId = isAgent ? normalizeAgentOpaqueId(input?.tileId) : normalizeTerminalId(input?.tileId)
  const workspaceId = isAgent ? normalizeAgentOpaqueId(input?.workspaceId) : normalizeTerminalId(input?.workspaceId)
  if (!tileId) throw new Error(isAgent ? 'Invalid agent tile id' : 'Invalid terminal tile id')
  if (!workspaceId) throw new Error(isAgent ? 'Invalid agent workspace id' : 'Invalid terminal workspace id')
  return { tileId, workspaceId }
}

function normalizeTerminalSessionIdentity(input: TerminalSessionIdentity): TerminalSessionIdentity {
  const target = normalizeTerminalSessionTarget(input, false)
  if (!Number.isInteger(input?.generation) || input.generation < 1) {
    throw new Error('Invalid terminal session generation')
  }
  return { ...target, generation: input.generation }
}

function daemonSpawnEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

function appImagePathForDaemon(): string | undefined {
  if (process.platform !== 'linux') return undefined
  const appImagePath = process.env.APPIMAGE?.trim()
  if (!appImagePath || process.env.APPDIR !== dirname(process.execPath)) return undefined
  return appImagePath
}

const agentAlerts = new SemanticAgentAlertState({
  onChange: (_tileId, state) => {
    if (!state || BrowserWindow.getAllWindows().some((window) => !window.isDestroyed() && window.isFocused())) return
    BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())?.flashFrame(true)
  },
})

const TERMINAL_DAEMON_DIRECTORY = join(YIRA_HOME, 'terminal-runtime')

const persistentTerminalSessions = new PersistentTerminalSessions({
  connect: () => {
    const options = {
      directory: TERMINAL_DAEMON_DIRECTORY,
      executable: process.execPath,
      entryPath: join(__dirname, 'terminalDaemon.js'),
      appImagePath: appImagePathForDaemon(),
    }
    return connectTerminalDaemon(options)
  },
  registry: agentSessionRegistry,
  onAgentAlert: (identity, alert) => {
    if (alert && getEnabledAgentProviders().includes(alert.provider)) agentAlerts.report(alert)
    else agentAlerts.clearOnFocus(identity.tileId)
  },
  onAgentExit: (identity) => agentAlerts.clearOnDestroy(identity.tileId),
  onAgentDestroyed: (identity) => agentAlerts.clearOnDestroy(identity.tileId),
})

export interface AgentsViewLaunchSpec {
  provider: AgentProvider
  providerConfig: AgentProviderConfig
  prompt?: string
  resumeSessionId?: string
  cwd: string
  title?: string
  worktree?: {
    root: string
    branch: string
    worktrees: Array<{ path: string; baseSha: string }>
  }
}

let terminalProcessActivityMonitor: TerminalProcessActivityMonitor | null = null

function getTerminalProcessActivityMonitor(): TerminalProcessActivityMonitor {
  if (!terminalProcessActivityMonitor) {
    terminalProcessActivityMonitor = new TerminalProcessActivityMonitor({
      listRoots: () => persistentTerminalSessions.listRunningTerminalProcesses(),
      onChange: (snapshot) => {
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed()) window.webContents.send('terminal:processActivity:changed', snapshot)
        }
      },
      onClaudeSession: (root, sessionId) => {
        agentSessionRegistry.updateConversationId(root.workspaceId, root.tileId, sessionId)
      },
    })
  }
  return terminalProcessActivityMonitor
}

const remotePreparations = new Map<string, Promise<RemotePreparationResult>>()
const remotePreparationListeners = new Map<string, Set<WebContents>>()
const remotePreparationListenerCleanup = new Map<string, Map<WebContents, () => void>>()
const remotePreparationProgress = new Map<string, { workspaceId: string; status: RemotePreparationStatus }>()
let profiles: ShellProfile[] = []
let sshClient: string | null = null

function toPersistentSubscriber(sender: WebContents): PersistentTerminalSubscriber {
  return sender as unknown as PersistentTerminalSubscriber
}

function resolveProfile(shellProfileId: string): ShellProfile | undefined {
  return profiles.find(profile => profile.id === shellProfileId)
}

function resolveCompatibleAgentShellProfile(): ShellProfile & { id: AgentShellProfileId } {
  const shellProfile = resolveAgentShellProfile(profiles, process.platform, process.env.SHELL)
  if (!shellProfile || (shellProfile.id !== 'powershell' && shellProfile.id !== 'bash'
    && shellProfile.id !== 'zsh' && shellProfile.id !== 'fish')) {
    throw new Error('No compatible shell is available for agent sessions')
  }
  return shellProfile as ShellProfile & { id: AgentShellProfileId }
}

function remotePreparationKey(workspaceId: string, remoteTerminal: RemoteTerminalConfig): string {
  return JSON.stringify([
    workspaceId,
    remoteTerminal.host,
    remoteTerminal.port ?? 22,
    remoteTerminal.wakeOnLan?.macAddress ?? '',
    remoteTerminal.wakeOnLan?.broadcastAddress ?? '',
    remoteTerminal.wakeOnLan?.port ?? 9,
  ])
}

function removeRemotePreparationListener(key: string, sender: WebContents): void {
  const listeners = remotePreparationListeners.get(key)
  listeners?.delete(sender)

  const cleanup = remotePreparationListenerCleanup.get(key)?.get(sender)
  if (cleanup) {
    try { sender.removeListener('destroyed', cleanup) } catch { /* ignore */ }
    remotePreparationListenerCleanup.get(key)?.delete(sender)
  }

  if (listeners && listeners.size === 0) remotePreparationListeners.delete(key)
  const cleanupBySender = remotePreparationListenerCleanup.get(key)
  if (cleanupBySender && cleanupBySender.size === 0) remotePreparationListenerCleanup.delete(key)
}

function addRemotePreparationListener(key: string, sender: WebContents): void {
  if (sender.isDestroyed()) return

  const listeners = remotePreparationListeners.get(key) ?? new Set<WebContents>()
  if (listeners.has(sender)) return
  listeners.add(sender)
  remotePreparationListeners.set(key, listeners)

  const onDestroyed = (): void => removeRemotePreparationListener(key, sender)
  const cleanupBySender = remotePreparationListenerCleanup.get(key) ?? new Map<WebContents, () => void>()
  cleanupBySender.set(sender, onDestroyed)
  remotePreparationListenerCleanup.set(key, cleanupBySender)
  try {
    sender.once('destroyed', onDestroyed)
  } catch {
    removeRemotePreparationListener(key, sender)
  }
}

function sendRemotePreparationProgress(
  sender: WebContents,
  payload: { workspaceId: string; status: RemotePreparationStatus },
): boolean {
  try {
    if (sender.isDestroyed()) return false
    sender.send('terminal:preparationProgress', payload)
    return true
  } catch {
    return false
  }
}

function publishRemotePreparationProgress(
  key: string,
  workspaceId: string,
  status: RemotePreparationStatus,
): void {
  const payload = { workspaceId, status }
  remotePreparationProgress.set(key, payload)
  const listeners = remotePreparationListeners.get(key)
  if (!listeners) return

  for (const sender of [...listeners]) {
    if (!sendRemotePreparationProgress(sender, payload)) removeRemotePreparationListener(key, sender)
  }
}

function replayRemotePreparationProgress(key: string, sender: WebContents): void {
  const progress = remotePreparationProgress.get(key)
  if (progress && !sendRemotePreparationProgress(sender, progress)) {
    removeRemotePreparationListener(key, sender)
  }
}

function clearRemotePreparationProgress(key: string): void {
  const cleanupBySender = remotePreparationListenerCleanup.get(key)
  if (cleanupBySender) {
    for (const [sender, cleanup] of cleanupBySender) {
      try { sender.removeListener('destroyed', cleanup) } catch { /* ignore */ }
    }
  }
  remotePreparationListenerCleanup.delete(key)
  remotePreparationListeners.delete(key)
  remotePreparationProgress.delete(key)
}

export function initShellProfiles(): void {
  profiles = detectShellProfiles()
  sshClient = detectSshClient()
}

export function hydrateTerminalSessions(): Promise<void> {
  return persistentTerminalSessions.restore()
}

export function shutdownTerminalSessions(): Promise<void> {
  return persistentTerminalSessions.shutdown()
}

export function countRunningTerminalSessions(): number {
  return persistentTerminalSessions.runningSessionCount()
}

/** Close every terminal and stop the daemon so an installer can replace the app. */
export async function stopTerminalDaemonForUpdate(): Promise<void> {
  stopTerminalProcessActivityMonitor()
  await persistentTerminalSessions.shutdown()
  await stopTerminalDaemon({ directory: TERMINAL_DAEMON_DIRECTORY, timeoutMs: 3_000 })
}

export function stopTerminalProcessActivityMonitor(): void {
  terminalProcessActivityMonitor?.stop()
  disposeProcessLister()
}

export function destroyWorkspaceTerminalSessions(workspaceId: string): Promise<void> {
  return persistentTerminalSessions.destroyWorkspace(workspaceId)
}

export async function createAgentsViewSession(
  target: TerminalSessionTarget,
  spec: AgentsViewLaunchSpec,
): Promise<TerminalCreateResult> {
  const runtimeTarget = normalizeTerminalSessionTarget(target, true)
  if (spec.provider !== 'claude' && spec.provider !== 'codex') {
    throw new Error('Invalid agent provider')
  }
  const providerConfig = normalizeAgentProviderConfig(spec.providerConfig)
  if (!providerConfig.enabled) throw new Error(`Agent provider "${spec.provider}" is disabled`)
  const resumeSessionId = spec.resumeSessionId === undefined
    ? undefined
    : normalizeResumeId(spec.resumeSessionId)
  if (spec.resumeSessionId !== undefined && !resumeSessionId) {
    throw new Error('Invalid agent resume id')
  }
  const snapshot = await persistentTerminalSessions.create(runtimeTarget, async () => {
    const shellProfile = resolveCompatibleAgentShellProfile()

    // Like agent tiles, a new Claude session starts with a known ID so its
    // transcript can be found. Codex cannot preset one.
    const presetSessionId = !resumeSessionId && spec.provider === 'claude' ? randomUUID() : undefined
    const providerCommand = presetSessionId
      ? buildAgentCommand(spec.provider, providerConfig, presetSessionId, { newSession: true })
      : buildAgentCommand(spec.provider, providerConfig, resumeSessionId)
    const args = [...providerCommand.args]

    const launch = buildAgentShellCommand({
      shellProfileId: shellProfile.id,
      command: providerCommand.command,
      args,
      ...(!resumeSessionId && spec.prompt !== undefined ? { prompt: spec.prompt } : {}),
      platform: process.platform,
      exitWithAgent: true,
    })
    const startedAt = new Date().toISOString()
    const agent = {
      provider: spec.provider,
      sessionId: resumeSessionId ?? presetSessionId ?? runtimeTarget.tileId,
      startedAt,
      surface: 'agents-view' as const,
      ...(spec.title !== undefined ? { title: spec.title } : {}),
      ...(spec.worktree ? {
        worktreeRoot: spec.worktree.root,
        worktreeBranch: spec.worktree.branch,
        worktrees: spec.worktree.worktrees.map(({ path, baseSha }) => ({ path, baseSha })),
      } : {}),
    }

    return {
      target: { ...runtimeTarget },
      executable: shellProfile.shell,
      args: [...shellProfile.args, ...(launch.shellArgs ?? [])],
      cwd: spec.cwd,
      env: { ...daemonSpawnEnvironment(), ...launch.env },
      cols: 80,
      rows: 24,
      local: true,
      agent,
      ...(launch.initialCommand !== undefined ? { initialCommand: launch.initialCommand } : {}),
    }
  })
  return terminalResultFromSnapshot(snapshot)
}

export function destroyAgentsViewSession(target: TerminalSessionTarget): Promise<void> {
  return persistentTerminalSessions.destroyCurrent(normalizeTerminalSessionTarget(target, true))
}

async function buildTerminalDaemonSpawn(
  runtimeTarget: TerminalSessionTarget,
  options: TerminalCreateOptions,
): Promise<TerminalDaemonSpawn> {
  const isAgent = options.agent !== undefined
  const isRemoteSsh = options.connection === 'remote-ssh'
  if (isRemoteSsh && isAgent) throw new Error('Agent terminals cannot use remote SSH')

  const profile = isRemoteSsh ? undefined : resolveProfile(options.shellProfileId)
  if (!isRemoteSsh && !isAgent && !profile) {
    throw new Error(`Shell profile "${options.shellProfileId}" not found or not available`)
  }
  if (isRemoteSsh && !options.remoteTerminal) {
    throw new Error('Remote SSH is not configured for this workspace')
  }
  if (isRemoteSsh && !sshClient) {
    throw new Error('OpenSSH client is not available on this computer')
  }
  const agentShellProfile = isAgent ? resolveCompatibleAgentShellProfile() : undefined

  const spawnEnv = daemonSpawnEnvironment()
  let workspacePath: string | null = null
  let workspaceRootFolderPath: string | null | undefined
  let terminalRoot: ReturnType<typeof resolveTerminalWorkspaceRoot> | null = null
  let historySetup: ReturnType<typeof buildTerminalHistorySetup> = null

  if (!isRemoteSsh) {
    workspacePath = !isAgent ? await getWorkspacePathById(runtimeTarget.workspaceId) : null
    workspaceRootFolderPath = await getWorkspaceRootFolderById(runtimeTarget.workspaceId)
    terminalRoot = profile
      ? resolveTerminalWorkspaceRoot({
        shellProfileId: profile.id,
        workspaceRootFolderPath: workspaceRootFolderPath ?? undefined,
        wslStartInHome: options.wslStartInHome,
      })
      : null
    historySetup = profile && !isAgent ? buildTerminalHistorySetup({
      shellProfileId: profile.id,
      workspaceId: runtimeTarget.workspaceId,
      workspacePath: workspacePath ?? undefined,
      enabled: options.terminalHistoryEnabled,
    }) : null
  } else {
    workspaceRootFolderPath = options.workspaceDir
  }

  if (historySetup) {
    await fs.mkdir(historySetup.historyDir, { recursive: true })
    Object.assign(spawnEnv, historySetup.env)
  }

  let agentLaunch: AgentTerminalLaunch | null = null
  let agentShellCommand: ReturnType<typeof buildAgentShellCommand> | null = null
  if (isAgent) {
    const agentSessionId = options.agent!.sessionId
    agentLaunch = buildAgentTerminalLaunch({
      tileId: runtimeTarget.tileId,
      workspaceId: runtimeTarget.workspaceId,
      agent: options.agent!,
      providerConfig: options.agentProviderConfig,
      workspaceRoot: workspaceRootFolderPath ?? options.workspaceDir,
      fallbackCwd: terminalRoot?.cwd ?? process.cwd(),
      newSession: agentSessionId !== undefined
        && !(await agentSessionExists(options.agent!.provider, agentSessionId)),
    })
    agentShellCommand = buildAgentShellCommand({
      shellProfileId: agentShellProfile!.id,
      command: agentLaunch.command,
      args: agentLaunch.args,
      platform: process.platform,
      exitWithAgent: true,
    })
  }

  const args = isRemoteSsh
    ? buildRemoteSshLaunch(options.remoteTerminal!, options.remoteStartupCommand).args
    : agentShellProfile
      ? [...agentShellProfile.args, ...(agentShellCommand?.shellArgs ?? [])]
      : [...profile!.args]
  if (terminalRoot && !agentLaunch) args.push(...terminalRoot.spawnArgs)
  if (historySetup?.shellArgs && !isAgent && !isRemoteSsh) args.push(...historySetup.shellArgs)

  const agent = agentLaunch
    ? {
        provider: agentLaunch.provider,
        sessionId: agentLaunch.sessionId,
        startedAt: new Date().toISOString(),
      }
    : undefined
  const initialCommand = agentShellCommand?.initialCommand
    ?? (!isRemoteSsh && !isAgent && options.initialCommand?.trim() ? options.initialCommand : undefined)

  return {
    target: { ...runtimeTarget },
    executable: isRemoteSsh ? sshClient! : agentShellProfile ? agentShellProfile.shell : profile!.shell,
    args,
    cwd: agentLaunch?.cwd ?? terminalRoot?.cwd ?? process.cwd(),
    env: agentShellCommand ? { ...spawnEnv, ...agentShellCommand.env } : spawnEnv,
    cols: 80,
    rows: 24,
    local: !isRemoteSsh,
    ...(agent ? { agent } : {}),
    ...(historySetup?.prependCommand ? { prependCommand: historySetup.prependCommand } : {}),
    ...(initialCommand ? { initialCommand } : {}),
  }
}

export function setAgentAlertsEnabled(enabled: boolean): void {
  agentAlerts.setEnabled(enabled)
}

export function registerTerminalIPC(): void {
  const processActivityMonitor = getTerminalProcessActivityMonitor()
  ipcMain.handle('terminal:processActivity:snapshot', () => processActivityMonitor.snapshot())
  processActivityMonitor.start()

  ipcMain.handle('shellProfiles:list', async () => profiles)
  ipcMain.handle('terminal:sshAvailable', async () => sshClient !== null)

  ipcMain.handle('terminal:prepareRemote', async (event, workspaceId: string) => {
    const runtimeWorkspaceId = normalizeTerminalId(workspaceId)
    if (!runtimeWorkspaceId) throw new Error('Invalid terminal workspace id')

    const remoteTerminal = await getWorkspaceRemoteTerminalById(runtimeWorkspaceId)
    if (!remoteTerminal) throw new Error('Remote SSH is not configured for this workspace')

    const key = remotePreparationKey(runtimeWorkspaceId, remoteTerminal)
    addRemotePreparationListener(key, event.sender)
    const activePreparation = remotePreparations.get(key)
    if (activePreparation) {
      replayRemotePreparationProgress(key, event.sender)
      return activePreparation
    }

    const preparation = ensureRemoteSshReady(remoteTerminal, {
      onProgress: (status) => publishRemotePreparationProgress(key, runtimeWorkspaceId, status),
    }).finally(() => {
      if (remotePreparations.get(key) === preparation) {
        remotePreparations.delete(key)
        clearRemotePreparationProgress(key)
      }
    })
    remotePreparations.set(key, preparation)
    return preparation
  })

  ipcMain.handle('terminal:create', async (_event, target: TerminalSessionTarget, options: TerminalCreateOptions) => {
    const isAgent = options?.agent !== undefined
    const runtimeTarget = normalizeTerminalSessionTarget(target, isAgent)
    if (options?.agent?.surface === 'agents-view') {
      const existing = await persistentTerminalSessions.attach(runtimeTarget)
      if (!existing || existing.exitEvent || existing.agent?.surface !== 'agents-view') {
        throw new Error('Agent session is no longer running')
      }
      return terminalResultFromSnapshot(existing)
    }
    const snapshot = await persistentTerminalSessions.create(
      runtimeTarget,
      () => buildTerminalDaemonSpawn(runtimeTarget, options),
    )
    return terminalResultFromSnapshot(snapshot)
  })

  ipcMain.handle('terminal:attach', async (event, identity: TerminalSessionIdentity) => {
    const runtimeIdentity = normalizeTerminalSessionIdentity(identity)
    const snapshot = await persistentTerminalSessions.rendererAttach(
      runtimeIdentity,
      toPersistentSubscriber(event.sender),
    )
    return terminalResultFromSnapshot(snapshot)
  })

  ipcMain.handle('terminal:write', async (_, identity: TerminalSessionIdentity, data: string) => {
    await persistentTerminalSessions.write(normalizeTerminalSessionIdentity(identity), data)
  })

  ipcMain.handle('terminal:acknowledgeAgentAlert', async (_, identity: TerminalSessionIdentity) => {
    await persistentTerminalSessions.acknowledge(normalizeTerminalSessionIdentity(identity))
  })

  ipcMain.handle('terminal:setAgentAlertsEnabled', (_, enabled: boolean) => {
    setAgentAlertsEnabled(enabled === true)
  })

  ipcMain.handle('terminal:resize', async (_, identity: TerminalSessionIdentity, cols: number, rows: number) => {
    await persistentTerminalSessions.resize(normalizeTerminalSessionIdentity(identity), cols, rows)
  })

  ipcMain.handle('terminal:destroy', async (_, identity: TerminalSessionIdentity) => {
    await persistentTerminalSessions.destroy(normalizeTerminalSessionIdentity(identity))
  })

  ipcMain.handle('terminal:destroyCurrent', async (_, target: TerminalSessionTarget) => {
    await persistentTerminalSessions.destroyCurrent(normalizeTerminalSessionTarget(target, false))
  })

  ipcMain.handle('terminal:closeWorkspace', async (_, workspaceId: string) => {
    if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
      throw new Error('Invalid workspace id')
    }
    await persistentTerminalSessions.closeWorkspace(workspaceId)
  })

  ipcMain.handle('terminal:detach', async (event, identity: TerminalSessionIdentity) => {
    await persistentTerminalSessions.rendererDetach(
      normalizeTerminalSessionIdentity(identity),
      toPersistentSubscriber(event.sender),
    )
  })
}
