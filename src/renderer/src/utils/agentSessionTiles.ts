import { removeTileFromGridLayout } from '@shared/gridWorkspaceState'
import type {
  AgentActiveSession,
  CanvasState,
  GridWorkspaceState,
  SplitViewState,
  TileState,
} from '@shared/types'

export interface TileGeometry {
  x: number
  y: number
  width: number
  height: number
}

// Session tiles are not persisted, so their last on-canvas geometry is kept for this run only.
const agentSessionTileGeometry = new Map<string, TileGeometry>()

/** A terminal tile that only mirrors a temporary Agents View session. */
export function isAgentSessionTile(tile: Pick<TileState, 'type' | 'agent'>): boolean {
  return tile.type === 'terminal' && tile.agent?.surface === 'agents-view'
}

/** Builds the ephemeral tile that renders one Agents View session inside a normal view. */
export function createAgentSessionTile(
  session: AgentActiveSession,
  geometry: TileGeometry,
  zIndex: number,
): TileState {
  return {
    id: session.tileId,
    type: 'terminal',
    ...geometry,
    zIndex,
    agent: {
      provider: session.provider,
      sessionId: session.sessionId,
      surface: 'agents-view',
    },
  }
}

/** Compares the current tiles with the workspace sessions to add missing tiles and drop stale ones. */
export function planAgentSessionTileSync(
  tiles: readonly TileState[],
  sessions: readonly AgentActiveSession[],
): { add: AgentActiveSession[]; removeTileIds: string[] } {
  const tileIds = new Set(tiles.map((tile) => tile.id))
  const sessionTileIds = new Set(sessions.map((session) => session.tileId))

  return {
    add: sessions.filter((session) => !tileIds.has(session.tileId)),
    removeTileIds: tiles
      .filter((tile) => isAgentSessionTile(tile) && !sessionTileIds.has(tile.id))
      .map((tile) => tile.id),
  }
}

interface AgentSessionTileRemoval {
  tiles: TileState[]
  focusedTileId: string | null
  fullviewActiveTileId: string | null
  splitViewState?: SplitViewState
  removedTileIds: string[]
}

/** Removes session tiles and every focus reference to them, shared by canvas and grid states. */
function stripAgentSessionTilesFromViewState(
  state: Pick<CanvasState, 'tiles' | 'focusedTileId' | 'fullviewActiveTileId' | 'splitViewState'>,
): AgentSessionTileRemoval | null {
  const removedTileIds = state.tiles
    .filter(isAgentSessionTile)
    .map((tile) => tile.id)
  if (removedTileIds.length === 0) return null

  const removedIds = new Set(removedTileIds)
  const withoutRemoved = (tileIds: readonly string[]): string[] =>
    tileIds.filter((tileId) => !removedIds.has(tileId))
  const nextActiveTileId = (activeTileId: string | null, panelTileIds: readonly string[]): string | null =>
    activeTileId !== null && removedIds.has(activeTileId)
      ? panelTileIds[0] ?? null
      : activeTileId

  let splitViewState = state.splitViewState
  if (splitViewState) {
    const leftTileIds = withoutRemoved(splitViewState.leftTileIds)
    const rightTileIds = withoutRemoved(splitViewState.rightTileIds)
    splitViewState = {
      ...splitViewState,
      leftTileIds,
      rightTileIds,
      activeLeftTileId: nextActiveTileId(splitViewState.activeLeftTileId, leftTileIds),
      activeRightTileId: nextActiveTileId(splitViewState.activeRightTileId, rightTileIds),
    }
  }

  return {
    tiles: state.tiles.filter((tile) => !removedIds.has(tile.id)),
    focusedTileId: state.focusedTileId !== null && removedIds.has(state.focusedTileId)
      ? null
      : state.focusedTileId,
    fullviewActiveTileId: state.fullviewActiveTileId !== null && removedIds.has(state.fullviewActiveTileId)
      ? null
      : state.fullviewActiveTileId,
    splitViewState,
    removedTileIds,
  }
}

/** Drops session tiles from a persisted canvas state, including split and focus references. */
export function stripAgentSessionTilesFromCanvasState(state: CanvasState): CanvasState {
  const stripped = stripAgentSessionTilesFromViewState(state)
  if (!stripped) return state

  return {
    ...state,
    tiles: stripped.tiles,
    focusedTileId: stripped.focusedTileId,
    fullviewActiveTileId: stripped.fullviewActiveTileId,
    ...(stripped.splitViewState ? { splitViewState: stripped.splitViewState } : {}),
  }
}

/** Drops session tiles from a persisted grid state, including their grid layout leaves. */
export function stripAgentSessionTilesFromGridState(state: GridWorkspaceState): GridWorkspaceState {
  const stripped = stripAgentSessionTilesFromViewState(state)
  if (!stripped) return state

  let rootNode = state.gridViewState.rootNode
  for (const tileId of stripped.removedTileIds) {
    rootNode = removeTileFromGridLayout(rootNode, tileId)
  }

  return {
    ...state,
    tiles: stripped.tiles,
    focusedTileId: stripped.focusedTileId,
    fullviewActiveTileId: stripped.fullviewActiveTileId,
    ...(stripped.splitViewState ? { splitViewState: stripped.splitViewState } : {}),
    gridViewState: { rootNode },
  }
}

/** Remembers where a session tile sat so it can return to the same spot in this run. */
export function rememberAgentSessionTileGeometry(tile: TileState): void {
  if (!isAgentSessionTile(tile)) return

  agentSessionTileGeometry.set(tile.id, {
    x: tile.x,
    y: tile.y,
    width: tile.width,
    height: tile.height,
  })
}

/** Returns a copy of the remembered geometry for a session tile. */
export function recallAgentSessionTileGeometry(tileId: string): TileGeometry | undefined {
  const geometry = agentSessionTileGeometry.get(tileId)
  return geometry ? { ...geometry } : undefined
}
