import { useEffect, useRef } from 'react'
import { getDefaultTileSize, type AgentActiveSession } from '@shared/types'
import { useCanvasStore } from '@/store/canvasStore'
import {
  createAgentSessionTile,
  isAgentSessionTile,
  planAgentSessionTileSync,
  recallAgentSessionTileGeometry,
  rememberAgentSessionTileGeometry,
} from '@/utils/agentSessionTiles'

interface UseAgentSessionTilesOptions {
  workspaceId: string
  /** Sessions of the active workspace shown as temporary tiles (surface 'agents-view'). */
  sessions: readonly AgentActiveSession[]
  /** Canvas position for a new tile of this size. */
  placeTile: (width: number, height: number) => { x: number; y: number }
}

/** Keeps ephemeral Agents View session tiles in sync with the active workspace. */
export function useAgentSessionTiles(options: UseAgentSessionTilesOptions): void {
  const { workspaceId, sessions, placeTile } = options
  const tiles = useCanvasStore((state) => state.tiles)
  const activeWorkspaceId = useCanvasStore((state) => state.activeWorkspaceId)
  const placeTileRef = useRef(placeTile)

  // placeTile may be recreated on every render; only its latest value should be used.
  useEffect(() => {
    placeTileRef.current = placeTile
  }, [placeTile])

  useEffect(() => {
    for (const tile of tiles) {
      if (isAgentSessionTile(tile)) rememberAgentSessionTileGeometry(tile)
    }
  }, [tiles])

  useEffect(() => {
    if (!workspaceId || activeWorkspaceId !== workspaceId) return

    const plan = planAgentSessionTileSync(tiles, sessions)
    for (const tileId of plan.removeTileIds) {
      useCanvasStore.getState().removeTile(tileId)
    }

    for (const session of plan.add) {
      const rememberedGeometry = recallAgentSessionTileGeometry(session.tileId)
      const size = getDefaultTileSize('terminal')
      const geometry = rememberedGeometry ?? {
        ...placeTileRef.current(size.width, size.height),
        width: size.width,
        height: size.height,
      }
      // addTile increments nextZIndex, so read it again for every tile.
      const { nextZIndex } = useCanvasStore.getState()
      useCanvasStore.getState().addTile(createAgentSessionTile(session, geometry, nextZIndex))
    }
  }, [tiles, sessions, workspaceId, activeWorkspaceId])
}
