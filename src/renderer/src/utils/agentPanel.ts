import type { AgentSessionHistoryQuery } from '@shared/types'

export type AgentHistoryScope = 'workspace' | 'all'

/** Build the restricted bridge query used by the Agents panel. */
export function buildAgentHistoryQuery(
  scope: AgentHistoryScope,
  workspaceId: string,
  search: string,
): AgentSessionHistoryQuery {
  const normalizedSearch = search.trim().replace(/\s+/g, ' ')
  return {
    ...(scope === 'workspace' ? { workspaceId } : {}),
    ...(normalizedSearch ? { search: normalizedSearch } : {}),
  }
}

/** Keep renderer display and resume actions inside the provider's workspace root. */
export function sanitizeAgentCwd(cwd: string | undefined): string | null {
  if (typeof cwd !== 'string' || /[\u0000-\u001f\u007f]/.test(cwd)) return null
  const normalized = cwd.trim().replace(/\\/g, '/')
  if (!normalized || normalized === '.') return '.'
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return null

  const segments = normalized.split('/').filter(Boolean)
  if (segments.some((segment) => segment === '..' || segment === '.')) return null
  return segments.length > 0 ? segments.join('/') : '.'
}

/** Render a bounded, human-readable age without trusting provider timestamps. */
export function formatAgentAge(timestamp: string | undefined, now = Date.now()): string {
  const parsed = typeof timestamp === 'string' ? Date.parse(timestamp) : Number.NaN
  if (!Number.isFinite(parsed)) return 'Unknown age'

  const deltaSeconds = Math.round((now - parsed) / 1_000)
  const absoluteSeconds = Math.abs(deltaSeconds)
  if (absoluteSeconds < 60) return deltaSeconds < 0 ? 'in a moment' : 'just now'

  const units = [
    { seconds: 31_536_000, singular: 'year', plural: 'years' },
    { seconds: 2_592_000, singular: 'month', plural: 'months' },
    { seconds: 604_800, singular: 'week', plural: 'weeks' },
    { seconds: 86_400, singular: 'day', plural: 'days' },
    { seconds: 3_600, singular: 'hour', plural: 'hours' },
    { seconds: 60, singular: 'minute', plural: 'minutes' },
  ]
  const unit = units.find(({ seconds }) => absoluteSeconds >= seconds)
  if (!unit) return deltaSeconds < 0 ? 'in a moment' : 'just now'

  const value = Math.max(1, Math.floor(absoluteSeconds / unit.seconds))
  const label = value === 1 ? unit.singular : unit.plural
  return deltaSeconds < 0 ? `in ${value} ${label}` : `${value} ${label} ago`
}
