import { BrowserWindow, ipcMain, WebContents } from 'electron'
import { promises as fs } from 'fs'
import type { ShellProfile, TerminalCreateOptions } from '@shared/types'
import { detectShellProfiles, detectSshClient } from '../shell-profiles'
import { buildTerminalHistorySetup } from '../terminal-history'
import { resolveTerminalWorkspaceRoot } from '../workspace-root'
import { getWorkspacePathById, getWorkspaceRootFolderById } from './workspace'
import { buildRemoteSshLaunch } from '../remote-ssh'
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

interface TerminalSession extends ManagedTerminalSession {
  pty: PtyInstance
  listeners: Set<WebContents>
  buffer: string
  agentLifecycle?: AgentTerminalLifecycle
}

const terminalSessionManager = new TerminalSessionManager()
let profiles: ShellProfile[] = []
let sshClient: string | null = null
const agentAlerts = new SemanticAgentAlertState({ onChange: broadcastAgentAlert })
const agentAlertBridge = new AgentAlertBridge({
  onAlert: (alert) => {
    const session = getTerminalSession(alert.tileId)
    if (!session) return
    if (session.agentLifecycle && !session.agentLifecycle.onAlert(alert)) return
    agentAlerts.report(alert)
  },
})

function broadcastAgentAlert(tileId: string, state: AgentAlertState | null): void {
  const session = getTerminalSession(tileId)
  if (session) {
    for (const listener of [...session.listeners]) {
      if (listener.isDestroyed()) session.listeners.delete(listener)
      else listener.send(`terminal:agentAlert:${tileId}`, state)
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

function getTerminalSession(tileId: string): TerminalSession | undefined {
  return terminalSessionManager.get(tileId) as TerminalSession | undefined
}

function resolveProfile(shellProfileId: string): ShellProfile | undefined {
  return profiles.find(p => p.id === shellProfileId)
}

function resolveTerminalId(tileId: string): string {
  if (terminalSessionManager.get(tileId)) return tileId
  return normalizeAgentOpaqueId(tileId) ?? tileId
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

  ipcMain.handle('terminal:create', async (event, tileId: string, options: TerminalCreateOptions) => {
    const isAgent = options.agent !== undefined
    const runtimeTileId = isAgent ? normalizeAgentOpaqueId(tileId) ?? '' : tileId
    const runtimeWorkspaceId = isAgent ? normalizeAgentOpaqueId(options.workspaceId) : options.workspaceId
    if (isAgent && !runtimeTileId) throw new Error('Invalid agent tile id')
    if (isAgent && !runtimeWorkspaceId) throw new Error('Invalid agent workspace id')
    // Check for existing session (reattach)
    const existing = getTerminalSession(runtimeTileId)
    if (existing) {
      existing.listeners.add(event.sender)
      return { cols: 80, rows: 24, buffer: existing.buffer }
    }

    const isRemoteSsh = options.connection === 'remote-ssh'
    if (isRemoteSsh && isAgent) {
      throw new Error('Agent terminals cannot use remote SSH')
    }
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

    const spawnEnv: Record<string, string> = { ...process.env as Record<string, string> }
    await agentAlertBridge.start()
    if (isRemoteSsh) agentAlertBridge.registerRemoteTerminal(runtimeTileId)
    else Object.assign(spawnEnv, agentAlertBridge.registerLocalTerminal(runtimeTileId))
    const workspacePath = !isRemoteSsh && !isAgent && runtimeWorkspaceId
      ? await getWorkspacePathById(runtimeWorkspaceId)
      : null
    const workspaceRootFolderPath = !isRemoteSsh && runtimeWorkspaceId
      ? await getWorkspaceRootFolderById(runtimeWorkspaceId)
      : options.workspaceDir
    const terminalRoot = profile
      ? resolveTerminalWorkspaceRoot({
        shellProfileId: profile.id,
        workspaceRootFolderPath: workspaceRootFolderPath ?? undefined,
        wslStartInHome: options.wslStartInHome,
      })
      : null
    const historySetup = profile && !isAgent ? buildTerminalHistorySetup({
      shellProfileId: profile.id,
      workspaceId: runtimeWorkspaceId,
      workspacePath: workspacePath ?? undefined,
      enabled: options.terminalHistoryEnabled,
    }) : null

    if (historySetup) {
      await fs.mkdir(historySetup.historyDir, { recursive: true })
      Object.assign(spawnEnv, historySetup.env)
    }

    let agentLaunch: AgentTerminalLaunch | null
    try {
      agentLaunch = isAgent
        ? buildAgentTerminalLaunch({
          tileId: runtimeTileId,
          workspaceId: runtimeWorkspaceId ?? '',
          agent: options.agent!,
          providerConfig: options.agentProviderConfig,
          workspaceRoot: workspaceRootFolderPath ?? options.workspaceDir,
          fallbackCwd: terminalRoot?.cwd ?? process.cwd(),
        })
        : null
    } catch (error) {
      agentAlertBridge.unregisterTerminal(runtimeTileId)
      throw error
    }
    const spawnArgs = isRemoteSsh
      ? buildRemoteSshLaunch(options.remoteTerminal!, options.remoteStartupCommand).args
      : agentLaunch
        ? [...agentLaunch.args]
        : [...profile!.args]

    if (terminalRoot && !agentLaunch) spawnArgs.push(...terminalRoot.spawnArgs)

    const executable = isRemoteSsh ? sshClient! : agentLaunch?.command ?? profile!.shell
    const label = isRemoteSsh ? 'Remote SSH' : agentLaunch ? `${agentLaunch.provider} agent` : profile!.label
    if (!terminalSessionManager.isAcceptingSessions()) {
      agentAlertBridge.unregisterTerminal(runtimeTileId)
      throw new Error('Terminal sessions are shutting down')
    }

    let spawnedTerm: PtyInstance
    try {
      spawnedTerm = pty.spawn(executable, spawnArgs, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: agentLaunch?.cwd ?? terminalRoot?.cwd ?? process.cwd(),
        env: spawnEnv,
      })
    } catch (err) {
      agentAlertBridge.unregisterTerminal(runtimeTileId)
      throw new Error(`Failed to spawn ${label}: ${err instanceof Error ? err.message : String(err)}`)
    }

    let ptyExited = false
    spawnedTerm.onExit?.(() => {
      ptyExited = true
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
        workspaceId: runtimeWorkspaceId!,
      })
      : undefined
    let cleanedUp = false
    const session: TerminalSession = {
      pty: term,
      listeners: new Set([event.sender]),
      buffer: '',
      agentLifecycle,
      onCleanup: () => {
        if (cleanedUp) return
        cleanedUp = true
        session.agentLifecycle?.onExit()
        startupCommand?.dispose()
        agentAlertBridge.unregisterTerminal(runtimeTileId)
        agentAlerts.clearOnDestroy(runtimeTileId)
        session.listeners.clear()
      },
    }
    const agentExitGate = agentLifecycle
      ? createAgentTerminalExitGate(() => session.onCleanup())
      : null
    if (agentExitGate) term.onExit?.(agentExitGate.handle)
    else term.onExit?.(() => session.onCleanup())

    if (agentLaunch) {
      try {
        agentSessionRegistry.register({
          sessionId: agentLaunch.sessionId,
          tileId: runtimeTileId,
          workspaceId: runtimeWorkspaceId!,
          provider: agentLaunch.provider,
        })
      } catch (error) {
        agentAlertBridge.unregisterTerminal(runtimeTileId)
        try { term.kill() } catch { /* ignore */ }
        throw error
      }
    }

    try {
      terminalSessionManager.add(runtimeTileId, session)
    } catch (error) {
      if (agentLaunch) agentSessionRegistry.remove(runtimeWorkspaceId!, runtimeTileId)
      agentAlertBridge.unregisterTerminal(runtimeTileId)
      try { term.kill() } catch { /* ignore */ }
      throw error
    }
    agentExitGate?.markRegistered()
    if (!isRemoteSsh && !isAgent && options.initialCommand?.trim()) {
      startupCommand = new DeferredTerminalStartupCommand({
        command: options.initialCommand,
        write: (data) => term.write(data),
      })
    }

    // Clean up listeners when renderer is destroyed
    event.sender.once('destroyed', () => {
      session.listeners.delete(event.sender)
    })

    term.onData((data: string) => {
      startupCommand?.onOutput(data)
      session.buffer = (session.buffer + data).slice(-500000)
      for (const listener of [...session.listeners]) {
        try {
          if (!listener.isDestroyed()) {
            listener.send(`terminal:data:${runtimeTileId}`, data)
          } else {
            session.listeners.delete(listener)
          }
        } catch {
          session.listeners.delete(listener)
        }
      }
    })

    if (!agentExitGate) {
      term.onExit?.(() => {
        session.agentLifecycle?.onExit()
      })
    }

    if (historySetup?.prependCommand) {
      term.write(`${historySetup.prependCommand}\r`)
    }

    return { cols: 80, rows: 24, buffer: '' }
  })

  ipcMain.handle('terminal:write', (_, tileId: string, data: string) => {
    const runtimeTileId = resolveTerminalId(tileId)
    const session = getTerminalSession(runtimeTileId)
    if (data) {
      agentAlerts.clearOnInput(runtimeTileId)
      session?.agentLifecycle?.onInput(data)
    }
    session?.pty.write(data)
  })

  ipcMain.handle('terminal:acknowledgeAgentAlert', (_, tileId: string) => {
    const runtimeTileId = resolveTerminalId(tileId)
    agentAlerts.clearOnFocus(runtimeTileId)
    getTerminalSession(runtimeTileId)?.agentLifecycle?.onFocus()
  })

  ipcMain.handle('terminal:setAgentAlertsEnabled', (_, enabled: boolean) => {
    setAgentAlertsEnabled(enabled === true)
  })

  ipcMain.handle('terminal:resize', (_, tileId: string, cols: number, rows: number) => {
    if (cols > 0 && rows > 0) {
      getTerminalSession(resolveTerminalId(tileId))?.pty.resize(Math.floor(cols), Math.floor(rows))
    }
  })

  ipcMain.handle('terminal:destroy', (_, tileId: string) => {
    const runtimeTileId = resolveTerminalId(tileId)
    const deletion = terminalSessionManager.delete(runtimeTileId)
    if (deletion) {
      if (!deletion.killRequested) {
        try { deletion.session.pty.kill() } catch { /* ignore */ }
      }
    } else {
      agentAlertBridge.unregisterTerminal(runtimeTileId)
      agentAlerts.clearOnDestroy(runtimeTileId)
    }
  })

  // terminal:detach — disconnects PTY but doesn't kill the process
  // (not used yet, but kept for future session persistence)
  ipcMain.handle('terminal:detach', (event, tileId: string) => {
    const session = getTerminalSession(resolveTerminalId(tileId))
    if (session) {
      session.listeners.delete(event.sender)
    }
  })
}
