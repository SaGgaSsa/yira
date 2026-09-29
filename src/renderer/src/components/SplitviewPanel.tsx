import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SplitPanelId, SplitViewState, TileState } from '@shared/types'
import { useCanvasStore } from '@/store/canvasStore'
import { getTerminalDisplayTitle } from '@/utils/terminalDisplayTitle'
import { SPLIT_TAB_STRIP_HEIGHT_PX } from '@/utils/splitViewLayout'
import { ContextMenu } from './ContextMenu'
import { TileListItem } from './TileListItem'
import { buildTileConfigurationMenuItems } from './tileConfigurationMenu'

interface SplitviewPanelProps {
  tiles: TileState[]
  splitViewState: SplitViewState
  attentionCounts?: Record<string, number>
  onActivateTile: (panel: SplitPanelId, tileId: string) => void
  onCloseTile: (panel: SplitPanelId, tileId: string) => void | Promise<void>
  onEditTile: (tile: TileState) => void
  onFocusTile: (tile: TileState) => void
  onDuplicateTile: (panel: SplitPanelId, tile: TileState) => void
  onRefreshTile: (tile: TileState) => void | Promise<void>
  onToggleNotificationsMuted: (tile: TileState) => void
  onToggleLock: (tileId: string) => void
  onMoveTile: (tileId: string, targetPanel: SplitPanelId) => void
  onFocusPanel: (panel: SplitPanelId) => void
}

interface PanelTabStripProps {
  panel: SplitPanelId
  tiles: TileState[]
  orientation: SplitViewState['orientation']
  activeTileId: string | null
  attentionCounts: Record<string, number>
  onActivateTile: (panel: SplitPanelId, tileId: string) => void
  onCloseTile: (panel: SplitPanelId, tileId: string) => void | Promise<void>
  onConfigureTile: (tileId: string, x: number, y: number) => void
  onFocusTile: (tile: TileState) => void
  onMoveTile: (tileId: string, targetPanel: SplitPanelId) => void
  onFocusPanel: (panel: SplitPanelId) => void
}

function PanelTabStrip({
  panel,
  tiles,
  orientation,
  activeTileId,
  attentionCounts,
  onActivateTile,
  onCloseTile,
  onConfigureTile,
  onFocusTile,
  onMoveTile,
  onFocusPanel,
}: PanelTabStripProps): React.ReactElement {
  const { t } = useTranslation()
  const terminalTitles = useCanvasStore((s) => s.terminalTitles)
  const horizontal = orientation === 'horizontal'

  return (
    <div
      className={`min-w-0 border-border px-3 py-2 ${
        horizontal
          ? 'pointer-events-auto absolute left-0 right-0 z-20 border-b bg-bg-secondary'
          : 'flex-1 border-r bg-bg-secondary last:border-r-0'
      }`}
      style={horizontal ? {
        height: SPLIT_TAB_STRIP_HEIGHT_PX,
        top: panel === 'left' ? 0 : '50%',
      } : undefined}
      onMouseDown={() => onFocusPanel(panel)}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => {
        event.preventDefault()
        const tileId = event.dataTransfer.getData('application/x-yira-tile-id')
        if (tileId) onMoveTile(tileId, panel)
      }}
    >
      <div className="flex h-full items-stretch gap-2 overflow-x-auto">
        {tiles.length === 0 ? (
          <div className="nd-panel-raised flex min-w-[220px] items-center px-5 text-text-secondary">
            <span className="nd-label">{t('ui.noItemsOpen')}</span>
          </div>
        ) : (
          tiles.map((tile) => {
            const isActive = tile.id === activeTileId
            const displayLabel = tile.type === 'terminal'
              ? getTerminalDisplayTitle(tile, terminalTitles)
              : undefined

            return (
              <TileListItem
                key={tile.id}
                tile={tile}
                active={isActive}
                displayLabel={displayLabel}
                attentionCount={attentionCounts[tile.id] ?? 0}
                className="min-w-[200px] max-w-[260px]"
                draggable={tiles.length > 1}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('application/x-yira-tile-id', tile.id)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const draggedTileId = event.dataTransfer.getData('application/x-yira-tile-id')
                  if (draggedTileId) onMoveTile(draggedTileId, panel)
                }}
                onClick={() => onActivateTile(panel, tile.id)}
                onConfigure={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  onConfigureTile(tile.id, rect.left, rect.bottom + 6)
                }}
                onFocusTile={() => {
                  onFocusTile(tile)
                }}
                onClose={() => {
                  void onCloseTile(panel, tile.id)
                }}
              />
            )
          })
        )}
      </div>
    </div>
  )
}

export function SplitviewPanel({
  tiles,
  splitViewState,
  attentionCounts = {},
  onActivateTile,
  onCloseTile,
  onEditTile,
  onFocusTile,
  onDuplicateTile,
  onRefreshTile,
  onToggleNotificationsMuted,
  onToggleLock,
  onMoveTile,
  onFocusPanel,
}: SplitviewPanelProps): React.ReactElement {
  const tilesById = useMemo(() => new Map(tiles.map((tile) => [tile.id, tile])), [tiles])
  const leftTiles = splitViewState.leftTileIds.flatMap((tileId) => {
    const tile = tilesById.get(tileId)
    return tile ? [tile] : []
  })
  const rightTiles = splitViewState.rightTileIds.flatMap((tileId) => {
    const tile = tilesById.get(tileId)
    return tile ? [tile] : []
  })
  const [tabMenu, setTabMenu] = useState<{ tileId: string; x: number; y: number } | null>(null)
  const activeMenuTile = tabMenu ? tilesById.get(tabMenu.tileId) ?? null : null
  const activeMenuPanel: SplitPanelId | null = activeMenuTile
    ? splitViewState.leftTileIds.includes(activeMenuTile.id)
      ? 'left'
      : splitViewState.rightTileIds.includes(activeMenuTile.id)
        ? 'right'
        : null
    : null
  const menuItems = activeMenuTile
    ? buildTileConfigurationMenuItems({
        tile: activeMenuTile,
        onEdit: onEditTile,
        onDuplicate: activeMenuPanel ? (tile) => onDuplicateTile(activeMenuPanel, tile) : undefined,
        onRefresh: onRefreshTile,
        onToggleNotificationsMuted,
        onToggleLock: (tile) => onToggleLock(tile.id),
        onBeforeAction: () => setTabMenu(null),
      })
    : []

  const horizontal = splitViewState.orientation === 'horizontal'

  return (
    <div className={horizontal
      ? 'pointer-events-none absolute inset-0 z-20'
      : 'flex shrink-0 border-b border-border bg-bg-secondary'
    }>
      <PanelTabStrip
        panel="left"
        tiles={leftTiles}
        orientation={splitViewState.orientation}
        activeTileId={splitViewState.activeLeftTileId}
        attentionCounts={attentionCounts}
        onActivateTile={onActivateTile}
        onCloseTile={onCloseTile}
        onConfigureTile={(tileId, x, y) => setTabMenu({ tileId, x, y })}
        onFocusTile={onFocusTile}
        onMoveTile={onMoveTile}
        onFocusPanel={onFocusPanel}
      />
      <PanelTabStrip
        panel="right"
        tiles={rightTiles}
        orientation={splitViewState.orientation}
        activeTileId={splitViewState.activeRightTileId}
        attentionCounts={attentionCounts}
        onActivateTile={onActivateTile}
        onCloseTile={onCloseTile}
        onConfigureTile={(tileId, x, y) => setTabMenu({ tileId, x, y })}
        onFocusTile={onFocusTile}
        onMoveTile={onMoveTile}
        onFocusPanel={onFocusPanel}
      />

      {tabMenu && activeMenuTile && (
        <ContextMenu x={tabMenu.x} y={tabMenu.y} items={menuItems} onClose={() => setTabMenu(null)} />
      )}
    </div>
  )
}
