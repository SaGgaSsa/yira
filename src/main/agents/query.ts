import type { AgentProvider, AgentSessionHistoryQuery } from '@shared/types'

export const DEFAULT_HISTORY_RESULT_LIMIT = 50
export const MAX_HISTORY_RESULT_LIMIT = 100
export const MAX_AGENT_QUERY_TEXT_LENGTH = 200

export interface NormalizedAgentHistoryQuery {
  workspaceId?: string
  provider?: AgentProvider
  search?: string
  limit: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isAgentProvider(value: unknown): value is AgentProvider {
  return value === 'claude' || value === 'codex'
}

/** Identifiers cross the bridge, so never allow path separators or controls. */
export function normalizeAgentOpaqueId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(normalized)) return undefined
  return normalized
}

function normalizeQueryText(value: unknown): string | undefined {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return undefined
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized) return undefined
  return normalized.slice(0, MAX_AGENT_QUERY_TEXT_LENGTH)
}

function normalizeLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return DEFAULT_HISTORY_RESULT_LIMIT
  return Math.min(value, MAX_HISTORY_RESULT_LIMIT)
}

/** Normalize untrusted renderer history input to a small, data-only query. */
export function normalizeAgentHistoryQuery(input: unknown): NormalizedAgentHistoryQuery | null {
  if (input !== undefined && !isRecord(input)) return null
  const value = input === undefined ? {} : input
  const query: NormalizedAgentHistoryQuery = { limit: normalizeLimit(value.limit) }
  const workspaceId = normalizeAgentOpaqueId(value.workspaceId)
  if (workspaceId) query.workspaceId = workspaceId
  if (isAgentProvider(value.provider)) query.provider = value.provider
  const search = normalizeQueryText(value.search)
  if (search) query.search = search
  return query
}

/** Explicitly reject invalid enum/identifier fields instead of broadening scope. */
export function isSafeAgentHistoryQueryInput(input: unknown): boolean {
  if (input === undefined) return true
  if (!isRecord(input)) return false
  if (input.workspaceId !== undefined && !normalizeAgentOpaqueId(input.workspaceId)) return false
  if (input.provider !== undefined && !isAgentProvider(input.provider)) return false
  if (input.search !== undefined && typeof input.search !== 'string') return false
  if (typeof input.search === 'string' && /[\u0000-\u001f\u007f]/.test(input.search)) return false
  return true
}

/** Keep the shared query type available to IPC adapters without accepting it at runtime. */
export function isAgentHistoryQuery(value: unknown): value is AgentSessionHistoryQuery {
  return isRecord(value)
}
