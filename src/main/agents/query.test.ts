import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeAgentHistoryQuery } from './query'

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
