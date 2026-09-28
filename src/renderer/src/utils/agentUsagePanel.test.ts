import assert from 'node:assert/strict'
import test from 'node:test'
import { formatCompactTokens, getHourlyPoints, getUsagePace, getVisibleAgentProviders } from './agentUsagePanel'

test('projects usage across elapsed reset windows', () => {
  const now = new Date(2026, 8, 28, 12).getTime()
  const reset = new Date(now + 150 * 60_000).toISOString()
  const pace = getUsagePace({ kind: 'fiveHour', usedPercent: 40, resetsAt: reset }, now)
  assert.equal(pace.elapsed, 0.5)
  assert.equal(pace.projection, 80)
})

test('formats compact tokens and only includes configured providers', () => {
  assert.equal(formatCompactTokens(1_200_000), '1.2 M')
  assert.equal(formatCompactTokens(450_000), '450 k')
  assert.deepEqual(getVisibleAgentProviders([
    { config: { agentProvider: 'codex' } },
    { config: {} },
  ]), ['codex'])
})

test('returns hourly graph points only through the current local hour', () => {
  const points = getHourlyPoints(Array.from({ length: 24 }, (_, index) => index), 240, 56, new Date(2026, 8, 28, 3).getTime())
  assert.equal(points.length, 4)
  assert.equal(points[0].x, 0)
  assert.equal(points[3].value, 3)
})
