import { useCallback } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { useSettingsStore } from '@/store/settingsStore'
import { findSelectedGroup, getGroupAnchorTile } from '@/utils/grouping'
import { buildDuplicateTerminalTile, insertDuplicateIntoSplitPanel } from '@/utils/duplicateTerminalTile'
import type { ConfirmDialogOptions } from '@/components/AppDialog'
import { getDefaultTileSize } from '@shared/types'
import type { TileState, ShellProfileId, NoteColor, SplitPanelId } from '@shared/types'

const TILE_TYPE_LABELS: Record<TileState['type'], string> = {
  terminal: 'Terminal',
  note: 'Note',
  browser: 'Browser',
  kanban: 'Board',
  timer: 'Timer',
  files: 'Files',
}

function generateId(): string {
  return `tile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

interface UseCanvasActionsOptions {
  requestConfirm: (options: ConfirmDialogOptions) => Promise<boolean>
}

export function useCanvasActions({ requestConfirm }: UseCanvasActionsOptions) {
  const activeWorkspaceId = useCanvasStore((s) => s.activeWorkspaceId)
  const browserHomeUrl = useSettingsStore((s) => s.browser.homeUrl)
  const tileCreationAvailability = useSettingsStore((s) => s.tiles.creationAvailability)
  const groupsEnabled = useSettingsStore((s) => s.groups.enabled)
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
  const setSplitViewState = useCanvasStore((s) => s.setSplitViewState)

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
      const selectedGroup = groupsEnabled ? findSelectedGroup(state.groups, state.selectedTileIds) : null
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
    [gridSize, groupsEnabled, snapCoordinate, snapToGrid],
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
      const targetGroup = groupsEnabled ? findSelectedGroup(state.groups, state.selectedTileIds) : null
      const size = getDefaultTileSize('terminal')
      const pos = getSpawnPos(size.width, size.height, 40)

      const tile: TileState = {
        id: generateId(),
        type: 'terminal',
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        zIndex: state.nextZIndex,
        shellProfileId: profileId,
        groupId: targetGroup?.id,
      }

      finalizeAddedTile(tile, targetGroup?.id)
    },
    [finalizeAddedTile, getSpawnPos, groupsEnabled],
  )

  const duplicateTerminalTile = useCallback(
    (sourceTileId: string, options: { splitPanel?: SplitPanelId } = {}) => {
      const state = useCanvasStore.getState()
      const source = state.tiles.find((tile) => tile.id === sourceTileId)
      if (!source) return null

      const tile = buildDuplicateTerminalTile({
        source,
        groups: groupsEnabled ? state.groups : [],
        id: generateId(),
        position: {
          x: snapCoordinate(source.x + 40),
          y: snapCoordinate(source.y + 40),
        },
        zIndex: state.nextZIndex,
      })
      if (!tile) return null

      addTile(tile)

      if (tile.groupId) {
        addTilesToGroup(tile.groupId, [tile.id])
      }

      if (options.splitPanel) {
        const nextSplitViewState = insertDuplicateIntoSplitPanel(
          useCanvasStore.getState().splitViewState,
          options.splitPanel,
          tile.id,
        )
        setSplitViewState(nextSplitViewState)
      }

      focusTile(tile.id)
      selectTiles([tile.id])
      bringToFront(tile.id)

      return tile.id
    },
    [addTile, addTilesToGroup, bringToFront, focusTile, groupsEnabled, selectTiles, setSplitViewState, snapCoordinate],
  )

  const addBrowser = useCallback(() => {
    if (!tileCreationAvailability.browser) return

    const state = useCanvasStore.getState()
    const targetGroup = groupsEnabled ? findSelectedGroup(state.groups, state.selectedTileIds) : null
    const size = getDefaultTileSize('browser')
    const pos = getSpawnPos(size.width, size.height, 40)

    const tile: TileState = {
      id: generateId(),
      type: 'browser',
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
      zIndex: state.nextZIndex,
      browserUrl: browserHomeUrl,
      groupId: targetGroup?.id,
    }
    finalizeAddedTile(tile, targetGroup?.id)
  }, [browserHomeUrl, finalizeAddedTile, getSpawnPos, groupsEnabled, tileCreationAvailability.browser])

  const addBoard = useCallback(() => {
    return
  }, [])

  const addNote = useCallback(
    (color?: NoteColor) => {
      if (!tileCreationAvailability.note) return

      const state = useCanvasStore.getState()
      const targetGroup = groupsEnabled ? findSelectedGroup(state.groups, state.selectedTileIds) : null
      const size = getDefaultTileSize('note')
      const pos = getSpawnPos(size.width, size.height, 40)

      const tile: TileState = {
        id: generateId(),
        type: 'note',
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        zIndex: state.nextZIndex,
        noteColor: color ?? 'yellow',
        noteFont: 'sans',
        noteContent: '',
        groupId: targetGroup?.id,
      }
      finalizeAddedTile(tile, targetGroup?.id)
    },
    [finalizeAddedTile, getSpawnPos, groupsEnabled, tileCreationAvailability.note],
  )

  const addTimer = useCallback(() => {
    if (!tileCreationAvailability.timer) return

    const state = useCanvasStore.getState()
    const targetGroup = groupsEnabled ? findSelectedGroup(state.groups, state.selectedTileIds) : null
    const size = getDefaultTileSize('timer')
    const pos = getSpawnPos(size.width, size.height, 40)
    const defaultDurationMs = 25 * 60 * 1000

    const tile: TileState = {
      id: generateId(),
      type: 'timer',
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
      zIndex: state.nextZIndex,
      timerDurationMs: defaultDurationMs,
      timerRemainingMs: defaultDurationMs,
      timerStatus: 'idle',
      groupId: targetGroup?.id,
    }
    finalizeAddedTile(tile, targetGroup?.id)
  }, [finalizeAddedTile, getSpawnPos, groupsEnabled, tileCreationAvailability.timer])

  const addFiles = useCallback(() => {
    if (!tileCreationAvailability.files) return

    const state = useCanvasStore.getState()
    if (!state.activeWorkspaceConfig.rootFolderPath) return
    const targetGroup = groupsEnabled ? findSelectedGroup(state.groups, state.selectedTileIds) : null
    const size = getDefaultTileSize('files')
    const pos = getSpawnPos(size.width, size.height, 40)

    const tile: TileState = {
      id: generateId(),
      type: 'files',
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
      zIndex: state.nextZIndex,
      groupId: targetGroup?.id,
    }
    finalizeAddedTile(tile, targetGroup?.id)
  }, [finalizeAddedTile, getSpawnPos, groupsEnabled, tileCreationAvailability.files])

  const deleteTile = useCallback(
    async (tileId: string): Promise<boolean> => {
      const tile = useCanvasStore.getState().tiles.find((t) => t.id === tileId)
      if (!tile) return false

      const label = tile.label?.trim() || TILE_TYPE_LABELS[tile.type]
      const confirmed = await requestConfirm({
        title: 'Close tile',
        message: `Close "${label}"? Any running session or unsaved surface state may be lost.`,
        confirmLabel: 'Close',
        cancelLabel: 'Keep Open',
        danger: true,
      })
      if (!confirmed) return false

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
    duplicateTerminalTile,
    addBrowser,
    addBoard,
    addNote,
    addTimer,
    addFiles,
    deleteTile,
    resetZoom,
    focusTile,
    bringToFront,
    updateTile,
    removeTile,
    setViewport,
  }
}
