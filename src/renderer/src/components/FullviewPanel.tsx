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
  onCloseTile: (tileId: string) => void | Promise<void>
  onRenameTile: (tileId: string, label?: string) => void
  onToggleLock: (tileId: string) => void
}

export function FullviewPanel({
  tiles,
  activeTileId,
  focusedTileId,
  onActivateTile,
  onCloseTile,
  onRenameTile,
  onToggleLock,
}: FullviewPanelProps): React.ReactElement {
  const orderedTiles = useMemo(() => tiles.slice().sort((a, b) => b.zIndex - a.zIndex), [tiles])
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

  const activeMenuTile = tabMenu ? orderedTiles.find((tile) => tile.id === tabMenu.tileId) ?? null : null
  const menuItems: MenuItem[] = activeMenuTile
    ? [
        { label: 'Rename', icon: Pencil, action: () => beginRename(activeMenuTile) },
        {
          label: activeMenuTile.locked ? 'Unlock' : 'Lock',
          action: () => onToggleLock(activeMenuTile.id),
        },
        { label: 'Close', icon: Trash2, danger: true, action: () => { void onCloseTile(activeMenuTile.id) } },
      ]
    : []

  return (
    <div className="nd-panel border-x-0 border-t-0 px-4 py-3">
      <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
        {orderedTiles.length === 0 ? (
          <div className="nd-panel-raised flex h-[72px] min-w-[240px] items-center rounded-2xl px-5 text-text-secondary">
            <span className="nd-label">No items open</span>
          </div>
        ) : (
          orderedTiles.map((tile, index) => {
            const meta = TILE_META[tile.type]
            const Icon = meta.icon
            const isActive = tile.id === activeTile?.id
            const isFocused = tile.id === focusedTileId

            return (
              <div
                key={tile.id}
                className={`relative min-w-[220px] max-w-[280px] rounded-2xl border ${
                  isActive ? 'border-text-display bg-bg-secondary' : 'border-border bg-bg-secondary'
                }`}
              >
                <button
                  className="flex w-full items-start gap-3 px-4 py-4 text-left"
                  onClick={() => onActivateTile(tile.id)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setTabMenu({ tileId: tile.id, x: event.clientX, y: event.clientY })
                  }}
                  title={meta.label}
                >
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-visible text-text-secondary">
                    <Icon size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="nd-label text-text-secondary">
                      {isActive ? '[ ACTIVE ]' : isFocused ? '[ SELECTED ]' : '[ OPEN ]'}
                    </div>
                    {renamingTileId === tile.id ? (
                      <input
                        ref={inputRef}
                        className="mt-2 w-full border-b border-border-visible bg-transparent pb-1 font-mono text-sm text-text-primary outline-none"
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
                            setRenamingTileId(null)
                            setRenamingValue('')
                          }
                        }}
                      />
                    ) : (
                      <div className="mt-2 truncate text-base text-text-display">
                        {tile.label ?? `${meta.label} ${tile.id.slice(-4)}`}
                      </div>
                    )}
                  </div>
                </button>

                <button
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
                  onClick={() => { void onCloseTile(tile.id) }}
                  title="Close tab"
                >
                  <X size={13} />
                </button>
              </div>
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
