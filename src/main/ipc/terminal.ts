import { BrowserWindow, ipcMain, WebContents } from 'electron'
import { promises as fs } from 'fs'
import type {
  RemotePreparationResult,
  RemotePreparationStatus,
  RemoteTerminalConfig,
  ShellProfile,
  TerminalCreateOptions,
  TerminalCreateResult,
  TerminalExitEvent,
} from '@shared/types'
import {
  sameTerminalSessionIdentity,
  terminalSessionLookupKey,
  type TerminalSessionIdentity,
  type TerminalSessionTarget,
} from '@shared/terminalSessionIdentity'
import { detectShellProfiles, detectSshClient } from '../shell-profiles'
import { buildTerminalHistorySetup } from '../terminal-history'
import { resizeTerminalDimensions, type TerminalDimensions } from '../terminalDimensions'
import { resolveTerminalWorkspaceRoot } from '../workspace-root'
import {
  getWorkspacePathById,
  getWorkspaceRemoteTerminalById,
  getWorkspaceRootFolderById,
} from './workspace'
import { buildRemoteSshLaunch } from '../remote-ssh'
import { ensureRemoteSshReady } from '../remote-host-readiness'
import { AgentAlertBridge } from '../agentAlertBridge'
import { SemanticAgentAlertState, type AgentAlertState } from '../agentAlerts'
import { agentSessionRegistry } from '../agents/registry'
import { normalizeAgentOpaqueId } from '../agents/query'
import {
  buildAgentTerminalLaunch,
  createAgentTerminalExitGate,
  createAgentTerminalLifecycle,
  type AgentTerminalLaunch,
  type AgentTerminalLifecycle,
} from '../agents/terminal'
import {
  TerminalSessionManager,
  type ManagedTerminalSession,
  type TerminalShutdownResult,
} from '../terminalSessions'
import { TerminalDelivery } from '../terminalDelivery'
import { DeferredTerminalStartupCommand } from '../terminalStartupCommand'

// node-pty must be required (not imported) due to native module ESM issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pty = require('node-pty')

interface PtyInstance {
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
  onData: (cb: (data: string) => void) => void
  onExit?: (cb: () => void) => void
}

interface SpawnedPtyInstance extends Omit<PtyInstance, 'onExit'> {
  onExit?: (cb: (event: TerminalExitEvent) => void) => void
}

interface TerminalSession extends ManagedTerminalSession {
  pty: PtyInstance
  delivery: TerminalDelivery<WebContents>
  dimensions: TerminalDimensions
  alertListeners: Set<WebContents>
  agentProvider?: AgentTerminalLaunch['provider']
  agentLifecycle?: AgentTerminalLifecycle
}

const terminalSessionManager = new TerminalSessionManager()
const terminalSessionGenerations = new Map<string, number>()
const terminalSessionTargetsByTile = new Map<string, Map<string, TerminalSessionTarget>>()
const localAgentAlertTargetsByTile = new Map<string, Set<string>>()
const terminalSessionCreations = new Map<string, Promise<TerminalCreateResult>>()
const remotePreparations = new Map<string, Promise<RemotePreparationResult>>()
const remotePreparationListeners = new Map<string, Set<WebContents>>()
const remotePreparationListenerCleanup = new Map<string, Map<WebContents, () => void>>()
const remotePreparationProgress = new Map<string, { workspaceId: string; status: RemotePreparationStatus }>()
let profiles: ShellProfile[] = []
let sshClient: string | null = null
const TERMINAL_BUFFER_LENGTH = 500_000
const agentAlerts = new SemanticAgentAlertState({ onChange: broadcastAgentAlert })
const agentAlertBridge = new AgentAlertBridge({
  onAlert: (alert) => {
    const session = findAgentAlertSession(alert.tileId, alert.provider)
    if (!session) return
    if (session.agentLifecycle && !session.agentLifecycle.onAlert(alert)) return
    agentAlerts.report(alert)
  },
})

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

function getTerminalSession(target: TerminalSessionTarget): TerminalSession | undefined
function getTerminalSession(identity: TerminalSessionIdentity): TerminalSession | undefined
function getTerminalSession(
  targetOrIdentity: TerminalSessionTarget | TerminalSessionIdentity,
): TerminalSession | undefined {
  const session = terminalSessionManager.get(terminalSessionLookupKey(targetOrIdentity)) as TerminalSession | undefined
  if (!session) return undefined
  if ('generation' in targetOrIdentity
    && !sameTerminalSessionIdentity(session.delivery.identity, targetOrIdentity)) {
    return undefined
  }
  return session
}

function terminalCreateResult(session: TerminalSession): TerminalCreateResult {
  return {
    ...session.dimensions,
    ...session.delivery.snapshot(),
  }
}

function attachTerminalListener(
  session: TerminalSession,
  identity: TerminalSessionIdentity,
  sender: WebContents,
): boolean {
  if (!session.delivery.attach(identity, sender)) return false
  session.alertListeners.add(sender)
  const alert = agentAlerts.get(identity.tileId)
  if (alert) {
    try {
      if (sender.isDestroyed()) {
        session.alertListeners.delete(sender)
        session.delivery.detach(identity, sender)
      }
      else sender.send(`terminal:agentAlert:${identity.tileId}`, alert)
    } catch {
      session.alertListeners.delete(sender)
    }
  }
  sender.once('destroyed', () => {
    session.delivery.detach(identity, sender)
    session.alertListeners.delete(sender)
  })
  return true
}

function rememberTerminalTarget(target: TerminalSessionTarget): void {
  const key = terminalSessionLookupKey(target)
  const targets = terminalSessionTargetsByTile.get(target.tileId) ?? new Map<string, TerminalSessionTarget>()
  targets.set(key, { ...target })
  terminalSessionTargetsByTile.set(target.tileId, targets)
}

function forgetTerminalTarget(target: TerminalSessionTarget): void {
  const targets = terminalSessionTargetsByTile.get(target.tileId)
  if (!targets) return
  targets.delete(terminalSessionLookupKey(target))
  if (targets.size === 0) terminalSessionTargetsByTile.delete(target.tileId)
}

function terminalSessionsForTile(tileId: string): TerminalSession[] {
  const targets = terminalSessionTargetsByTile.get(tileId)
  if (!targets) return []
  const sessions: TerminalSession[] = []
  for (const target of targets.values()) {
    const session = getTerminalSession(target)
    if (session) sessions.push(session)
  }
  return sessions
}

function findAgentAlertSession(
  tileId: string,
  provider?: AgentAlertState['provider'],
): TerminalSession | undefined {
  const sessions = terminalSessionsForTile(tileId)
  if (provider) {
    const providerSessions = sessions.filter(session => session.agentProvider === provider)
    if (providerSessions.length === 1) return providerSessions[0]
  }
  return sessions.length === 1 ? sessions[0] : undefined
}

function registerLocalAgentAlertTarget(target: TerminalSessionTarget): Record<string, string> {
  const key = terminalSessionLookupKey(target)
  const targets = localAgentAlertTargetsByTile.get(target.tileId) ?? new Set<string>()
  const wasEmpty = targets.size === 0
  const environment = wasEmpty
    ? agentAlertBridge.registerLocalTerminal(target.tileId)
    : agentAlertBridge.getLaunchEnvironment(target.tileId)
  if (!environment) throw new Error('Agent alert bridge must start before registering terminals')
  targets.add(key)
  localAgentAlertTargetsByTile.set(target.tileId, targets)
  return environment
}

function unregisterLocalAgentAlertTarget(target: TerminalSessionTarget): void {
  const targets = localAgentAlertTargetsByTile.get(target.tileId)
  if (!targets) return
  targets.delete(terminalSessionLookupKey(target))
  if (targets.size > 0) return
  localAgentAlertTargetsByTile.delete(target.tileId)
  agentAlertBridge.unregisterTerminal(target.tileId)
}

function nextTerminalGeneration(key: string): number {
  const generation = (terminalSessionGenerations.get(key) ?? 0) + 1
  terminalSessionGenerations.set(key, generation)
  return generation
}

function broadcastAgentAlert(tileId: string, state: AgentAlertState | null): void {
  const session = findAgentAlertSession(tileId, state?.provider)
  if (session) {
    for (const listener of [...session.alertListeners]) {
      try {
        if (listener.isDestroyed()) session.alertListeners.delete(listener)
        else listener.send(`terminal:agentAlert:${tileId}`, state)
      } catch {
        session.alertListeners.delete(listener)
      }
    }
  }

  if (!state || BrowserWindow.getAllWindows().some((window) => !window.isDestroyed() && window.isFocused())) return
  const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
  window?.flashFrame(true)
}

export function setAgentAlertsEnabled(enabled: boolean): void {
  agentAlerts.setEnabled(enabled)
}

export function shutdownTerminalSessions(): Promise<TerminalShutdownResult> {
  return terminalSessionManager.shutdownAll()
}

function destroyTerminalSession(target: TerminalSessionTarget): void {
  const deletion = terminalSessionManager.delete(terminalSessionLookupKey(target))
  if (!deletion || deletion.killRequested) return
  try { deletion.session.pty.kill() } catch { /* ignore */ }
}

function resolveProfile(shellProfileId: string): ShellProfile | undefined {
  return profiles.find(p => p.id === shellProfileId)
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

export function registerTerminalIPC(): void {
  // Shell profile listing
  ipcMain.handle('shellProfiles:list', async () => {
    return profiles
  })

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
    const isAgent = options.agent !== undefined
    const runtimeTarget = normalizeTerminalSessionTarget(target, isAgent)
    const sessionKey = terminalSessionLookupKey(runtimeTarget)

    // Check for existing session (reattach) before rejecting new sessions during shutdown.
    const existing = getTerminalSession(runtimeTarget)
    if (existing) {
      return terminalCreateResult(existing)
    }

    if (!terminalSessionManager.isAcceptingSessions()) {
      throw new Error('Terminal sessions are shutting down')
    }

    const creating = terminalSessionCreations.get(sessionKey)
    if (creating) {
      await creating
      const session = getTerminalSession(runtimeTarget)
      if (!session) throw new Error('Terminal session was not registered')
      return terminalCreateResult(session)
    }

    const creation = (async (): Promise<TerminalCreateResult> => {
      const runtimeTileId = runtimeTarget.tileId
      const runtimeWorkspaceId = runtimeTarget.workspaceId
      const identity: TerminalSessionIdentity = {
        ...runtimeTarget,
        generation: nextTerminalGeneration(sessionKey),
      }
      const delivery = new TerminalDelivery<WebContents>(identity, TERMINAL_BUFFER_LENGTH)

      const isRemoteSsh = options.connection === 'remote-ssh'
      if (isRemoteSsh && isAgent) {
        delivery.dispose()
        throw new Error('Agent terminals cannot use remote SSH')
      }
      const profile = isRemoteSsh ? undefined : resolveProfile(options.shellProfileId)
      if (!isRemoteSsh && !isAgent && !profile) {
        delivery.dispose()
        throw new Error(`Shell profile "${options.shellProfileId}" not found or not available`)
      }
      if (isRemoteSsh && !options.remoteTerminal) {
        delivery.dispose()
        throw new Error('Remote SSH is not configured for this workspace')
      }
      if (isRemoteSsh && !sshClient) {
        delivery.dispose()
        throw new Error('OpenSSH client is not available on this computer')
      }

      const spawnEnv: Record<string, string> = { ...process.env as Record<string, string> }
      let workspacePath: string | null = null
      let workspaceRootFolderPath: string | null | undefined
      let terminalRoot: ReturnType<typeof resolveTerminalWorkspaceRoot> | null = null
      let historySetup: ReturnType<typeof buildTerminalHistorySetup> = null
      try {
        await agentAlertBridge.start()
        if (!isRemoteSsh) Object.assign(spawnEnv, registerLocalAgentAlertTarget(runtimeTarget))
        workspacePath = !isRemoteSsh && !isAgent
          ? await getWorkspacePathById(runtimeWorkspaceId)
          : null
        workspaceRootFolderPath = !isRemoteSsh
          ? await getWorkspaceRootFolderById(runtimeWorkspaceId)
          : options.workspaceDir
        terminalRoot = profile
          ? resolveTerminalWorkspaceRoot({
            shellProfileId: profile.id,
            workspaceRootFolderPath: workspaceRootFolderPath ?? undefined,
            wslStartInHome: options.wslStartInHome,
          })
          : null
        historySetup = profile && !isAgent ? buildTerminalHistorySetup({
          shellProfileId: profile.id,
          workspaceId: runtimeWorkspaceId,
          workspacePath: workspacePath ?? undefined,
          enabled: options.terminalHistoryEnabled,
        }) : null

        if (historySetup) {
          await fs.mkdir(historySetup.historyDir, { recursive: true })
          Object.assign(spawnEnv, historySetup.env)
        }
      } catch (error) {
        unregisterLocalAgentAlertTarget(runtimeTarget)
        delivery.dispose()
        throw error
      }

      let agentLaunch: AgentTerminalLaunch | null
      try {
        agentLaunch = isAgent
          ? buildAgentTerminalLaunch({
            tileId: runtimeTileId,
            workspaceId: runtimeWorkspaceId,
            agent: options.agent!,
            providerConfig: options.agentProviderConfig,
            workspaceRoot: workspaceRootFolderPath ?? options.workspaceDir,
            fallbackCwd: terminalRoot?.cwd ?? process.cwd(),
          })
          : null
      } catch (error) {
        unregisterLocalAgentAlertTarget(runtimeTarget)
        delivery.dispose()
        throw error
      }
      let spawnArgs: string[]
      try {
        spawnArgs = isRemoteSsh
          ? buildRemoteSshLaunch(options.remoteTerminal!, options.remoteStartupCommand).args
          : agentLaunch
            ? [...agentLaunch.args]
            : [...profile!.args]

        if (terminalRoot && !agentLaunch) spawnArgs.push(...terminalRoot.spawnArgs)
      } catch (error) {
        unregisterLocalAgentAlertTarget(runtimeTarget)
        delivery.dispose()
        throw error
      }

      const executable = isRemoteSsh ? sshClient! : agentLaunch?.command ?? profile!.shell
      const label = isRemoteSsh ? 'Remote SSH' : agentLaunch ? `${agentLaunch.provider} agent` : profile!.label
      if (!terminalSessionManager.isAcceptingSessions()) {
        unregisterLocalAgentAlertTarget(runtimeTarget)
        delivery.dispose()
        throw new Error('Terminal sessions are shutting down')
      }

      let spawnedTerm: SpawnedPtyInstance
      try {
        spawnedTerm = pty.spawn(executable, spawnArgs, {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: agentLaunch?.cwd ?? terminalRoot?.cwd ?? process.cwd(),
          env: spawnEnv,
        })
      } catch (err) {
        unregisterLocalAgentAlertTarget(runtimeTarget)
        delivery.dispose()
        throw new Error(`Failed to spawn ${label}: ${err instanceof Error ? err.message : String(err)}`)
      }

      let ptyExited = false
      spawnedTerm.onExit?.((exitEvent) => {
        ptyExited = true
        delivery.recordExit(exitEvent)
      })
      const term: PtyInstance = {
        write: (data) => spawnedTerm.write(data),
        resize: (cols, rows) => spawnedTerm.resize(cols, rows),
        kill: () => spawnedTerm.kill(),
        onData: (callback) => spawnedTerm.onData(callback),
        onExit: spawnedTerm.onExit
          ? (callback) => {
            spawnedTerm.onExit?.(callback)
            if (ptyExited) callback()
          }
          : undefined,
      }
      let startupCommand: DeferredTerminalStartupCommand | undefined

      const agentLifecycle = agentLaunch
        ? createAgentTerminalLifecycle({
          registry: agentSessionRegistry,
          tileId: runtimeTileId,
          workspaceId: runtimeWorkspaceId,
        })
        : undefined
      let processExitHandled = false
      let disposed = false
      const onProcessExit = () => {
        if (processExitHandled) return
        processExitHandled = true
        session.agentLifecycle?.onExit()
        startupCommand?.dispose()
        unregisterLocalAgentAlertTarget(runtimeTarget)
        agentAlerts.clearOnDestroy(runtimeTileId)
      }
      const onDispose = () => {
        if (disposed) return
        disposed = true
        onProcessExit()
        session.alertListeners.clear()
        session.delivery.dispose()
        forgetTerminalTarget(runtimeTarget)
      }
      const session: TerminalSession = {
        pty: term,
        delivery,
        dimensions: { cols: 80, rows: 24 },
        alertListeners: new Set(),
        agentProvider: agentLaunch?.provider,
        agentLifecycle,
        onCleanup: onDispose,
        onProcessExit,
        onDispose,
      }
      const agentExitGate = agentLifecycle
        ? createAgentTerminalExitGate(() => session.onProcessExit?.())
        : null
      if (agentExitGate) term.onExit?.(agentExitGate.handle)

      if (agentLaunch) {
        try {
          agentSessionRegistry.register({
            sessionId: agentLaunch.sessionId,
            tileId: runtimeTileId,
            workspaceId: runtimeWorkspaceId,
            provider: agentLaunch.provider,
          })
        } catch (error) {
          unregisterLocalAgentAlertTarget(runtimeTarget)
          delivery.dispose()
          try { term.kill() } catch { /* ignore */ }
          throw error
        }
      }

      try {
        terminalSessionManager.add(sessionKey, session)
      } catch (error) {
        if (agentLaunch) agentSessionRegistry.remove(runtimeWorkspaceId, runtimeTileId)
        unregisterLocalAgentAlertTarget(runtimeTarget)
        delivery.dispose()
        try { term.kill() } catch { /* ignore */ }
        throw error
      }
      rememberTerminalTarget(runtimeTarget)
      agentExitGate?.markRegistered()
      if (!isRemoteSsh && !isAgent && options.initialCommand?.trim() && !processExitHandled) {
        startupCommand = new DeferredTerminalStartupCommand({
          command: options.initialCommand,
          write: (data) => term.write(data),
        })
      }

      term.onData((data: string) => {
        startupCommand?.onOutput(data)
        session.delivery.append(data)
      })

      if (historySetup?.prependCommand) {
        term.write(`${historySetup.prependCommand}\r`)
      }

      return terminalCreateResult(session)
    })()
    terminalSessionCreations.set(sessionKey, creation)
    try {
      return await creation
    } finally {
      if (terminalSessionCreations.get(sessionKey) === creation) terminalSessionCreations.delete(sessionKey)
    }
  })

  ipcMain.handle('terminal:attach', (event, identity: TerminalSessionIdentity) => {
    const runtimeIdentity = normalizeTerminalSessionIdentity(identity)
    const session = getTerminalSession(runtimeIdentity)
    if (!session) throw new Error('Terminal session is no longer active')
    if (!attachTerminalListener(session, runtimeIdentity, event.sender)) {
      throw new Error('Terminal session identity is stale')
    }
    return terminalCreateResult(session)
  })

  ipcMain.handle('terminal:write', (_, identity: TerminalSessionIdentity, data: string) => {
    const runtimeIdentity = normalizeTerminalSessionIdentity(identity)
    const session = getTerminalSession(runtimeIdentity)
    if (session && data) {
      agentAlerts.clearOnInput(runtimeIdentity.tileId)
      session?.agentLifecycle?.onInput(data)
    }
    session?.pty.write(data)
  })

  ipcMain.handle('terminal:acknowledgeAgentAlert', (_, identity: TerminalSessionIdentity) => {
    const runtimeIdentity = normalizeTerminalSessionIdentity(identity)
    const session = getTerminalSession(runtimeIdentity)
    if (!session) return
    agentAlerts.clearOnFocus(runtimeIdentity.tileId)
    session.agentLifecycle?.onFocus()
  })

  ipcMain.handle('terminal:setAgentAlertsEnabled', (_, enabled: boolean) => {
    setAgentAlertsEnabled(enabled === true)
  })

  ipcMain.handle('terminal:resize', (_, identity: TerminalSessionIdentity, cols: number, rows: number) => {
    const runtimeIdentity = normalizeTerminalSessionIdentity(identity)
    const session = getTerminalSession(runtimeIdentity)
    if (!session) return

    session.dimensions = resizeTerminalDimensions(
      session.dimensions,
      (nextCols, nextRows) => session.pty.resize(nextCols, nextRows),
      cols,
      rows,
    )
  })

  ipcMain.handle('terminal:destroy', (_, identity: TerminalSessionIdentity) => {
    const runtimeIdentity = normalizeTerminalSessionIdentity(identity)
    const session = getTerminalSession(runtimeIdentity)
    if (!session) return
    destroyTerminalSession(runtimeIdentity)
  })

  ipcMain.handle('terminal:destroyCurrent', (_, target: TerminalSessionTarget) => {
    const runtimeTarget = normalizeTerminalSessionTarget(target, false)
    if (!getTerminalSession(runtimeTarget)) return
    destroyTerminalSession(runtimeTarget)
  })

  // terminal:detach — disconnects PTY but doesn't kill the process
  // (not used yet, but kept for future session persistence)
  ipcMain.handle('terminal:detach', (event, identity: TerminalSessionIdentity) => {
    const runtimeIdentity = normalizeTerminalSessionIdentity(identity)
    const session = getTerminalSession(runtimeIdentity)
    if (session) {
      session.delivery.detach(runtimeIdentity, event.sender)
      session.alertListeners.delete(event.sender)
    }
  })
}
