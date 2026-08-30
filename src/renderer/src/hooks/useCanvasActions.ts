import { useCallback } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { useSettingsStore } from '@/store/settingsStore'
import { findSelectedGroup, getGroupAnchorTile } from '@/utils/grouping'
import { buildDuplicateTerminalTile, insertDuplicateIntoSplitPanel } from '@/utils/duplicateTerminalTile'
import { getBrowserTileUrl } from '@/utils/browserUrl'
import type { ConfirmDialogOptions } from '@/components/AppDialog'
import { GRID_MAX_TILES, getDefaultTileSize } from '@shared/types'
import type { TileState, ShellProfileId, NoteColor, NoteKind, SplitPanelId, TerminalAgentMetadata } from '@shared/types'

const TILE_TYPE_LABELS: Record<TileState['type'], string> = {
  terminal: 'Terminal',
  note: 'Note',
  browser: 'Browser',
  timer: 'Timer',
  files: 'File',
}

function generateId(): string {
  return `tile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

interface UseCanvasActionsOptions {
  requestConfirm: (options: ConfirmDialogOptions) => Promise<boolean>
}

export function useCanvasActions({ requestConfirm }: UseCanvasActionsOptions) {
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

  const canAddTileToActiveWorkspace = useCallback(() => {
    const state = useCanvasStore.getState()
    if (state.activeWorkspaceConfig.type !== 'grid') return true
    if (state.tiles.length < GRID_MAX_TILES) return true

    void requestConfirm({
      title: 'Grid is full',
      message: `Grid workspaces can contain at most ${GRID_MAX_TILES} tiles.`,
      confirmLabel: 'OK',
      hideCancel: true,
    })
    return false
  }, [requestConfirm])

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
      if (!canAddTileToActiveWorkspace()) return false

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
      return true
    },
    [addTile, addTilesToGroup, bringToFront, focusTile, selectTiles, canAddTileToActiveWorkspace],
  )

  const addTerminal = useCallback(
    (profileId: ShellProfileId, agent?: TerminalAgentMetadata) => {
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
        ...(agent ? { agent } : {}),
        groupId: targetGroup?.id,
      }

      if (!finalizeAddedTile(tile, targetGroup?.id)) return null
      return tile.id
    },
    [finalizeAddedTile, getSpawnPos, groupsEnabled],
  )

  const addRemoteTerminal = useCallback(() => {
    const state = useCanvasStore.getState()
    const targetGroup = groupsEnabled ? findSelectedGroup(state.groups, state.selectedTileIds) : null
    const size = getDefaultTileSize('terminal')
    const pos = getSpawnPos(size.width, size.height, 40)

    finalizeAddedTile({
      id: generateId(),
      type: 'terminal',
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
      zIndex: state.nextZIndex,
      shellProfileId: 'bash',
      terminalConnection: 'remote-ssh',
      groupId: targetGroup?.id,
    }, targetGroup?.id)
  }, [finalizeAddedTile, getSpawnPos, groupsEnabled])

  const duplicateTerminalTile = useCallback(
    (sourceTileId: string, options: { splitPanel?: SplitPanelId } = {}) => {
      if (!canAddTileToActiveWorkspace()) return null

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
    [addTile, addTilesToGroup, bringToFront, focusTile, groupsEnabled, selectTiles, setSplitViewState, snapCoordinate, canAddTileToActiveWorkspace],
  )

  const addBrowser = useCallback((url?: string) => {
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
      browserUrl: getBrowserTileUrl(url, browserHomeUrl),
      groupId: targetGroup?.id,
    }
    finalizeAddedTile(tile, targetGroup?.id)
  }, [browserHomeUrl, finalizeAddedTile, getSpawnPos, groupsEnabled, tileCreationAvailability.browser])

  const addNote = useCallback(
    (kind: NoteKind, color?: NoteColor) => {
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
        noteKind: kind,
        ...(kind === 'markdown' ? { markdown: '', markdownView: 'live' as const } : {}),
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

  const deleteTile = useCallback(
    async (tileId: string): Promise<boolean> => {
      const tile = useCanvasStore.getState().tiles.find((t) => t.id === tileId)
      if (!tile) return false

      const label = tile.label?.trim() || TILE_TYPE_LABELS[tile.type]
      const workspaceId = useCanvasStore.getState().activeWorkspaceId
      const confirmed = await requestConfirm({
        title: 'Close tile',
        message: `Close "${label}"? Any running session or unsaved surface state may be lost.`,
        confirmLabel: 'Close',
        cancelLabel: 'Keep Open',
        danger: true,
      })
      if (!confirmed) return false

      if (tile.type === 'terminal' && workspaceId) {
        void window.electron.terminal.destroyCurrent({ workspaceId, tileId })
      }
      if (tile?.type === 'note') window.electron.note.delete(tileId)
      removeTile(tileId)
      return true
    },
    [removeTile, requestConfirm],
  )

  const resetZoom = useCallback(() => {
    setViewport({ tx: 0, ty: 0, zoom: 1 })
  }, [setViewport])

  return {
    addTerminal,
    addRemoteTerminal,
    duplicateTerminalTile,
    addBrowser,
    addNote,
    addTimer,
    deleteTile,
    resetZoom,
    focusTile,
    bringToFront,
    updateTile,
    removeTile,
    setViewport,
  }
}
