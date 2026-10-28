import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useCanvasStore } from '@/store/canvasStore'
import { useSettingsStore } from '@/store/settingsStore'
import { buildDuplicateTerminalTile, insertDuplicateIntoSplitPanel } from '@/utils/duplicateTerminalTile'
import { getBrowserTileUrl } from '@/utils/browserUrl'
import { findFreeCanvasPosition } from '@/utils/canvasPlacement'
import type { ConfirmDialogOptions } from '@/components/AppDialog'
import { GRID_MAX_TILES, getDefaultTileSize } from '@shared/types'
import { getAttachedTiles } from '@shared/floatingTiles'
import type { TileState, ShellProfileId, NoteColor, NoteKind, SplitPanelId, TerminalAgentMetadata } from '@shared/types'
import type { TerminalSessionTarget } from '@shared/terminalSessionIdentity'

function generateId(): string {
  return `tile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

interface UseCanvasActionsOptions {
  requestConfirm: (options: ConfirmDialogOptions) => Promise<boolean>
  destroyTerminalRuntime: (target: TerminalSessionTarget) => Promise<void>
}

interface RemoveTileAfterTerminalRuntimeCleanupOptions {
  tile: Pick<TileState, 'id' | 'type'>
  workspaceId: string | null | undefined
  destroyTerminalRuntime: (target: TerminalSessionTarget) => Promise<void>
  removeTile: (tileId: string) => void
}

export async function removeTileAfterTerminalRuntimeCleanup({
  tile,
  workspaceId,
  destroyTerminalRuntime,
  removeTile,
}: RemoveTileAfterTerminalRuntimeCleanupOptions): Promise<void> {
  if (tile.type === 'terminal' && workspaceId) {
    await destroyTerminalRuntime({ workspaceId, tileId: tile.id })
  }
  removeTile(tile.id)
}

export function useCanvasActions({ requestConfirm, destroyTerminalRuntime }: UseCanvasActionsOptions) {
  const { t } = useTranslation()
  const browserHomeUrl = useSettingsStore((s) => s.browser.homeUrl)
  const tileCreationAvailability = useSettingsStore((s) => s.tiles.creationAvailability)
  const gridSize = useSettingsStore((s) => s.gridSize)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)
  const addTile = useCanvasStore((s) => s.addTile)
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
      title: t('ui.gridFull'),
      message: t('ui.gridFullMessage', { count: GRID_MAX_TILES }),
      confirmLabel: t('common.confirm'),
      hideCancel: true,
    })
    return false
  }, [requestConfirm, t])

  const snapCoordinate = useCallback(
    (value: number) => (
      snapToGrid
        ? Math.round(value / gridSize) * gridSize
        : value
    ),
    [gridSize, snapToGrid],
  )

  // Compute spawn position: near the focused tile, or cascade from the last tile, or viewport center,
  // then move it to the closest free spot so a new tile never lands on an existing one
  const getSpawnPos = useCallback(
    (w: number, h: number, offset: number) => {
      const state = useCanvasStore.getState()
      const focusedTile = state.tiles.find((t) => t.id === state.focusedTileId)
      let preferred: { x: number; y: number }

      if (focusedTile) {
        // Spawn to the right of the focused tile
        preferred = {
          x: snapCoordinate(focusedTile.x + focusedTile.width + offset),
          y: snapCoordinate(focusedTile.y),
        }
      } else {
        // Find the rightmost / bottommost tile and cascade
        let maxX = 0, maxY = 0
        for (const t of state.tiles) {
          maxX = Math.max(maxX, t.x + t.width)
          maxY = Math.max(maxY, t.y + t.height)
        }

        if (state.tiles.length > 0) {
          preferred = {
            x: snapCoordinate(maxX + offset),
            y: snapCoordinate(maxY),
          }
        } else {
          // No tiles — use viewport center
          const cx = (-state.viewport.tx + 200) / state.viewport.zoom
          const cy = (-state.viewport.ty + 150) / state.viewport.zoom
          preferred = {
            x: snapCoordinate(cx),
            y: snapCoordinate(cy),
          }
        }
      }

      // Floating tiles live in their own windows, so they do not block the canvas
      const attachedTiles = getAttachedTiles(state.tiles)
      if (attachedTiles.length === 0) return preferred

      const freePosition = findFreeCanvasPosition({
        occupied: attachedTiles,
        width: w,
        height: h,
        preferred,
        gap: offset,
      })

      return {
        x: snapCoordinate(freePosition.x),
        y: snapCoordinate(freePosition.y),
      }
    },
    [snapCoordinate],
  )

  const getSpawnPosition = useCallback(
    (width: number, height: number) => getSpawnPos(width, height, 40),
    [getSpawnPos],
  )

  const finalizeAddedTile = useCallback(
    (tile: TileState) => {
      if (!canAddTileToActiveWorkspace()) return false

      addTile(tile)
      focusTile(tile.id)
      selectTiles([tile.id])
      bringToFront(tile.id)
      return true
    },
    [addTile, bringToFront, focusTile, selectTiles, canAddTileToActiveWorkspace],
  )

  const addTerminal = useCallback(
    (profileId: ShellProfileId, agent?: TerminalAgentMetadata, options: { id?: string } = {}) => {
      const state = useCanvasStore.getState()
      const size = getDefaultTileSize('terminal')
      const pos = getSpawnPos(size.width, size.height, 40)

      const tile: TileState = {
        id: options.id ?? generateId(),
        type: 'terminal',
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        zIndex: state.nextZIndex,
        shellProfileId: profileId,
        ...(agent ? { agent } : {}),
      }

      if (!finalizeAddedTile(tile)) return null
      return tile.id
    },
    [finalizeAddedTile, getSpawnPos],
  )

  const addRemoteTerminal = useCallback(() => {
    const state = useCanvasStore.getState()
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
      shellProfileId: 'bash',
      terminalConnection: 'remote-ssh',
    }
    return finalizeAddedTile(tile) ? tile.id : null
  }, [finalizeAddedTile, getSpawnPos])

  const duplicateTerminalTile = useCallback(
    (sourceTileId: string, options: { splitPanel?: SplitPanelId } = {}) => {
      if (!canAddTileToActiveWorkspace()) return null

      const state = useCanvasStore.getState()
      const source = state.tiles.find((tile) => tile.id === sourceTileId)
      if (!source || source.type !== 'terminal') return null

      const tile = buildDuplicateTerminalTile({
        source,
        id: generateId(),
        position: {
          x: snapCoordinate(source.x + 40),
          y: snapCoordinate(source.y + 40),
        },
        zIndex: state.nextZIndex,
      })
      if (!tile) return null

      addTile(tile)

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
    [addTile, bringToFront, focusTile, selectTiles, setSplitViewState, snapCoordinate, canAddTileToActiveWorkspace],
  )

  const addBrowser = useCallback((url?: string) => {
    if (!tileCreationAvailability.browser) return null

    const state = useCanvasStore.getState()
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
    }
    return finalizeAddedTile(tile) ? tile.id : null
  }, [browserHomeUrl, finalizeAddedTile, getSpawnPos, tileCreationAvailability.browser])

  const addNote = useCallback(
    (kind: NoteKind, color?: NoteColor) => {
      if (!tileCreationAvailability.note) return null

      const state = useCanvasStore.getState()
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
      }
      return finalizeAddedTile(tile) ? tile.id : null
    },
    [finalizeAddedTile, getSpawnPos, tileCreationAvailability.note],
  )

  const deleteTile = useCallback(
    async (tileId: string): Promise<boolean> => {
      const state = useCanvasStore.getState()
      const tile = state.tiles.find((t) => t.id === tileId)
      if (!tile) return false

      const label = tile.label?.trim() || t(`tile.${tile.type}`)
      const workspaceId = state.activeWorkspaceId
      const confirmed = await requestConfirm({
        title: t('ui.closeTile'),
        message: t('ui.closeTileMessage', { label }),
        confirmLabel: t('common.close'),
        cancelLabel: t('ui.keepOpen'),
        danger: true,
      })
      if (!confirmed) return false

      if (tile?.type === 'note') window.electron.note.delete(tileId)
      await removeTileAfterTerminalRuntimeCleanup({
        tile,
        workspaceId,
        destroyTerminalRuntime,
        removeTile,
      })
      return true
    },
    [destroyTerminalRuntime, removeTile, requestConfirm, t],
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
    deleteTile,
    resetZoom,
    getSpawnPosition,
    focusTile,
    bringToFront,
    updateTile,
    removeTile,
    setViewport,
  }
}
