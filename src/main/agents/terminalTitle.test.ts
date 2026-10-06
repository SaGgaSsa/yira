import assert from 'node:assert/strict'
import test from 'node:test'

import { AgentTerminalTitleTracker, scanTerminalTitle } from './terminalTitle'

test('finds the last OSC 0 or 2 title in terminal output', () => {
  assert.deepEqual(scanTerminalTitle('', 'plain output'), { title: undefined, pending: '' })
  assert.deepEqual(
    scanTerminalTitle('', 'a\u001b]0;First\u0007b\u001b]2;Second\u001b\\c'),
    { title: 'Second', pending: '' },
  )
  assert.deepEqual(scanTerminalTitle('', '\u001b]8;;https://example.com\u0007link'), { title: undefined, pending: '' })
})

test('keeps an unterminated title for the next chunk', () => {
  const first = scanTerminalTitle('', 'out\u001b]0;Split ti')
  assert.deepEqual(first, { title: undefined, pending: '\u001b]0;Split ti' })
  assert.deepEqual(scanTerminalTitle(first.pending, 'tle\u0007rest'), { title: 'Split title', pending: '' })
})

test('publishes the first title at once and the latest one after the interval', () => {
  let now = 1_000
  const published: string[] = []
  const tracker = new AgentTerminalTitleTracker({
    publish: (_workspaceId, _tileId, title) => published.push(title),
    intervalMs: 500,
    now: () => now,
  })
  const timers: Array<() => void> = []
  const originalSetTimeout = globalThis.setTimeout
  globalThis.setTimeout = ((callback: () => void) => {
    timers.push(callback)
    return 0 as unknown as ReturnType<typeof setTimeout>
  }) as typeof setTimeout

  try {
    tracker.receive('w', 't', '\u001b]0;⠂ Task\u0007')
    now += 100
    tracker.receive('w', 't', '\u001b]0;⠐ Task\u0007')
    tracker.receive('w', 't', '\u001b]0;✳ Task\u0007')
    tracker.receive('w', 't', 'output without a title')
    assert.deepEqual(published, ['⠂ Task'])
    assert.equal(timers.length, 1)

    now += 400
    timers[0]()
    assert.deepEqual(published, ['⠂ Task', '✳ Task'])
  } finally {
    globalThis.setTimeout = originalSetTimeout
    tracker.dispose()
  }
})
