import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentUsageHistorySnapshot } from '@shared/types'
import {
  buildUsageChart,
  getActivityUsageRequests,
  getCacheHitPercent,
  getChartTicks,
  getStackedChartValues,
  getWorkspaceTokensToday,
  normalizeActivityFilter,
} from './activityUsage'

const snapshot: AgentUsageHistorySnapshot = {
  updatedAt: '2026-01-01T12:00:00.000Z',
  period: 'today',
  providers: ['claude', 'codex'],
  indexing: false,
  totals: {
    total: 1000,
    input: 100,
    cacheRead: 600,
    cacheWrite: 100,
    output: 150,
    reasoning: 50,
    messages: 10,
    sessions: 2,
  },
  series: {
    bucket: 'hour',
    points: [
      { start: '2026-01-01T10:00:00.000Z', claude: 120, codex: 80 },
      { start: '2026-01-01T11:00:00.000Z', claude: 200 },
    ],
  },
  byModel: [],
  byWorkspace: [{ workspaceId: 'w1', tokens: 345 }],
  byProvider: [],
  recentSessions: [],
}

test('computes cache-hit ratio from cache reads and non-cached input', () => {
  assert.equal(getCacheHitPercent(snapshot), 75)
})

test('creates regular chart ticks and stacked provider totals', () => {
  assert.deepEqual(getChartTicks(900), [1000, 500, 0])
  assert.deepEqual(getChartTicks(0), [0])
  assert.deepEqual(getStackedChartValues(snapshot, ['claude', 'codex']), [200, 200])
})

test('builds fixed-viewBox stacked areas and localized axis labels', () => {
  const hourlyHistory = {
    ...snapshot,
    series: {
      bucket: 'hour' as const,
      points: Array.from({ length: 24 }, (_, hour) => ({
        start: new Date(2026, 0, 1, hour).toISOString(),
        claude: hour * 10,
        codex: hour * 5,
      })),
    },
  }
  const chart = buildUsageChart(
    hourlyHistory,
    ['claude', 'codex'],
    'today',
    new Date(2026, 0, 1, 13).getTime(),
    'en',
  )
  assert.equal(chart.areas.length, 2)
  assert.ok(chart.areas[0].points.includes(','))
  assert.equal(chart.plot.left, 48)
  assert.ok(chart.ticks.some((tick) => tick.value === 0))
  assert.deepEqual(chart.xLabels.map((item) => item.label), ['00', '06', '12', '13', '18'])
  assert.equal(chart.areas[0].lastX, 48 + 13 / 23 * (628 - 48))
  assert.deepEqual(
    buildUsageChart(snapshot, ['claude'], 'today', 1767268800000).areas.map((area) => area.provider),
    ['claude'],
  )
})

test('keeps a today query for workspace cards when the selected period changes', () => {
  const requests = getActivityUsageRequests('7d', ['claude'])
  assert.deepEqual(requests.map((request) => request.period), ['7d', 'today'])
  const filteredToday = getActivityUsageRequests('today', ['codex'], ['claude', 'codex'])
  assert.deepEqual(filteredToday[1], { period: 'today', providers: ['claude', 'codex'] })
  assert.equal(getWorkspaceTokensToday(snapshot, 'w1'), 345)
  assert.equal(getWorkspaceTokensToday(snapshot, 'missing'), undefined)
})

test('labels the start, middle, and end buckets for multi-day chart ranges', () => {
  const dailyHistory = {
    ...snapshot,
    period: '7d' as const,
    series: {
      bucket: 'day' as const,
      points: Array.from({ length: 7 }, (_, day) => ({
        start: new Date(2026, 0, day + 1).toISOString(),
        claude: day * 10,
      })),
    },
  }
  const chart = buildUsageChart(dailyHistory, ['claude'], '7d', Date.now(), 'en')
  assert.equal(chart.xLabels.length, 3)
  assert.deepEqual(chart.xLabels.map((item) => item.x), [48, 338, 628])
})

test('normalizes a filter when its provider is disabled', () => {
  assert.equal(normalizeActivityFilter('codex', ['claude']), 'all')
})
