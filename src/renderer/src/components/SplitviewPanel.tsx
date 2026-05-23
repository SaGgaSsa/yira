import React, { useMemo, useState } from 'react'
import { CopyPlus, Eye, EyeOff, Lock, Maximize2, Pencil, RefreshCw, Trash2, Unlock } from 'lucide-react'
import type { SplitPanelId, SplitViewState, TileState } from '@shared/types'
import { useCanvasStore } from '@/store/canvasStore'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { TILE_META } from './TileContent'
import { TileListItem } from './TileListItem'

interface SplitviewPanelProps {
  tiles: TileState[]
  splitViewState: SplitViewState
  onActivateTile: (panel: SplitPanelId, tileId: string) => void
  onCloseTile: (panel: SplitPanelId, tileId: string) => void | Promise<void>
  onEditTile: (tile: TileState) => void
  onFocusTile: (tile: TileState) => void
  onDuplicateTile: (panel: SplitPanelId, tile: TileState) => void
  onRefreshTile: (tile: TileState) => void | Promise<void>
  onToggleTitlebar: (tileId: string) => void
  onToggleLock: (tileId: string) => void
  onMoveTile: (tileId: string, targetPanel: SplitPanelId) => void
  onFocusPanel: (panel: SplitPanelId) => void
}

interface PanelTabStripProps {
  panel: SplitPanelId
  tiles: TileState[]
  activeTileId: string | null
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
  onActivateTile,
  onCloseTile,
  onContextMenu,
  onMoveTile,
  onFocusPanel,
}: PanelTabStripProps): React.ReactElement {
  const terminalTitles = useCanvasStore((s) => s.terminalTitles)

  return (
    <div
      className="min-w-0 flex-1 border-r border-border px-4 pt-3 last:border-r-0"
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
  onActivateTile,
  onCloseTile,
  onEditTile,
  onFocusTile,
  onDuplicateTile,
  onRefreshTile,
  onToggleTitlebar,
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
          icon: Maximize2,
          action: () => {
            setTabMenu(null)
            onFocusTile(activeMenuTile)
          },
        },
        ...(activeMenuTile.type === 'terminal' && activeMenuPanel
          ? [{
              label: 'Duplicate',
              icon: CopyPlus,
              action: () => {
                setTabMenu(null)
                onDuplicateTile(activeMenuPanel, activeMenuTile)
              },
            }]
          : []),
        {
          label: 'Refresh',
          icon: RefreshCw,
          action: () => {
            setTabMenu(null)
            void onRefreshTile(activeMenuTile)
          },
        },
        {
          label: activeMenuTile.hideTitlebar ? 'Show Titlebar' : 'Hide Titlebar',
          icon: activeMenuTile.hideTitlebar ? Eye : EyeOff,
          action: () => onToggleTitlebar(activeMenuTile.id),
        },
        {
          label: activeMenuTile.locked ? 'Unlock' : 'Lock',
          icon: activeMenuTile.locked ? Unlock : Lock,
          action: () => onToggleLock(activeMenuTile.id),
        },
        { label: 'Close', icon: Trash2, danger: true, action: () => { if (activeMenuPanel) void onCloseTile(activeMenuPanel, activeMenuTile.id) } },
      ]
    : []

  return (
    <div className="flex shrink-0 border-b border-border bg-bg-secondary">
      <PanelTabStrip
        panel="left"
        tiles={leftTiles}
        activeTileId={splitViewState.activeLeftTileId}
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
