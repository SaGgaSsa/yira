import { useCallback } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { useSettingsStore } from '@/store/settingsStore'
import { KANBAN_BOARD_FIXED_WIDTH } from '@shared/types'
import type { TileState, ShellProfileId, NoteColor } from '@shared/types'

function generateId(): string {
  return `tile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function useCanvasActions() {
  const tiles = useCanvasStore((s) => s.tiles)
  const viewport = useCanvasStore((s) => s.viewport)
  const nextZIndex = useCanvasStore((s) => s.nextZIndex)
  const activeWorkspaceId = useCanvasStore((s) => s.activeWorkspaceId)
  const browserHomeUrl = useSettingsStore((s) => s.browser.homeUrl)
  const gridSize = useSettingsStore((s) => s.gridSize)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)
  const addTile = useCanvasStore((s) => s.addTile)
  const removeTile = useCanvasStore((s) => s.removeTile)
  const updateTile = useCanvasStore((s) => s.updateTile)
  const focusTile = useCanvasStore((s) => s.focusTile)
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const setViewport = useCanvasStore((s) => s.setViewport)

  // Compute spawn position: near the focused tile, or cascade from the last tile, or viewport center
  const getSpawnPos = useCallback(
    (w: number, h: number, offset: number) => {
      const focusedTile = tiles.find((t) => t.id === useCanvasStore.getState().focusedTileId)
      if (focusedTile) {
        // Spawn to the right of the focused tile
        return {
          x: snapToGrid ? Math.round((focusedTile.x + focusedTile.width + offset) / gridSize) * gridSize : focusedTile.x + focusedTile.width + offset,
          y: snapToGrid ? Math.round(focusedTile.y / gridSize) * gridSize : focusedTile.y,
        }
      }

      // Find the rightmost / bottommost tile and cascade
      let maxX = 0, maxY = 0
      for (const t of tiles) {
        maxX = Math.max(maxX, t.x + t.width)
        maxY = Math.max(maxY, t.y + t.height)
      }

      if (tiles.length > 0) {
        return {
          x: snapToGrid ? Math.round((maxX + offset) / gridSize) * gridSize : maxX + offset,
          y: snapToGrid ? Math.round(maxY / gridSize) * gridSize : maxY,
        }
      }

      // No tiles — use viewport center
      const cx = (-viewport.tx + 200) / viewport.zoom
      const cy = (-viewport.ty + 150) / viewport.zoom
      return {
        x: snapToGrid ? Math.round(cx / gridSize) * gridSize : cx,
        y: snapToGrid ? Math.round(cy / gridSize) * gridSize : cy,
      }
    },
    [gridSize, snapToGrid, tiles, viewport],
  )

  const addTerminal = useCallback(
    (profileId: ShellProfileId) => {
      const pos = getSpawnPos(640, 420, 40)

      const tile: TileState = {
        id: generateId(),
        type: 'terminal',
        x: pos.x,
        y: pos.y,
        width: 640,
        height: 420,
        zIndex: nextZIndex,
        shellProfileId: profileId,
      }
      addTile(tile)
      focusTile(tile.id)
      bringToFront(tile.id)
    },
    [getSpawnPos, nextZIndex, addTile, focusTile, bringToFront],
  )

  const addBrowser = useCallback(() => {
    const pos = getSpawnPos(720, 480, 40)

    const tile: TileState = {
      id: generateId(),
      type: 'browser',
      x: pos.x,
      y: pos.y,
      width: 720,
      height: 480,
      zIndex: nextZIndex,
      browserUrl: browserHomeUrl,
    }
    addTile(tile)
    focusTile(tile.id)
    bringToFront(tile.id)
  }, [browserHomeUrl, getSpawnPos, nextZIndex, addTile, focusTile, bringToFront])

  const addBoard = useCallback(() => {
    const pos = getSpawnPos(KANBAN_BOARD_FIXED_WIDTH, 520, 40)

    const tile: TileState = {
      id: generateId(),
      type: 'kanban',
      x: pos.x,
      y: pos.y,
      width: KANBAN_BOARD_FIXED_WIDTH,
      height: 520,
      zIndex: nextZIndex,
    }
    addTile(tile)
    focusTile(tile.id)
    bringToFront(tile.id)
  }, [getSpawnPos, nextZIndex, addTile, focusTile, bringToFront])

  const addNote = useCallback(
    (color?: NoteColor) => {
      const pos = getSpawnPos(320, 280, 40)

      const tile: TileState = {
        id: generateId(),
        type: 'note',
        x: pos.x,
        y: pos.y,
        width: 320,
        height: 280,
        zIndex: nextZIndex,
        noteColor: color ?? 'yellow',
        noteFont: 'sans',
        noteContent: '',
      }
      addTile(tile)
      focusTile(tile.id)
      bringToFront(tile.id)
    },
    [getSpawnPos, nextZIndex, addTile, focusTile, bringToFront],
  )

  const deleteTile = useCallback(
    (tileId: string) => {
      const tile = useCanvasStore.getState().tiles.find((t) => t.id === tileId)
      if (tile?.type === 'terminal') window.electron.terminal.destroy(tileId)
      if (tile?.type === 'note') window.electron.note.delete(tileId)
      if (tile?.type === 'kanban' && activeWorkspaceId) window.electron.board.delete(activeWorkspaceId, tileId)
      removeTile(tileId)
    },
    [activeWorkspaceId, removeTile],
  )

  const resetZoom = useCallback(() => {
    setViewport({ tx: 0, ty: 0, zoom: 1 })
  }, [setViewport])

  return {
    addTerminal,
    addBrowser,
    addBoard,
    addNote,
    deleteTile,
    resetZoom,
    focusTile,
    bringToFront,
    updateTile,
    removeTile,
    setViewport,
  }
}
