import { ipcMain, WebContents } from 'electron'
import type { ShellProfile, TerminalCreateOptions } from '@shared/types'
import { detectShellProfiles } from '../shell-profiles'

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

function resolveProfile(shellProfileId: string): ShellProfile | undefined {
  return profiles.find(p => p.id === shellProfileId)
}

export function initShellProfiles(): void {
  profiles = detectShellProfiles()
}

export function registerTerminalIPC(): void {
  // Shell profile listing
  ipcMain.handle('shellProfiles:list', async () => {
    return profiles
  })

  ipcMain.handle('terminal:create', async (event, tileId: string, options: TerminalCreateOptions) => {
    // Check for existing session (reattach)
    const existing = terminals.get(tileId)
    if (existing) {
      existing.listeners.add(event.sender)
      return { cols: 80, rows: 24, buffer: existing.buffer }
    }

    // Resolve shell profile
    const profile = resolveProfile(options.shellProfileId)
    if (!profile) {
      throw new Error(`Shell profile "${options.shellProfileId}" not found or not available`)
    }

    // Build spawn env
    const spawnEnv: Record<string, string> = { ...process.env as Record<string, string> }
    const spawnArgs = [...profile.args]

    if (profile.id === 'wsl' && options.wslStartInHome) {
      spawnArgs.push('--cd', '~')
    }

    let term: PtyInstance
    try {
      term = pty.spawn(profile.shell, spawnArgs, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: options.workspaceDir || process.cwd(),
        env: spawnEnv,
      })
    } catch (err) {
      throw new Error(`Failed to spawn ${profile.label}: ${err instanceof Error ? err.message : String(err)}`)
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

    if (options.initialCommand?.trim()) {
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
