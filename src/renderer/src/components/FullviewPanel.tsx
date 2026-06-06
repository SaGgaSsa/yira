import React, { useMemo, useState } from 'react'
import { Bell, BellOff, CopyPlus, Eye, EyeOff, Lock, Maximize2, Pencil, RefreshCw, Trash2, Unlock } from 'lucide-react'
import type { TileState } from '@shared/types'
import { useCanvasStore } from '@/store/canvasStore'
import { getTerminalDisplayTitle } from '@/utils/terminalDisplayTitle'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { TileListItem } from './TileListItem'

interface FullviewPanelProps {
  tiles: TileState[]
  activeTileId: string | null
  attentionCounts?: Record<string, number>
  onActivateTile: (tileId: string) => void
  onCloseTile: (tileId: string) => void | Promise<void>
  onEditTile: (tile: TileState) => void
  onFocusTile: (tile: TileState) => void
  onDuplicateTile: (tile: TileState) => void
  onRefreshTile: (tile: TileState) => void | Promise<void>
  onToggleNotificationsMuted: (tile: TileState) => void
  onToggleTitlebar: (tileId: string) => void
  onToggleLock: (tileId: string) => void
}

export function FullviewPanel({
  tiles,
  activeTileId,
  attentionCounts = {},
  onActivateTile,
  onCloseTile,
  onEditTile,
  onFocusTile,
  onDuplicateTile,
  onRefreshTile,
  onToggleNotificationsMuted,
  onToggleTitlebar,
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
          icon: Maximize2,
          action: () => {
            setTabMenu(null)
            onFocusTile(activeMenuTile)
          },
        },
        ...(activeMenuTile.type === 'terminal'
          ? [{
              label: 'Duplicate',
              icon: CopyPlus,
              action: () => {
                setTabMenu(null)
                onDuplicateTile(activeMenuTile)
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
        ...(activeMenuTile.type === 'terminal' || activeMenuTile.type === 'timer'
          ? [{
              label: activeMenuTile.notificationsMuted ? 'Unmute Notifications' : 'Mute Notifications',
              icon: activeMenuTile.notificationsMuted ? Bell : BellOff,
              action: () => {
                setTabMenu(null)
                onToggleNotificationsMuted(activeMenuTile)
              },
            }]
          : []),
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
              ? getTerminalDisplayTitle(tile, terminalTitles)
              : undefined

            return (
              <TileListItem
                key={tile.id}
                tile={tile}
                active={isActive}
                displayLabel={displayLabel}
                attentionCount={attentionCounts[tile.id] ?? 0}
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
