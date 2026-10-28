import assert from 'node:assert/strict'
import type { AgentActiveSession, CanvasState, GridWorkspaceState, TileState } from '@shared/types'
import {
  createAgentSessionTile,
  isAgentSessionTile,
  planAgentSessionTileSync,
  recallAgentSessionTileGeometry,
  rememberAgentSessionTileGeometry,
  stripAgentSessionTilesFromCanvasState,
  stripAgentSessionTilesFromGridState,
} from './agentSessionTiles'

function session(overrides: Partial<AgentActiveSession> = {}): AgentActiveSession {
  return {
    sessionId: 'session-a',
    tileId: 'agent-a',
    workspaceId: 'workspace-a',
    provider: 'claude',
    status: 'working',
    startedAt: '2026-01-01T00:00:00.000Z',
    lastActivityAt: '2026-01-01T00:00:00.000Z',
    surface: 'agents-view',
    ...overrides,
  }
}

function tile(overrides: Partial<TileState> = {}): TileState {
  return {
    id: 'terminal-1',
    type: 'terminal',
    x: 0,
    y: 0,
    width: 900,
    height: 400,
    zIndex: 1,
    ...overrides,
  }
}

function sessionTile(id: string, overrides: Partial<TileState> = {}): TileState {
  return tile({
    id,
    agent: { provider: 'claude', sessionId: `session-${id}`, surface: 'agents-view' },
    ...overrides,
  })
}

function canvasState(overrides: Partial<CanvasState> = {}): CanvasState {
  return {
    tiles: [],
    viewport: { tx: 0, ty: 0, zoom: 1 },
    nextZIndex: 10,
    focusedTileId: null,
    viewMode: 'canvas',
    fullviewActiveTileId: null,
    ...overrides,
  }
}

function gridState(overrides: Partial<GridWorkspaceState> = {}): GridWorkspaceState {
  return {
    tiles: [],
    nextZIndex: 10,
    focusedTileId: null,
    fullviewActiveTileId: null,
    viewMode: 'gridview',
    gridViewState: { rootNode: null },
    ...overrides,
  }
}

assert.equal(isAgentSessionTile(sessionTile('agent-a')), true, 'agents-view terminal tiles are session tiles')
assert.equal(
  isAgentSessionTile(tile({ id: 'agent-b', agent: { provider: 'codex', surface: 'tile' } })),
  false,
  'terminal tiles bound to the canvas surface are not session tiles',
)
assert.equal(isAgentSessionTile(tile({ id: 'terminal-2' })), false, 'plain terminal tiles are not session tiles')
assert.equal(
  isAgentSessionTile(tile({ id: 'note-1', type: 'note', agent: { provider: 'claude', surface: 'agents-view' } })),
  false,
  'only terminal tiles can be session tiles',
)

const createdTile = createAgentSessionTile(
  session({ tileId: 'agent-created', sessionId: 'session-created' }),
  { x: 40, y: 60, width: 900, height: 400 },
  7,
)
assert.deepEqual(createdTile, {
  id: 'agent-created',
  type: 'terminal',
  x: 40,
  y: 60,
  width: 900,
  height: 400,
  zIndex: 7,
  agent: { provider: 'claude', sessionId: 'session-created', surface: 'agents-view' },
})

const emptyPlan = planAgentSessionTileSync(
  [],
  [session({ tileId: 'agent-a' }), session({ tileId: 'agent-b' })],
)
assert.deepEqual(emptyPlan.add.map((entry) => entry.tileId), ['agent-a', 'agent-b'], 'missing sessions are added in order')
assert.deepEqual(emptyPlan.removeTileIds, [], 'an empty tile list has nothing to remove')

const occupiedIdPlan = planAgentSessionTileSync(
  [tile({ id: 'agent-a' }), sessionTile('agent-b')],
  [session({ tileId: 'agent-a' }), session({ tileId: 'agent-b' })],
)
assert.deepEqual(occupiedIdPlan.add, [], 'a normal tile with the session tile id already occupies the id')
assert.deepEqual(occupiedIdPlan.removeTileIds, [], 'session tiles backed by a live session are kept')

const orphanPlan = planAgentSessionTileSync(
  [tile({ id: 'terminal-1' }), sessionTile('agent-a'), sessionTile('agent-orphan')],
  [session({ tileId: 'agent-a' })],
)
assert.deepEqual(orphanPlan.add, [], 'live sessions with their tile present are not added again')
assert.deepEqual(orphanPlan.removeTileIds, ['agent-orphan'], 'session tiles without a live session are removed')

const plainTilePlan = planAgentSessionTileSync([tile({ id: 'terminal-1' })], [])
assert.deepEqual(plainTilePlan.removeTileIds, [], 'normal tiles are never removed by the sync plan')

const canvasWithSessions = canvasState({
  tiles: [sessionTile('agent-a'), tile({ id: 'terminal-1' }), sessionTile('agent-b'), sessionTile('agent-c')],
  nextZIndex: 12,
  focusedTileId: 'agent-a',
  fullviewActiveTileId: 'agent-b',
  splitViewState: {
    leftTileIds: ['agent-a', 'terminal-1', 'agent-b'],
    rightTileIds: ['agent-c'],
    activeLeftTileId: 'agent-a',
    activeRightTileId: 'agent-c',
    focusedPanel: 'right',
    orientation: 'vertical',
  },
})
const strippedCanvas = stripAgentSessionTilesFromCanvasState(canvasWithSessions)
assert.deepEqual(strippedCanvas.tiles.map((entry) => entry.id), ['terminal-1'], 'canvas keeps only normal tiles')
assert.equal(strippedCanvas.focusedTileId, null, 'focused session tile clears focus')
assert.equal(strippedCanvas.fullviewActiveTileId, null, 'fullview session tile clears the active tile')
assert.deepEqual(strippedCanvas.splitViewState, {
  leftTileIds: ['terminal-1'],
  rightTileIds: [],
  activeLeftTileId: 'terminal-1',
  activeRightTileId: null,
  focusedPanel: 'right',
  orientation: 'vertical',
}, 'split panels drop session tiles and activate their next tile')
assert.equal(canvasWithSessions.tiles.length, 4, 'canvas stripping does not mutate the input tiles')
assert.equal(canvasWithSessions.splitViewState?.leftTileIds.length, 3, 'canvas stripping does not mutate the split state')

const canvasWithoutSessions = canvasState({ tiles: [tile({ id: 'terminal-1' })] })
assert.equal(
  stripAgentSessionTilesFromCanvasState(canvasWithoutSessions),
  canvasWithoutSessions,
  'canvas stripping returns the same object when no session tiles exist',
)

const gridWithSession = gridState({
  tiles: [sessionTile('agent-a'), tile({ id: 'terminal-1' })],
  focusedTileId: 'agent-a',
  fullviewActiveTileId: 'agent-a',
  gridViewState: {
    rootNode: {
      id: 'split-1',
      type: 'split',
      direction: 'row',
      children: [
        { id: 'leaf-agent', type: 'leaf', tileId: 'agent-a' },
        { id: 'leaf-terminal', type: 'leaf', tileId: 'terminal-1' },
      ],
      sizes: [10, 10],
    },
  },
})
const strippedGrid = stripAgentSessionTilesFromGridState(gridWithSession)
assert.deepEqual(strippedGrid.tiles.map((entry) => entry.id), ['terminal-1'], 'grid keeps only normal tiles')
assert.equal(strippedGrid.focusedTileId, null, 'grid focus on a session tile clears')
assert.equal(strippedGrid.fullviewActiveTileId, null, 'grid fullview on a session tile clears')
assert.deepEqual(
  strippedGrid.gridViewState.rootNode,
  { id: 'leaf-terminal', type: 'leaf', tileId: 'terminal-1' },
  'grid layout drops the session leaf and keeps the normal one',
)
assert.equal(gridWithSession.gridViewState.rootNode?.type, 'split', 'grid stripping does not mutate the input layout')

const gridWithoutSessions = gridState({
  tiles: [tile({ id: 'terminal-1' })],
  gridViewState: { rootNode: { id: 'leaf-terminal', type: 'leaf', tileId: 'terminal-1' } },
})
assert.equal(
  stripAgentSessionTilesFromGridState(gridWithoutSessions),
  gridWithoutSessions,
  'grid stripping returns the same object when no session tiles exist',
)

rememberAgentSessionTileGeometry(sessionTile('agent-cached', { x: 40, y: 60, width: 900, height: 400 }))
assert.deepEqual(
  recallAgentSessionTileGeometry('agent-cached'),
  { x: 40, y: 60, width: 900, height: 400 },
  'remembered session geometry is recalled',
)
assert.equal(recallAgentSessionTileGeometry('agent-missing'), undefined, 'unknown session tiles have no geometry')

rememberAgentSessionTileGeometry(tile({ id: 'terminal-cached', x: 1, y: 2, width: 900, height: 400 }))
assert.equal(
  recallAgentSessionTileGeometry('terminal-cached'),
  undefined,
  'normal tiles are not stored in the session geometry cache',
)
