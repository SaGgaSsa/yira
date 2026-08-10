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
import {
  buildAgentTerminalLaunch,
  createAgentTerminalLifecycle,
  type AgentTerminalLaunch,
  type AgentTerminalLifecycle,
} from '../agents/terminal'

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

interface TerminalSession {
  pty: PtyInstance
  listeners: Set<WebContents>
  buffer: string
  agentLifecycle?: AgentTerminalLifecycle
}

const terminals = new Map<string, TerminalSession>()
let profiles: ShellProfile[] = []
let sshClient: string | null = null
const agentAlerts = new SemanticAgentAlertState({ onChange: broadcastAgentAlert })
const agentAlertBridge = new AgentAlertBridge({
  onAlert: (alert) => {
    const session = terminals.get(alert.tileId)
    if (!session?.agentLifecycle?.onAlert(alert)) return
    agentAlerts.report(alert)
  },
})

function broadcastAgentAlert(tileId: string, state: AgentAlertState | null): void {
  const session = terminals.get(tileId)
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

function resolveProfile(shellProfileId: string): ShellProfile | undefined {
  return profiles.find(p => p.id === shellProfileId)
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
    // Check for existing session (reattach)
    const existing = terminals.get(tileId)
    if (existing) {
      existing.listeners.add(event.sender)
      return { cols: 80, rows: 24, buffer: existing.buffer }
    }

    const isRemoteSsh = options.connection === 'remote-ssh'
    const isAgent = options.agent !== undefined
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
    if (isRemoteSsh) agentAlertBridge.registerRemoteTerminal(tileId)
    else Object.assign(spawnEnv, agentAlertBridge.registerLocalTerminal(tileId))
    const workspacePath = !isRemoteSsh && !isAgent && options.workspaceId
      ? await getWorkspacePathById(options.workspaceId)
      : null
    const workspaceRootFolderPath = !isRemoteSsh && options.workspaceId
      ? await getWorkspaceRootFolderById(options.workspaceId)
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
      workspaceId: options.workspaceId,
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
          tileId,
          workspaceId: options.workspaceId ?? '',
          agent: options.agent!,
          providerConfig: options.agentProviderConfig,
          workspaceRoot: workspaceRootFolderPath ?? options.workspaceDir,
          fallbackCwd: terminalRoot?.cwd ?? process.cwd(),
        })
        : null
    } catch (error) {
      agentAlertBridge.unregisterTerminal(tileId)
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
    let term: PtyInstance
    try {
      term = pty.spawn(executable, spawnArgs, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: agentLaunch?.cwd ?? terminalRoot?.cwd ?? process.cwd(),
        env: spawnEnv,
      })
    } catch (err) {
      agentAlertBridge.unregisterTerminal(tileId)
      throw new Error(`Failed to spawn ${label}: ${err instanceof Error ? err.message : String(err)}`)
    }

    const session: TerminalSession = {
      pty: term,
      listeners: new Set([event.sender]),
      buffer: '',
      agentLifecycle: agentLaunch
        ? createAgentTerminalLifecycle({
          registry: agentSessionRegistry,
          tileId,
          workspaceId: options.workspaceId!,
        })
        : undefined,
    }
    terminals.set(tileId, session)

    if (agentLaunch) {
      try {
        agentSessionRegistry.register({
          sessionId: agentLaunch.sessionId,
          tileId,
          workspaceId: options.workspaceId!,
          provider: agentLaunch.provider,
        })
      } catch (error) {
        terminals.delete(tileId)
        agentAlertBridge.unregisterTerminal(tileId)
        try { term.kill() } catch { /* ignore */ }
        throw error
      }
    }

    // Clean up listeners when renderer is destroyed
    event.sender.once('destroyed', () => {
      session.listeners.delete(event.sender)
    })

    term.onData((data: string) => {
      session.buffer = (session.buffer + data).slice(-500000)
      for (const listener of [...session.listeners]) {
        try {
          if (!listener.isDestroyed()) {
            listener.send(`terminal:data:${tileId}`, data)
          } else {
            session.listeners.delete(listener)
          }
        } catch {
          session.listeners.delete(listener)
        }
      }
    })

    term.onExit?.(() => {
      session.agentLifecycle?.onExit()
      if (session.agentLifecycle) {
        agentAlertBridge.unregisterTerminal(tileId)
        agentAlerts.clearOnDestroy(tileId)
      }
    })

    if (historySetup?.prependCommand) {
      term.write(`${historySetup.prependCommand}\r`)
    }

    if (!isRemoteSsh && !isAgent && options.initialCommand?.trim()) {
      term.write(`${options.initialCommand.trim()}\r`)
    }

    return { cols: 80, rows: 24, buffer: '' }
  })

  ipcMain.handle('terminal:write', (_, tileId: string, data: string) => {
    const session = terminals.get(tileId)
    if (data) {
      agentAlerts.clearOnInput(tileId)
      session?.agentLifecycle?.onInput(data)
    }
    session?.pty.write(data)
  })

  ipcMain.handle('terminal:acknowledgeAgentAlert', (_, tileId: string) => {
    agentAlerts.clearOnFocus(tileId)
    terminals.get(tileId)?.agentLifecycle?.onFocus()
  })

  ipcMain.handle('terminal:setAgentAlertsEnabled', (_, enabled: boolean) => {
    setAgentAlertsEnabled(enabled === true)
  })

  ipcMain.handle('terminal:resize', (_, tileId: string, cols: number, rows: number) => {
    if (cols > 0 && rows > 0) {
      terminals.get(tileId)?.pty.resize(Math.floor(cols), Math.floor(rows))
    }
  })

  ipcMain.handle('terminal:destroy', (_, tileId: string) => {
    const session = terminals.get(tileId)
    if (session) {
      session.agentLifecycle?.onExit()
      try { session.pty.kill() } catch { /* ignore */ }
      terminals.delete(tileId)
    }
    agentAlertBridge.unregisterTerminal(tileId)
    agentAlerts.clearOnDestroy(tileId)
  })

  // terminal:detach — disconnects PTY but doesn't kill the process
  // (not used yet, but kept for future session persistence)
  ipcMain.handle('terminal:detach', (event, tileId: string) => {
    const session = terminals.get(tileId)
    if (session) {
      session.listeners.delete(event.sender)
    }
  })
}
