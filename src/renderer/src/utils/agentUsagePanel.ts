import type { AgentProvider, AgentUsageWindow } from '@shared/types'

export function getVisibleAgentProviders(workspaces: readonly { config: { agentProvider?: AgentProvider } }[]): AgentProvider[] {
  return (['claude', 'codex'] as const).filter((provider) => workspaces.some((workspace) => workspace.config.agentProvider === provider))
}

export function getUsagePace(window: AgentUsageWindow, now: number): {
  elapsed: number
  projection: number | null
} {
  const duration = window.kind === 'fiveHour' ? 300 * 60_000 : 10_080 * 60_000
  const remaining = new Date(window.resetsAt).getTime() - now
  const elapsed = Math.max(0, Math.min(1, 1 - remaining / duration))
  return { elapsed, projection: elapsed > 0.05 ? Math.min(999, window.usedPercent / elapsed) : null }
}

export function formatCompactTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')} M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1).replace(/\.0$/, '')} k`
  return String(Math.round(value))
}

export function getHourlyPoints(values: readonly number[], width = 240, height = 56, now = Date.now()): Array<{
  x: number
  y: number
  value: number
}> {
  const end = Math.max(0, Math.min(23, new Date(now).getHours()))
  const visible = values.slice(0, end + 1)
  const max = Math.max(1, ...visible)
  return visible.map((value, index) => ({
    x: visible.length <= 1 ? 0 : (index / 23) * width,
    y: height - (value / max) * (height - 6) - 3,
    value,
  }))
}
