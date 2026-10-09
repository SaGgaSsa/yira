import { isAbsolute, relative, resolve } from 'node:path'

import type {
  AgentProviderConfig,
  TerminalAgentMetadata,
} from '@shared/types'
import { normalizeAgentProviderConfig } from '@shared/workspaceConfig'
import { normalizeAgentOpaqueId, isAgentProvider } from './query'
import { buildAgentCommand, normalizeResumeId } from './providers'
import { AgentSessionRegistry, type AgentInputKind } from './registry'

const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/
const UNC_ABSOLUTE_PATH = /^\\\\/

export interface AgentTerminalLaunchInput {
  tileId: string
  workspaceId: string
  agent: TerminalAgentMetadata
  providerConfig?: AgentProviderConfig
  /** Canonical workspace root. History cwd values are relative to this path. */
  workspaceRoot?: string
  /** Fallback shell cwd when the workspace has no configured project root. */
  fallbackCwd: string
  /** The agent's session ID has no saved conversation yet; start it instead of resuming. */
  newSession?: boolean
}

export interface AgentTerminalLaunch {
  provider: TerminalAgentMetadata['provider']
  command: string
  args: string[]
  cwd: string
  /** Provider session ID for resumes, or the tile ID for a new runtime session. */
  sessionId: string
}

export interface AgentTerminalLifecycleOptions {
  registry: AgentSessionRegistry
  tileId: string
  workspaceId: string
}

export interface AgentTerminalLifecycle {
  onAlert: (alert: unknown) => boolean
  onInput: (data: string) => boolean
  onFocus: () => boolean
  onExit: () => boolean
}

export interface AgentTerminalExitGate {
  /** Attach this callback directly to the PTY before session registration. */
  handle: () => void
  /** Complete registration and replay an exit observed during the gap. */
  markRegistered: () => void
}

function normalizeCwdValue(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || /[\u0000\u0001-\u001f\u007f]/.test(value)) {
    throw new Error('Invalid agent cwd')
  }
  const normalized = value.trim()
  return normalized || undefined
}

/**
 * Resolve a history reader's workspace-relative cwd without allowing an
 * absolute path or traversal outside the configured workspace root.
 */
export function resolveAgentCwd(workspaceRoot: string, historyCwd?: unknown): string {
  if (typeof workspaceRoot !== 'string' || !workspaceRoot.trim()) {
    throw new Error('Agent workspace root is required')
  }

  const root = resolve(workspaceRoot)
  const cwd = normalizeCwdValue(historyCwd)
  if (!cwd) return root
  if (isAbsolute(cwd) || WINDOWS_ABSOLUTE_PATH.test(cwd) || UNC_ABSOLUTE_PATH.test(cwd)) {
    throw new Error('Invalid agent cwd')
  }

  const candidate = resolve(root, cwd)
  const remainder = relative(root, candidate)
  if (remainder === '' || (!remainder.startsWith('..') && !isAbsolute(remainder))) return candidate
  throw new Error('Invalid agent cwd')
}

function normalizedSessionId(agent: TerminalAgentMetadata, tileId: string): string {
  if (agent.sessionId !== undefined) {
    const sessionId = normalizeResumeId(agent.sessionId)
    if (!sessionId) throw new Error('Invalid agent resume id')
    return sessionId
  }
  const sessionId = normalizeResumeId(tileId)
  if (!sessionId) throw new Error('Invalid agent tile id')
  return sessionId
}

/**
 * Build a direct PTY launch for an agent. The provider adapter owns the fixed
 * executable and argument shape; this layer only selects its validated cwd.
 */
export function buildAgentTerminalLaunch(input: AgentTerminalLaunchInput): AgentTerminalLaunch {
  const tileId = normalizeAgentOpaqueId(input?.tileId)
  const workspaceId = normalizeAgentOpaqueId(input?.workspaceId)
  if (!tileId) throw new Error('Invalid agent tile id')
  if (!workspaceId) throw new Error('Invalid agent workspace id')

  const agent = input?.agent
  if (!agent || !isAgentProvider(agent.provider)) throw new Error('Invalid agent provider')

  const sessionId = normalizedSessionId(agent, tileId)
  const config = normalizeAgentProviderConfig(input.providerConfig)
  if (!config.enabled) throw new Error(`Agent provider "${agent.provider}" is disabled`)

  const workspaceRoot = typeof input.workspaceRoot === 'string' && input.workspaceRoot.trim()
    ? input.workspaceRoot
    : input.fallbackCwd
  const cwd = resolveAgentCwd(workspaceRoot, agent.cwd)
  const command = buildAgentCommand(agent.provider, config, agent.sessionId, { newSession: input.newSession })

  return {
    provider: command.provider,
    command: command.command,
    args: command.args,
    cwd,
    sessionId,
  }
}

/**
 * PTYs can report an exit before the runtime registry has accepted the
 * session. Hold that signal until registration completes so it cannot be
 * lost during the launch handoff.
 */
export function createAgentTerminalExitGate(onExit: () => void): AgentTerminalExitGate {
  let registered = false
  let exited = false
  let delivered = false

  const deliver = () => {
    if (delivered) return
    delivered = true
    onExit()
  }

  return {
    handle: () => {
      exited = true
      if (registered) deliver()
    },
    markRegistered: () => {
      registered = true
      if (exited) deliver()
    },
  }
}

const ESC = '\u001b'
const BEL = '\u0007'
// Sequences the terminal emulator sends by itself: focus in/out, cursor and
// status reports, device attributes, mode and window reports, SGR mouse
// reports, and OSC/DCS replies. None of them is text the user typed.
const TERMINAL_PROTOCOL_REPLY = new RegExp(
  `^(?:${ESC}\\[[IO]` +
  `|${ESC}\\[\\d+(?:;\\d+)*[Rnt]` +
  `|${ESC}\\[[?>=][\\d;]*[cnu]` +
  `|${ESC}\\[\\??[\\d;]*\\$y` +
  `|${ESC}\\[<\\d+;\\d+;\\d+[Mm]` +
  `|${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)` +
  `|${ESC}P[^${ESC}]*${ESC}\\\\)+$`,
)

/**
 * True when terminal input contains only emulator replies. Such input must
 * not mark an agent as working: focusing a tile sends a focus-in report.
 */
export function isTerminalProtocolReply(data: string): boolean {
  return TERMINAL_PROTOCOL_REPLY.test(data)
}

// Pasted text and Alt+Enter (a newline inside the prompt) carry a carriage
// return without submitting anything.
const NON_SUBMIT_RETURNS = new RegExp(`${ESC}\\[200~[\\s\\S]*?(?:${ESC}\\[201~|$)|${ESC}\\r`, 'g')

// An SGR mouse button press. Motion (32) and wheel (64) reports are not clicks.
const SGR_MOUSE_PRESS = new RegExp(`^${ESC}\\[<(\\d+);\\d+;\\d+M$`)

function isMouseClick(data: string): boolean {
  const match = SGR_MOUSE_PRESS.exec(data)
  return match !== null && (Number(match[1]) & (32 | 64)) === 0
}

/**
 * What a chunk of user input means for the agent's turn. Only Enter starts
 * a turn; Esc or Ctrl+C on their own interrupt it. Any other key is typing.
 * A mouse click counts as typing too: Claude dialogs can be answered by clicking.
 */
export function classifyAgentInput(data: string): AgentInputKind | null {
  if (isMouseClick(data)) return 'typing'
  if (!data || isTerminalProtocolReply(data)) return null
  if (data === ESC || data === '\u0003') return 'interrupt'
  return data.replace(NON_SUBMIT_RETURNS, '').includes('\r') ? 'submit' : 'typing'
}

/**
 * Adapt PTY lifecycle signals to the shared runtime registry. Focus clears
 * semantic attention only; it deliberately never changes the session status.
 */
export function createAgentTerminalLifecycle({
  registry,
  tileId,
  workspaceId,
}: AgentTerminalLifecycleOptions): AgentTerminalLifecycle {
  const normalizedTileId = normalizeAgentOpaqueId(tileId)
  const normalizedWorkspaceId = normalizeAgentOpaqueId(workspaceId)
  if (!normalizedTileId) throw new Error('Invalid agent tile id')
  if (!normalizedWorkspaceId) throw new Error('Invalid agent workspace id')

  let exited = false

  return {
    onAlert: (alert: unknown) => registry.reportAgentAlert(alert, normalizedWorkspaceId),
    onInput: (data: string) => {
      const kind = classifyAgentInput(data)
      return kind !== null && registry.recordActivity(normalizedWorkspaceId, normalizedTileId, kind)
    },
    onFocus: () => registry.alerts.clearOnFocus(normalizedTileId),
    onExit: () => {
      if (exited) return false
      exited = true
      return registry.markExited(normalizedWorkspaceId, normalizedTileId)
    },
  }
}
