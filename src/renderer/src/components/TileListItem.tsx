import React from 'react'
import { X } from 'lucide-react'
import type { TileState } from '@shared/types'
import { TILE_META } from './TileContent'

interface TileListItemProps {
  tile: TileState
  active?: boolean
  onClick: () => void
  onDoubleClick?: () => void
  onContextMenu?: (event: React.MouseEvent) => void
  onClose?: () => void
  className?: string
}

export function TileListItem({
  tile,
  active = false,
  onClick,
  onDoubleClick,
  onContextMenu,
  onClose,
  className = '',
}: TileListItemProps): React.ReactElement {
  const meta = TILE_META[tile.type]
  const Icon = meta.icon

  return (
    <div
      className={`relative rounded-2xl border ${className}`.trim()}
      style={{
        background: active ? 'var(--surface-raised)' : 'var(--surface)',
        borderColor: active ? 'var(--text-display)' : 'var(--border)',
      }}
    >
      <button
        className={`flex w-full items-center gap-3 px-4 py-4 ${onClose ? 'pr-14' : ''}`}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        title={meta.label}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-visible text-text-secondary">
          <Icon size={15} className="shrink-0" />
        </div>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm text-text-display">
            {tile.label ?? `${meta.label} ${tile.id.slice(-4)}`}
          </div>
        </div>
      </button>

      {onClose && (
        <button
          className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
          onClick={onClose}
          title="Close tab"
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}
