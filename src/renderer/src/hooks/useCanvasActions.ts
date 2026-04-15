import { useCallback } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { useSettingsStore } from '@/store/settingsStore'
import { findSelectedGroup, getGroupAnchorTile } from '@/utils/grouping'
import { primeTerminalInitialCommand } from '@/utils/terminalLaunch'
import type { ConfirmDialogOptions } from '@/components/AppDialog'
import { KANBAN_BOARD_FIXED_WIDTH } from '@shared/types'
import type { TileState, ShellProfileId, NoteColor } from '@shared/types'

function generateId(): string {
  return `tile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

interface UseCanvasActionsOptions {
  requestConfirm: (options: ConfirmDialogOptions) => Promise<boolean>
}

export function useCanvasActions({ requestConfirm }: UseCanvasActionsOptions) {
  const activeWorkspaceId = useCanvasStore((s) => s.activeWorkspaceId)
  const browserHomeUrl = useSettingsStore((s) => s.browser.homeUrl)
  const gridSize = useSettingsStore((s) => s.gridSize)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)
  const addTile = useCanvasStore((s) => s.addTile)
  const addTilesToGroup = useCanvasStore((s) => s.addTilesToGroup)
  const removeTile = useCanvasStore((s) => s.removeTile)
  const updateTile = useCanvasStore((s) => s.updateTile)
  const focusTile = useCanvasStore((s) => s.focusTile)
  const selectTiles = useCanvasStore((s) => s.selectTiles)
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const setViewport = useCanvasStore((s) => s.setViewport)

  const snapCoordinate = useCallback(
    (value: number) => (
      snapToGrid
        ? Math.round(value / gridSize) * gridSize
        : value
    ),
    [gridSize, snapToGrid],
  )

  // Compute spawn position: near the focused tile, or cascade from the last tile, or viewport center
  const getSpawnPos = useCallback(
    (w: number, h: number, offset: number) => {
      const state = useCanvasStore.getState()
      const selectedGroup = findSelectedGroup(state.groups, state.selectedTileIds)
      const groupAnchor = selectedGroup
        ? getGroupAnchorTile(selectedGroup, state.tiles, state.focusedTileId)
        : null

      if (groupAnchor) {
        return {
          x: snapCoordinate(groupAnchor.x + groupAnchor.width + offset),
          y: snapCoordinate(groupAnchor.y),
        }
      }

      const focusedTile = state.tiles.find((t) => t.id === state.focusedTileId)
      if (focusedTile) {
        // Spawn to the right of the focused tile
        return {
          x: snapCoordinate(focusedTile.x + focusedTile.width + offset),
          y: snapCoordinate(focusedTile.y),
        }
      }

      // Find the rightmost / bottommost tile and cascade
      let maxX = 0, maxY = 0
      for (const t of state.tiles) {
        maxX = Math.max(maxX, t.x + t.width)
        maxY = Math.max(maxY, t.y + t.height)
      }

      if (state.tiles.length > 0) {
        return {
          x: snapCoordinate(maxX + offset),
          y: snapCoordinate(maxY),
        }
      }

      // No tiles — use viewport center
      const cx = (-state.viewport.tx + 200) / state.viewport.zoom
      const cy = (-state.viewport.ty + 150) / state.viewport.zoom
      return {
        x: snapCoordinate(cx),
        y: snapCoordinate(cy),
      }
    },
    [gridSize, snapCoordinate, snapToGrid],
  )

  const finalizeAddedTile = useCallback(
    (tile: TileState, targetGroupId?: string) => {
      addTile(tile)

      if (targetGroupId) {
        addTilesToGroup(targetGroupId, [tile.id])
      }

      focusTile(tile.id)

      if (targetGroupId) {
        const nextGroup = useCanvasStore.getState().groups.find((group) => group.id === targetGroupId)
        selectTiles(nextGroup?.tileIds ?? [tile.id])
      } else {
        selectTiles([tile.id])
      }

      bringToFront(tile.id)
    },
    [addTile, addTilesToGroup, bringToFront, focusTile, selectTiles],
  )

  const addTerminal = useCallback(
    (profileId: ShellProfileId) => {
      const state = useCanvasStore.getState()
      const targetGroup = findSelectedGroup(state.groups, state.selectedTileIds)
      const pos = getSpawnPos(640, 420, 40)

      const tile: TileState = {
        id: generateId(),
        type: 'terminal',
        x: pos.x,
        y: pos.y,
        width: 640,
        height: 420,
        zIndex: state.nextZIndex,
        shellProfileId: profileId,
        groupId: targetGroup?.id,
      }

      primeTerminalInitialCommand(
        tile.id,
        profileId === 'wsl' ? targetGroup?.terminal?.wslStartupCommand : undefined,
      )

      finalizeAddedTile(tile, targetGroup?.id)
    },
    [finalizeAddedTile, getSpawnPos],
  )

  const addBrowser = useCallback(() => {
    const state = useCanvasStore.getState()
    const targetGroup = findSelectedGroup(state.groups, state.selectedTileIds)
    const pos = getSpawnPos(720, 480, 40)

    const tile: TileState = {
      id: generateId(),
      type: 'browser',
      x: pos.x,
      y: pos.y,
      width: 720,
      height: 480,
      zIndex: state.nextZIndex,
      browserUrl: browserHomeUrl,
      groupId: targetGroup?.id,
    }
    finalizeAddedTile(tile, targetGroup?.id)
  }, [browserHomeUrl, finalizeAddedTile, getSpawnPos])

  const addBoard = useCallback(() => {
    const state = useCanvasStore.getState()
    const targetGroup = findSelectedGroup(state.groups, state.selectedTileIds)
    const pos = getSpawnPos(KANBAN_BOARD_FIXED_WIDTH, 520, 40)

    const tile: TileState = {
      id: generateId(),
      type: 'kanban',
      x: pos.x,
      y: pos.y,
      width: KANBAN_BOARD_FIXED_WIDTH,
      height: 520,
      zIndex: state.nextZIndex,
      groupId: targetGroup?.id,
    }
    finalizeAddedTile(tile, targetGroup?.id)
  }, [finalizeAddedTile, getSpawnPos])

  const addNote = useCallback(
    (color?: NoteColor) => {
      const state = useCanvasStore.getState()
      const targetGroup = findSelectedGroup(state.groups, state.selectedTileIds)
      const pos = getSpawnPos(320, 280, 40)

      const tile: TileState = {
        id: generateId(),
        type: 'note',
        x: pos.x,
        y: pos.y,
        width: 320,
        height: 280,
        zIndex: state.nextZIndex,
        noteColor: color ?? 'yellow',
        noteFont: 'sans',
        noteContent: '',
        groupId: targetGroup?.id,
      }
      finalizeAddedTile(tile, targetGroup?.id)
    },
    [finalizeAddedTile, getSpawnPos],
  )

  const deleteTile = useCallback(
    async (tileId: string): Promise<boolean> => {
      const tile = useCanvasStore.getState().tiles.find((t) => t.id === tileId)
      if (tile?.locked) {
        const confirmed = await requestConfirm({
          title: 'Close locked tile',
          message: `"${tile.label ?? 'This window'}" is locked. Close it anyway?`,
          confirmLabel: 'Close',
          cancelLabel: 'Keep Open',
          danger: true,
        })
        if (!confirmed) return false
      }
      if (tile?.type === 'terminal') window.electron.terminal.destroy(tileId)
      if (tile?.type === 'note') window.electron.note.delete(tileId)
      if (tile?.type === 'kanban' && activeWorkspaceId) window.electron.board.delete(activeWorkspaceId, tileId)
      removeTile(tileId)
      return true
    },
    [activeWorkspaceId, removeTile, requestConfirm],
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
