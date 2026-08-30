import assert from 'node:assert/strict'
import test from 'node:test'

import {
  sameTerminalSessionIdentity,
  terminalSessionDataChannel,
  terminalSessionExitChannel,
  terminalSessionLookupKey,
  type TerminalSessionIdentity,
} from './terminalSessionIdentity'

const first: TerminalSessionIdentity = {
  workspaceId: 'workspace-a',
  tileId: 'tile-a',
  generation: 7,
}

test('scopes a terminal lookup key to workspace and tile', () => {
  assert.notEqual(
    terminalSessionLookupKey(first),
    terminalSessionLookupKey({ workspaceId: 'workspace-b', tileId: 'tile-a' }),
  )
})

test('requires workspace, tile, and generation to match', () => {
  assert.equal(sameTerminalSessionIdentity(first, { ...first }), true)
  assert.equal(sameTerminalSessionIdentity(first, { ...first, generation: 8 }), false)
  assert.equal(sameTerminalSessionIdentity(first, { ...first, workspaceId: 'workspace-b' }), false)
})

test('keeps channel names distinct when identity parts contain separators', () => {
  const firstWithSeparator: TerminalSessionIdentity = {
    workspaceId: 'a:b',
    tileId: 'c',
    generation: 1,
  }
  const secondWithSeparator: TerminalSessionIdentity = {
    workspaceId: 'a',
    tileId: 'b:c',
    generation: 1,
  }

  assert.notEqual(terminalSessionDataChannel(firstWithSeparator), terminalSessionDataChannel(secondWithSeparator))
  assert.notEqual(terminalSessionExitChannel(firstWithSeparator), terminalSessionExitChannel(secondWithSeparator))
})
