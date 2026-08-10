import assert from 'node:assert/strict'
import test from 'node:test'

import { isSafeAgentHistoryQueryInput, normalizeAgentHistoryQuery } from './query'

test('normalizes restricted history query values and clamps result limits', () => {
  assert.deepEqual(normalizeAgentHistoryQuery({
    provider: 'claude',
    workspaceId: ' workspace-1 ',
    search: ' release ',
    limit: 999,
  }), {
    provider: 'claude',
    workspaceId: 'workspace-1',
    search: 'release',
    limit: 100,
  })
  assert.deepEqual(normalizeAgentHistoryQuery({ provider: 'cursor', workspaceId: '../escape', search: '\u0000bad', limit: -1 }), {
    limit: 50,
  })
})

test('rejects malformed non-object history queries instead of broadening to an unscoped query', () => {
  assert.deepEqual(normalizeAgentHistoryQuery(undefined), { limit: 50 })
  for (const value of [null, 'history', [], 42, true]) {
    assert.equal(isSafeAgentHistoryQueryInput(value), false)
    assert.equal(normalizeAgentHistoryQuery(value), null)
  }
})
