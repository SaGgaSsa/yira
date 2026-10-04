import assert from 'node:assert/strict'
import test from 'node:test'
import type { TileState, ViewMode } from '@shared/types'
import { getActiveWindowTitle, getTileWindowTitle } from './windowTitle'

const terminal: TileState = {
  id: 'terminal-1', type: 'terminal', x: 0, y: 0, width: 640, height: 420, zIndex: 1,
}
const note: TileState = { ...terminal, id: 'note-1', type: 'note', label: 'Design', zIndex: 2 }
const state: Parameters<typeof getActiveWindowTitle>[0] = {
  tiles: [terminal, note],
  terminalTitles: { [terminal.id]: 'OpenCode' },
  activeWorkspaceName: 'Project',
  viewMode: 'canvas',
  focusedTileId: terminal.id,
  fullviewActiveTileId: terminal.id,
  splitViewState: {
    leftTileIds: [terminal.id], rightTileIds: [note.id],
    activeLeftTileId: terminal.id, activeRightTileId: note.id,
    focusedPanel: 'left', orientation: 'horizontal',
  },
}

for (const viewMode of ['canvas', 'gridview', 'fullview', 'splitview'] satisfies ViewMode[]) {
  test(`follows the active terminal title in ${viewMode}`, () => {
    assert.equal(getActiveWindowTitle({ ...state, viewMode }), 'OpenCode - Yira')
    assert.equal(getActiveWindowTitle({
      ...state, viewMode, terminalTitles: { [terminal.id]: 'Codex' },
    }), 'Codex - Yira')
  })
}

test('follows focus changes and the focused split panel', () => {
  assert.equal(getActiveWindowTitle({ ...state, focusedTileId: note.id }), 'Design - Yira')
  assert.equal(getActiveWindowTitle({ ...state, viewMode: 'fullview', fullviewActiveTileId: note.id }), 'Design - Yira')
  assert.equal(getActiveWindowTitle({
    ...state, viewMode: 'splitview', splitViewState: { ...state.splitViewState, focusedPanel: 'right' },
  }), 'Design - Yira')
  assert.equal(getActiveWindowTitle({ ...state, viewMode: 'fullview', fullviewActiveTileId: null }), 'Design - Yira')
})

test('uses manual names for every tile type, including terminals with animated titles', () => {
  for (const type of ['terminal', 'note', 'files', 'browser', 'timer'] as const) {
    assert.equal(getTileWindowTitle({ ...terminal, type, label: ' API ' }, { [terminal.id]: '⠋' }, 'Project'), 'API - Yira')
  }
})

test('uses the workspace for unnamed tiles and symbol-only terminal titles', () => {
  for (const title of ['', '   ', '⠋', '◐', '|', ' / ']) {
    assert.equal(getTileWindowTitle(terminal, { [terminal.id]: title }, 'Project'), 'Project - Yira')
  }
  assert.equal(getTileWindowTitle({ ...note, label: ' ' }, {}, 'Project'), 'Project - Yira')
  assert.equal(getTileWindowTitle(terminal, { [terminal.id]: '⠋ Codex' }, 'Project'), '⠋ Codex - Yira')
})

test('avoids duplicate application names and normalizes title whitespace', () => {
  assert.equal(getTileWindowTitle(null, {}, ''), 'Yira')
  assert.equal(getTileWindowTitle(null, {}, 'yira'), 'Yira')
  assert.equal(getTileWindowTitle(terminal, { [terminal.id]: 'yira' }, 'Project'), 'Yira')
  assert.equal(getTileWindowTitle({ ...note, label: ' A\n B ' }, {}, 'Project'), 'A B - Yira')
})

test('clears stale titles when showing the board, removing a tile, or changing workspace', () => {
  assert.equal(getActiveWindowTitle({ ...state, viewMode: 'board' }), 'Project - Yira')
  assert.equal(getActiveWindowTitle({ ...state, tiles: [] }), 'Project - Yira')
  assert.equal(getActiveWindowTitle({ ...state, tiles: [], activeWorkspaceName: 'Other' }), 'Other - Yira')
  assert.equal(getActiveWindowTitle({ ...state, tiles: [], activeWorkspaceName: '' }), 'Yira')
})

test('follows the agent session shown in the agents view instead of the hidden tiles', () => {
  const agentsViewSession = { tileId: 'agent-1', title: 'Fix login' }
  assert.equal(getActiveWindowTitle({
    ...state, agentsViewSession, terminalTitles: { ...state.terminalTitles, 'agent-1': '✳ Fixing login' },
  }), '✳ Fixing login - Yira')
  assert.equal(getActiveWindowTitle({ ...state, agentsViewSession }), 'Fix login - Yira')
  assert.equal(getActiveWindowTitle({
    ...state, agentsViewSession: { tileId: 'agent-1' }, terminalTitles: { 'agent-1': '⠋' },
  }), 'Project - Yira')
  assert.equal(getActiveWindowTitle({ ...state, agentsViewSession: null }), 'Project - Yira')
})
