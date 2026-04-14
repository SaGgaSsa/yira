import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Trash2, X } from 'lucide-react'
import type { TileState } from '@shared/types'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { TILE_META } from './TileContent'

interface FullviewPanelProps {
  tiles: TileState[]
  activeTileId: string | null
  focusedTileId: string | null
  onActivateTile: (tileId: string) => void
  onCloseTile: (tileId: string) => void
  onRenameTile: (tileId: string, label?: string) => void
}

export function FullviewPanel({
  tiles,
  activeTileId,
  focusedTileId,
  onActivateTile,
  onCloseTile,
  onRenameTile,
}: FullviewPanelProps): React.ReactElement {
  const orderedTiles = useMemo(
    () => tiles.slice().sort((a, b) => b.zIndex - a.zIndex),
    [tiles],
  )
  const activeTile = orderedTiles.find((tile) => tile.id === activeTileId) ?? orderedTiles[0] ?? null
  const [renamingTileId, setRenamingTileId] = useState<string | null>(null)
  const [renamingValue, setRenamingValue] = useState('')
  const [tabMenu, setTabMenu] = useState<{ tileId: string; x: number; y: number } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (renamingTileId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [renamingTileId])

  useEffect(() => {
    if (!activeTile && renamingTileId) {
      setRenamingTileId(null)
      setRenamingValue('')
    }
  }, [activeTile, renamingTileId])

  const beginRename = (tile: TileState) => {
    setTabMenu(null)
    setRenamingTileId(tile.id)
    setRenamingValue(tile.label ?? '')
  }

  const commitRename = (tileId: string) => {
    onRenameTile(tileId, renamingValue.trim() || undefined)
    setRenamingTileId(null)
    setRenamingValue('')
  }

  const cancelRename = () => {
    setRenamingTileId(null)
    setRenamingValue('')
  }

  const activeMenuTile = tabMenu
    ? orderedTiles.find((tile) => tile.id === tabMenu.tileId) ?? null
    : null

  const menuItems: MenuItem[] = activeMenuTile
    ? [
        {
          label: 'Rename',
          icon: Pencil,
          action: () => beginRename(activeMenuTile),
        },
        {
          label: 'Close',
          icon: Trash2,
          danger: true,
          action: () => onCloseTile(activeMenuTile.id),
        },
      ]
    : []

  return (
    <div className="flex items-stretch overflow-x-auto border-b border-border bg-bg-secondary px-2">
      {orderedTiles.length === 0 ? (
        <div className="flex h-10 items-center px-3 text-sm text-text-muted">
          No items open.
        </div>
      ) : (
        orderedTiles.map((tile) => {
          const meta = TILE_META[tile.type]
          const Icon = meta.icon
          const isActive = tile.id === activeTile?.id
          const isFocused = tile.id === focusedTileId

          return (
            <div
              key={tile.id}
              className="group flex min-w-0 max-w-[260px] items-center border-r border-border-subtle"
            >
              <button
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
                style={{
                  background: isActive ? 'var(--bg-primary)' : 'transparent',
                  color: isActive || isFocused ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
                onClick={() => onActivateTile(tile.id)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setTabMenu({ tileId: tile.id, x: event.clientX, y: event.clientY })
                }}
                title={meta.label}
              >
                <Icon size={14} className="shrink-0" />
                {renamingTileId === tile.id ? (
                  <input
                    ref={inputRef}
                    className="min-w-0 flex-1 rounded-sm border border-border-subtle bg-bg-primary px-2 py-1 text-sm text-text-primary outline-none"
                    value={renamingValue}
                    onChange={(event) => setRenamingValue(event.target.value)}
                    onBlur={() => commitRename(tile.id)}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        commitRename(tile.id)
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        cancelRename()
                      }
                    }}
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate">
                    {tile.label ?? `${meta.label} ${tile.id.slice(-4)}`}
                  </span>
                )}
              </button>

              <button
                className="mx-1 flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:bg-hover-bg hover:text-text-primary"
                onClick={() => onCloseTile(tile.id)}
                title="Close tab"
              >
                <X size={13} />
              </button>
            </div>
          )
        })
      )}

      {tabMenu && activeMenuTile && (
        <ContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          items={menuItems}
          onClose={() => setTabMenu(null)}
        />
      )}
    </div>
  )
}
