import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AgentUsageProviderSnapshot } from '@shared/types'
import { AgentUsageIndicator, formatUsageResetAt } from './AgentUsageIndicator'
import { initializeI18n } from '../i18n'

await initializeI18n()

const resetAt = '2026-08-12T15:30:00.000Z'

function renderIndicator(snapshot: Omit<AgentUsageProviderSnapshot, 'provider'> | null | undefined, provider: 'codex' | 'claude' = 'codex'): string {
  return renderToStaticMarkup(
    <AgentUsageIndicator provider={provider} snapshot={snapshot ? { provider, ...snapshot } : snapshot} />,
  )
}

test('formats five-hour and weekly reset dates in the requested order', () => {
  assert.equal(
    formatUsageResetAt(resetAt, 'fiveHour', { locale: 'en-GB', timeZone: 'UTC' }),
    '15:30',
  )
  assert.equal(
    formatUsageResetAt(resetAt, 'weekly', { locale: 'en-GB', timeZone: 'UTC' }),
    '12 Aug 15:30',
  )
})

test('renders one available Codex window with an accessible progress ring and reset date', () => {
  const markup = renderIndicator({
    status: 'available',
    windows: [{ kind: 'fiveHour', usedPercent: 42, resetsAt: resetAt }],
  })

  assert.match(markup, /data-provider="codex"/)
  assert.match(markup, /src="\.\/agent-provider-logos\/openai\.svg"/)
  assert.match(markup, /data-provider-logo="true"/)
  assert.match(markup, /alt=""/)
  assert.match(markup, /aria-hidden="true"/)
  assert.doesNotMatch(markup, />Codex</)
  assert.match(markup, /aria-label="Codex usage"/)
  assert.match(markup, /data-window-kind="fiveHour"/)
  assert.match(markup, /data-used-percent="42"/)
  assert.match(markup, />42%<\/span>/)
  assert.match(markup, />5 h<\/span>/)
  assert.match(markup, /class="[^\"]*text-text-primary[^\"]*" data-usage-window-label="true"/)
  assert.match(markup, /class="[^\"]*text-text-primary[^\"]*" data-reset-at="[^\"]*" data-usage-reset="true"/)
  assert.match(markup, /role="img"/)
  assert.match(markup, /aria-label="Codex 5 h usage: 42%/)
  assert.match(markup, /data-reset-at="2026-08-12T15:30:00.000Z"/)
  assert.match(markup, />↻ [^<]+<\/span>/)
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
  assert.match(markup, /src="\.\/agent-provider-logos\/anthropic\.svg"/)
  assert.match(markup, /aria-label="Claude usage"/)
  assert.doesNotMatch(markup, />Claude</)
  assert.equal((markup.match(/data-window-kind=/g) ?? []).length, 2)
  assert.match(markup, /data-window-kind="fiveHour"/)
  assert.match(markup, /data-window-kind="weekly"/)
  assert.match(markup, />67%<\/span>/)
  assert.match(markup, />81%<\/span>/)
  assert.match(markup, />5 h<\/span>/)
  assert.match(markup, />wk\.<\/span>/)
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
