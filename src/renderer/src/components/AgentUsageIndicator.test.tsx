import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AgentUsageIndicator, type AgentUsageProviderSnapshot } from './AgentUsageIndicator'

const resetAt = '2026-08-12T15:30:00.000Z'

function renderIndicator(snapshot: AgentUsageProviderSnapshot | null | undefined, provider: 'codex' | 'claude' = 'codex'): string {
  return renderToStaticMarkup(
    <AgentUsageIndicator provider={provider} snapshot={snapshot} />,
  )
}

test('renders one available Codex window with an accessible progress ring and reset date', () => {
  const markup = renderIndicator({
    status: 'available',
    windows: [{ kind: 'fiveHour', usedPercent: 42, resetsAt: resetAt }],
  })

  assert.match(markup, /data-provider="codex"/)
  assert.match(markup, />Codex</)
  assert.match(markup, /data-window-kind="fiveHour"/)
  assert.match(markup, /data-used-percent="42"/)
  assert.match(markup, />42%<\/span>/)
  assert.match(markup, />5 h<\/span>/)
  assert.match(markup, /role="img"/)
  assert.match(markup, /aria-label="Codex 5 h usage: 42%/)
  assert.match(markup, /data-reset-at="2026-08-12T15:30:00.000Z"/)
  assert.match(markup, /2026/)
})

test('renders both compact windows and preserves the Claude provider identity', () => {
  const markup = renderIndicator({
    status: 'available',
    windows: [
      { kind: 'fiveHour', usedPercent: 67, resetsAt: resetAt },
      { kind: 'weekly', usedPercent: 81, resetsAt: '2026-08-18T09:00:00.000Z' },
    ],
  }, 'claude')

  assert.match(markup, /data-provider="claude"/)
  assert.match(markup, />Claude</)
  assert.equal((markup.match(/data-window-kind=/g) ?? []).length, 2)
  assert.match(markup, /data-window-kind="fiveHour"/)
  assert.match(markup, /data-window-kind="weekly"/)
  assert.match(markup, />67%<\/span>/)
  assert.match(markup, />81%<\/span>/)
  assert.match(markup, />5 h<\/span>/)
  assert.match(markup, />sem\.<\/span>/)
})

test('renders a muted unavailable state when the snapshot is absent or unavailable', () => {
  const unavailableMarkup = renderIndicator({ status: 'unavailable', windows: [] }, 'claude')
  const missingMarkup = renderIndicator(undefined)

  for (const markup of [unavailableMarkup, missingMarkup]) {
    assert.match(markup, /text-text-muted/)
    assert.match(markup, /data-status="unavailable"/)
    assert.match(markup, /aria-label="(?:Claude|Codex) usage unavailable"/)
    assert.match(markup, /—/)
    assert.doesNotMatch(markup, /data-window-kind=/)
  }
})

test('uses neutral, amber, and red threshold styles at the expected boundaries', () => {
  const cases = [
    { usedPercent: 69, threshold: 'neutral', className: 'text-text-secondary' },
    { usedPercent: 70, threshold: 'warning', className: 'text-amber-300' },
    { usedPercent: 89, threshold: 'warning', className: 'text-amber-300' },
    { usedPercent: 90, threshold: 'critical', className: 'text-red-300' },
  ] as const

  for (const { usedPercent, threshold, className } of cases) {
    const markup = renderIndicator({
      status: 'available',
      windows: [{ kind: 'fiveHour', usedPercent, resetsAt: resetAt }],
    })

    assert.match(markup, new RegExp(`data-usage-threshold="${threshold}"`))
    assert.match(markup, new RegExp(`class="[^"]*${className.replace('-', '\\-')}[^"]*"`))
    assert.match(markup, new RegExp(`data-used-percent="${usedPercent}"`))
  }
})

test('hides reset dates below 800px while retaining provider and percentages', () => {
  const markup = renderIndicator({
    status: 'available',
    windows: [
      { kind: 'fiveHour', usedPercent: 42, resetsAt: resetAt },
      { kind: 'weekly', usedPercent: 81, resetsAt: resetAt },
    ],
  })

  assert.match(markup, /data-provider="codex"/)
  assert.match(markup, /min-w-0/)
  assert.match(markup, /max-w-full/)
  assert.match(markup, /hidden min-\[800px\]:inline/)
  assert.match(markup, /data-reset-at=/)
  assert.match(markup, />42%<\/span>/)
  assert.match(markup, />81%<\/span>/)
})
