import { ipcMain, WebContents } from 'electron'
import { promises as fs } from 'fs'
import type { ShellProfile, TerminalCreateOptions } from '@shared/types'
import { detectShellProfiles, detectSshClient } from '../shell-profiles'
import { buildTerminalHistorySetup } from '../terminal-history'
import { resolveTerminalWorkspaceRoot } from '../workspace-root'
import { getWorkspacePathById, getWorkspaceRootFolderById } from './workspace'
import { buildRemoteSshLaunch } from '../remote-ssh'

// node-pty must be required (not imported) due to native module ESM issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pty = require('node-pty')

interface PtyInstance {
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
  onData: (cb: (data: string) => void) => void
}

interface TerminalSession {
  pty: PtyInstance
  listeners: Set<WebContents>
  buffer: string
}

const terminals = new Map<string, TerminalSession>()
let profiles: ShellProfile[] = []
let sshClient: string | null = null

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
    const profile = isRemoteSsh ? undefined : resolveProfile(options.shellProfileId)
    if (!isRemoteSsh && !profile) {
      throw new Error(`Shell profile "${options.shellProfileId}" not found or not available`)
    }
    if (isRemoteSsh && !options.remoteTerminal) {
      throw new Error('Remote SSH is not configured for this workspace')
    }
    if (isRemoteSsh && !sshClient) {
      throw new Error('OpenSSH client is not available on this computer')
    }

    const spawnEnv: Record<string, string> = { ...process.env as Record<string, string> }
    const spawnArgs = isRemoteSsh
      ? buildRemoteSshLaunch(options.remoteTerminal!, options.remoteStartupCommand).args
      : [...profile!.args]
    const workspacePath = !isRemoteSsh && options.workspaceId
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
    const historySetup = profile ? buildTerminalHistorySetup({
      shellProfileId: profile.id,
      workspaceId: options.workspaceId,
      workspacePath: workspacePath ?? undefined,
      enabled: options.terminalHistoryEnabled,
    }) : null

    if (historySetup) {
      await fs.mkdir(historySetup.historyDir, { recursive: true })
      Object.assign(spawnEnv, historySetup.env)
    }

    if (terminalRoot) spawnArgs.push(...terminalRoot.spawnArgs)

    const executable = isRemoteSsh ? sshClient! : profile!.shell
    const label = isRemoteSsh ? 'Remote SSH' : profile!.label
    let term: PtyInstance
    try {
      term = pty.spawn(executable, spawnArgs, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: terminalRoot?.cwd ?? process.cwd(),
        env: spawnEnv,
      })
    } catch (err) {
      throw new Error(`Failed to spawn ${label}: ${err instanceof Error ? err.message : String(err)}`)
    }

    const session: TerminalSession = {
      pty: term,
      listeners: new Set([event.sender]),
      buffer: '',
    }
    terminals.set(tileId, session)

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

    if (historySetup?.prependCommand) {
      term.write(`${historySetup.prependCommand}\r`)
    }

    if (!isRemoteSsh && options.initialCommand?.trim()) {
      term.write(`${options.initialCommand.trim()}\r`)
    }

    return { cols: 80, rows: 24, buffer: '' }
  })

  ipcMain.handle('terminal:write', (_, tileId: string, data: string) => {
    terminals.get(tileId)?.pty.write(data)
  })

  ipcMain.handle('terminal:resize', (_, tileId: string, cols: number, rows: number) => {
    if (cols > 0 && rows > 0) {
      terminals.get(tileId)?.pty.resize(Math.floor(cols), Math.floor(rows))
    }
  })

  ipcMain.handle('terminal:destroy', (_, tileId: string) => {
    const session = terminals.get(tileId)
    if (session) {
      try { session.pty.kill() } catch { /* ignore */ }
      terminals.delete(tileId)
    }
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
