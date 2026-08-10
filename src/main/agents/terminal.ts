import { isAbsolute, relative, resolve } from 'node:path'

import type {
  AgentProviderConfig,
  TerminalAgentMetadata,
} from '@shared/types'
import { normalizeAgentProviderConfig } from '@shared/workspaceConfig'
import { normalizeAgentOpaqueId, isAgentProvider } from './query'
import { buildAgentCommand, normalizeResumeId } from './providers'
import { AgentSessionRegistry } from './registry'

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
  const command = buildAgentCommand(agent.provider, config, agent.sessionId)

  return {
    provider: command.provider,
    command: command.command,
    args: command.args,
    cwd,
    sessionId,
  }
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
  let exited = false

  return {
    onAlert: (alert: unknown) => registry.reportAgentAlert(alert, workspaceId),
    onInput: (data: string) => data.length > 0 && registry.recordActivity(workspaceId, tileId),
    onFocus: () => registry.alerts.clearOnFocus(tileId),
    onExit: () => {
      if (exited) return false
      exited = true
      return registry.markExited(workspaceId, tileId)
    },
  }
}
