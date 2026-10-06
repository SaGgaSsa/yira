import type { TerminalSessionIdentity, TerminalSessionTarget } from './terminalSessionIdentity'
import type { AgentProvider, AgentSessionSurface, TerminalExitEvent } from './types'

export const TERMINAL_DAEMON_PROTOCOL_VERSION = 1
export const TERMINAL_DAEMON_MAX_FRAME_BYTES = 16 * 1024 * 1024

export interface TerminalDaemonEndpoint {
  version: number
  port: number
  token: string
  pid: number
}

export interface TerminalDaemonAgent {
  provider: AgentProvider
  sessionId: string
  startedAt: string
  /** Missing values from older daemons are interpreted as 'tile'. */
  surface?: AgentSessionSurface
  title?: string
  worktreeRoot?: string
  worktreeBranch?: string
  worktrees?: Array<{ path: string; baseSha: string }>
}

export interface TerminalDaemonAlert {
  provider: 'codex' | 'claude'
  event: 'completed' | 'permission' | 'input'
  tileId: string
}

export interface TerminalDaemonSpawn {
  target: TerminalSessionTarget
  executable: string
  args: string[]
  cwd: string
  env: Record<string, string>
  cols: number
  rows: number
  local: boolean
  agent?: TerminalDaemonAgent
  prependCommand?: string
  initialCommand?: string
}

export interface TerminalDaemonSnapshot {
  identity: TerminalSessionIdentity
  cols: number
  rows: number
  buffer: string
  sequence: number
  pid: number
  agent?: TerminalDaemonAgent
  alert?: TerminalDaemonAlert
  exitEvent?: TerminalExitEvent
}

export interface TerminalDaemonMethods {
  ping: { params: undefined; result: { version: number; pid: number } }
  list: { params: undefined; result: TerminalDaemonSnapshot[] }
  attach: { params: TerminalSessionTarget; result: TerminalDaemonSnapshot | null }
  create: { params: TerminalDaemonSpawn; result: TerminalDaemonSnapshot }
  snapshot: { params: TerminalSessionIdentity; result: TerminalDaemonSnapshot }
  rendererAttach: { params: TerminalSessionIdentity; result: TerminalDaemonSnapshot }
  rendererDetach: { params: TerminalSessionIdentity; result: null }
  write: { params: { identity: TerminalSessionIdentity; data: string }; result: null }
  resize: { params: { identity: TerminalSessionIdentity; cols: number; rows: number }; result: null }
  acknowledge: { params: TerminalSessionIdentity; result: null }
  destroy: { params: TerminalSessionIdentity; result: null }
  destroyCurrent: { params: TerminalSessionTarget; result: null }
  destroyWorkspace: { params: { workspaceId: string }; result: null }
  /** Close every session and exit the daemon process. */
  shutdown: { params: undefined; result: null }
}

export type TerminalDaemonMethod = keyof TerminalDaemonMethods

export interface TerminalDaemonRequest {
  id: number
  token: string
  method: TerminalDaemonMethod
  params?: unknown
}

export type TerminalDaemonResponse =
  | { id: number; result: unknown }
  | { id: number; error: string }

export type TerminalDaemonEvent =
  | { event: 'data'; identity: TerminalSessionIdentity; sequence: number; data: string }
  | { event: 'exit'; identity: TerminalSessionIdentity; sequence: number; exitEvent: TerminalExitEvent }
  | { event: 'alert'; identity: TerminalSessionIdentity; sequence: number; alert: TerminalDaemonAlert | null }
