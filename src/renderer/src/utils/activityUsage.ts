import type { AgentProvider, AgentUsageHistorySnapshot, AgentUsagePeriod } from '@shared/types'

export type ActivityProviderFilter = AgentProvider | 'all'
export const ACTIVITY_FILTER_KEY = 'yira.activity.filters'

export const USAGE_CHART = {
  width: 640,
  height: 180,
  left: 48,
  right: 12,
  top: 8,
  bottom: 32,
} as const

export function normalizeActivityFilter(
  filter: ActivityProviderFilter,
  enabled: readonly AgentProvider[],
): ActivityProviderFilter {
  if (filter === 'all') return 'all'
  return enabled.includes(filter) ? filter : 'all'
}

export function getActivityUsageRequests(
  period: AgentUsagePeriod,
  providers: readonly AgentProvider[],
  todayProviders: readonly AgentProvider[] = providers,
): Array<{ period: AgentUsagePeriod; providers: AgentProvider[] }> {
  const selectedProviders = [...providers]
  const requests = [{ period, providers: selectedProviders }]
  const selectedTodayProviders = [...todayProviders]
  const sameTodayProviders = selectedTodayProviders.join(',') === selectedProviders.join(',')
  if (period !== 'today' || !sameTodayProviders) {
    requests.push({ period: 'today', providers: selectedTodayProviders })
  }
  return requests
}

export function getWorkspaceTokensToday(
  history: AgentUsageHistorySnapshot | null,
  workspaceId: string,
): number | undefined {
  return history?.byWorkspace.find((item) => item.workspaceId === workspaceId)?.tokens
}

export function readActivityFilters(): { provider: ActivityProviderFilter; period: AgentUsagePeriod } {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACTIVITY_FILTER_KEY) ?? '{}') as Record<string, unknown>
    return {
      provider: parsed.provider === 'claude' || parsed.provider === 'codex' ? parsed.provider : 'all',
      period: parsed.period === '7d' || parsed.period === '30d' ? parsed.period : 'today',
    }
  } catch {
    return { provider: 'all', period: 'today' }
  }
}

export function getCacheHitPercent(history: AgentUsageHistorySnapshot): number {
  const denominator = history.totals.cacheRead + history.totals.input + history.totals.cacheWrite
  return denominator > 0 ? Math.round(history.totals.cacheRead / denominator * 100) : 0
}

export function getChartTicks(max: number): number[] {
  if (!(max > 0)) return [0]
  const roughStep = max / 4
  const magnitude = 10 ** Math.floor(Math.log10(roughStep))
  const multiplier = [1, 2, 5, 10].find((value) => value * magnitude >= roughStep) ?? 10
  const step = multiplier * magnitude
  const ceiling = Math.ceil(max / step) * step
  const intervals = Math.ceil(ceiling / step)
  return Array.from({ length: intervals + 1 }, (_, index) => Number((ceiling - index * step).toPrecision(12)))
}

export function getStackedChartValues(
  history: AgentUsageHistorySnapshot,
  providers: readonly AgentProvider[],
): number[] {
  return history.series.points.map((point) => (
    providers.reduce((sum, provider) => sum + (point[provider] ?? 0), 0)
  ))
}

export interface UsageChartModel {
  ticks: Array<{ value: number; y: number }>
  areas: Array<{ provider: AgentProvider; points: string; lastX: number; lastY: number }>
  xLabels: Array<{ label: string; x: number }>
  plot: { left: number; right: number; top: number; bottom: number }
}

export function buildUsageChart(
  history: AgentUsageHistorySnapshot | null,
  providers: readonly AgentProvider[],
  period: AgentUsagePeriod,
  now = Date.now(),
  locale?: string,
): UsageChartModel {
  const points = history?.series.points ?? []
  const totals = getStackedChartValues(history ?? emptyHistory(), providers)
  const ticks = getChartTicks(Math.max(0, ...totals))
  const plot = {
    left: USAGE_CHART.left,
    right: USAGE_CHART.width - USAGE_CHART.right,
    top: USAGE_CHART.top,
    bottom: USAGE_CHART.height - USAGE_CHART.bottom,
  }
  const max = Math.max(1, ticks[0] ?? 1)
  const currentHour = new Date(now).getHours()
  const lastIndex = period === 'today'
    ? Math.max(0, points.findIndex((point) => new Date(point.start).getHours() === currentHour))
    : points.length - 1
  const xFor = (index: number) => points.length < 2
    ? plot.left
    : plot.left + index / (points.length - 1) * (plot.right - plot.left)
  const yFor = (value: number) => plot.bottom - value / max * (plot.bottom - plot.top)
  const chartAreas: UsageChartModel['areas'] = []
  const lower = points.map(() => 0)

  for (const provider of providers) {
    const upper = points.map((point, index) => lower[index] + (point[provider] ?? 0))
    const topPoints = upper.map((value, index) => `${xFor(index)},${yFor(value)}`)
    const bottomPoints = lower.map((value, index) => `${xFor(index)},${yFor(value)}`).reverse()
    const markerIndex = Math.min(lastIndex, upper.length - 1)
    const lastX = markerIndex >= 0 ? xFor(markerIndex) : plot.left
    const lastY = markerIndex >= 0 ? yFor(upper[markerIndex]) : plot.bottom
    chartAreas.push({ provider, points: [...topPoints, ...bottomPoints].join(' '), lastX, lastY })
    upper.forEach((value, index) => { lower[index] = value })
  }

  const labels = period === 'today'
    ? getHourLabels(points, now, locale, xFor)
    : getDayLabels(points, locale, xFor)

  return {
    ticks: ticks.map((value) => ({ value, y: yFor(value) })),
    areas: chartAreas,
    xLabels: labels,
    plot,
  }
}

function getHourLabels(
  points: AgentUsageHistorySnapshot['series']['points'],
  now: number,
  locale: string | undefined,
  xFor: (index: number) => number,
): Array<{ label: string; x: number }> {
  const hours = new Set([0, 6, 12, 18, new Date(now).getHours()])
  return points.flatMap((point, index) => {
    const hour = new Date(point.start).getHours()
    return hours.has(hour) ? [{ label: String(hour), x: xFor(index) }] : []
  }).map((item) => ({ ...item, label: new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(Number(item.label)) }))
}

function getDayLabels(
  points: AgentUsageHistorySnapshot['series']['points'],
  locale: string | undefined,
  xFor: (index: number) => number,
): Array<{ label: string; x: number }> {
  if (!points.length) return []
  const indexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])]
  const formatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
  return indexes.map((index) => ({
    label: formatter.format(new Date(points[index].start)),
    x: xFor(index),
  }))
}

function emptyHistory(): AgentUsageHistorySnapshot {
  return {
    updatedAt: '',
    period: 'today',
    providers: [],
    indexing: false,
    totals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0, messages: 0, sessions: 0 },
    series: { bucket: 'hour', points: [] },
    byModel: [],
    byWorkspace: [],
    byProvider: [],
    recentSessions: [],
  }
}
