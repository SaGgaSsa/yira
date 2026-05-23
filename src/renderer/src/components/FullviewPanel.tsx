import React, { useMemo, useState } from 'react'
import { Pencil, RefreshCw, Trash2 } from 'lucide-react'
import type { TileState } from '@shared/types'
import { useCanvasStore } from '@/store/canvasStore'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { TILE_META } from './TileContent'
import { TileListItem } from './TileListItem'

interface FullviewPanelProps {
  tiles: TileState[]
  activeTileId: string | null
  onActivateTile: (tileId: string) => void
  onCloseTile: (tileId: string) => void | Promise<void>
  onEditTile: (tile: TileState) => void
  onFocusTile: (tile: TileState) => void
  onRefreshTile: (tile: TileState) => void | Promise<void>
  onToggleLock: (tileId: string) => void
}

export function FullviewPanel({
  tiles,
  activeTileId,
  onActivateTile,
  onCloseTile,
  onEditTile,
  onFocusTile,
  onRefreshTile,
  onToggleLock,
}: FullviewPanelProps): React.ReactElement {
  const orderedTiles = useMemo(() => tiles.slice().sort((a, b) => b.zIndex - a.zIndex), [tiles])
  const activeTile = orderedTiles.find((tile) => tile.id === activeTileId) ?? orderedTiles[0] ?? null
  const terminalTitles = useCanvasStore((s) => s.terminalTitles)
  const [tabMenu, setTabMenu] = useState<{ tileId: string; x: number; y: number } | null>(null)

  const activeMenuTile = tabMenu ? orderedTiles.find((tile) => tile.id === tabMenu.tileId) ?? null : null
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
        { label: 'Close', icon: Trash2, danger: true, action: () => { void onCloseTile(activeMenuTile.id) } },
      ]
    : []

  return (
    <div className="shrink-0 border-b border-border bg-bg-secondary px-4 pt-3">
      <div className="flex items-stretch gap-2 overflow-x-auto">
        {orderedTiles.length === 0 ? (
          <div className="nd-panel-raised flex h-[72px] min-w-[240px] items-center rounded-2xl px-5 text-text-secondary">
            <span className="nd-label">No items open</span>
          </div>
        ) : (
          orderedTiles.map((tile) => {
            const isActive = tile.id === activeTile?.id
            const displayLabel = tile.type === 'terminal'
              ? terminalTitles[tile.id] || tile.label || `${TILE_META.terminal.label} ${tile.id.slice(-4)}`
              : undefined

            return (
              <TileListItem
                key={tile.id}
                tile={tile}
                active={isActive}
                displayLabel={displayLabel}
                className="min-w-[220px] max-w-[280px]"
                onClick={() => onActivateTile(tile.id)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setTabMenu({ tileId: tile.id, x: event.clientX, y: event.clientY })
                }}
                onClose={() => {
                  void onCloseTile(tile.id)
                }}
              />
            )
          })
        )}
      </div>

      {tabMenu && activeMenuTile && (
        <ContextMenu x={tabMenu.x} y={tabMenu.y} items={menuItems} onClose={() => setTabMenu(null)} />
      )}
    </div>
  )
}
