import React, { useMemo, useState } from 'react'
import { Pencil, RefreshCw, Trash2 } from 'lucide-react'
import type { SplitPanelId, SplitViewState, TileState } from '@shared/types'
import { useCanvasStore } from '@/store/canvasStore'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { TILE_META } from './TileContent'
import { TileListItem } from './TileListItem'

interface SplitviewPanelProps {
  tiles: TileState[]
  splitViewState: SplitViewState
  containerRef?: React.Ref<HTMLDivElement>
  onActivateTile: (panel: SplitPanelId, tileId: string) => void
  onCloseTile: (panel: SplitPanelId, tileId: string) => void | Promise<void>
  onEditTile: (tile: TileState) => void
  onFocusTile: (tile: TileState) => void
  onRefreshTile: (tile: TileState) => void | Promise<void>
  onToggleLock: (tileId: string) => void
  onMoveTile: (tileId: string, targetPanel: SplitPanelId) => void
  onFocusPanel: (panel: SplitPanelId) => void
}

interface PanelTabStripProps {
  panel: SplitPanelId
  tiles: TileState[]
  activeTileId: string | null
  focused: boolean
  onActivateTile: (panel: SplitPanelId, tileId: string) => void
  onCloseTile: (panel: SplitPanelId, tileId: string) => void | Promise<void>
  onContextMenu: (tileId: string, x: number, y: number) => void
  onMoveTile: (tileId: string, targetPanel: SplitPanelId) => void
  onFocusPanel: (panel: SplitPanelId) => void
}

function PanelTabStrip({
  panel,
  tiles,
  activeTileId,
  focused,
  onActivateTile,
  onCloseTile,
  onContextMenu,
  onMoveTile,
  onFocusPanel,
}: PanelTabStripProps): React.ReactElement {
  const terminalTitles = useCanvasStore((s) => s.terminalTitles)

  return (
    <div
      className="min-w-0 flex-1 border-r border-border px-4 pb-1 pt-3 last:border-r-0"
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
      style={{
        background: focused ? 'var(--bg-secondary)' : 'var(--bg-primary)',
      }}
    >
      <div className="flex items-stretch gap-2 overflow-x-auto">
        {tiles.length === 0 ? (
          <div className="nd-panel-raised flex h-[72px] min-w-[220px] items-center px-5 text-text-secondary">
            <span className="nd-label">No items open</span>
          </div>
        ) : (
          tiles.map((tile) => {
            const isActive = tile.id === activeTileId
            const displayLabel = tile.type === 'terminal'
              ? terminalTitles[tile.id] || tile.label || `${TILE_META.terminal.label} ${tile.id.slice(-4)}`
              : undefined

            return (
              <TileListItem
                key={tile.id}
                tile={tile}
                active={isActive}
                displayLabel={displayLabel}
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
                onContextMenu={(event) => {
                  event.preventDefault()
                  onContextMenu(tile.id, event.clientX, event.clientY)
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
  containerRef,
  onActivateTile,
  onCloseTile,
  onEditTile,
  onFocusTile,
  onRefreshTile,
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
  const menuItems: MenuItem[] = activeMenuTile
    ? [
        {
          label: activeMenuTile.type === 'terminal' ? 'Edit' : 'Rename',
          icon: Pencil,
          action: () => {
            setTabMenu(null)
            onEditTile(activeMenuTile)
          },
        },
        {
          label: 'Focus',
          action: () => {
            setTabMenu(null)
            onFocusTile(activeMenuTile)
          },
        },
        {
          label: 'Refresh',
          icon: RefreshCw,
          action: () => {
            setTabMenu(null)
            void onRefreshTile(activeMenuTile)
          },
        },
        {
          label: activeMenuTile.locked ? 'Unlock' : 'Lock',
          action: () => onToggleLock(activeMenuTile.id),
        },
        { label: 'Close', icon: Trash2, danger: true, action: () => { if (activeMenuPanel) void onCloseTile(activeMenuPanel, activeMenuTile.id) } },
      ]
    : []

  return (
    <div ref={containerRef} className="nd-panel flex border-x-0 border-t-0">
      <PanelTabStrip
        panel="left"
        tiles={leftTiles}
        activeTileId={splitViewState.activeLeftTileId}
        focused={splitViewState.focusedPanel === 'left'}
        onActivateTile={onActivateTile}
        onCloseTile={onCloseTile}
        onContextMenu={(tileId, x, y) => setTabMenu({ tileId, x, y })}
        onMoveTile={onMoveTile}
        onFocusPanel={onFocusPanel}
      />
      <PanelTabStrip
        panel="right"
        tiles={rightTiles}
        activeTileId={splitViewState.activeRightTileId}
        focused={splitViewState.focusedPanel === 'right'}
        onActivateTile={onActivateTile}
        onCloseTile={onCloseTile}
        onContextMenu={(tileId, x, y) => setTabMenu({ tileId, x, y })}
        onMoveTile={onMoveTile}
        onFocusPanel={onFocusPanel}
      />

      {tabMenu && activeMenuTile && (
        <ContextMenu x={tabMenu.x} y={tabMenu.y} items={menuItems} onClose={() => setTabMenu(null)} />
      )}
    </div>
  )
}
