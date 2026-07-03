import React from 'react'
import type { TileState } from '@shared/types'
import { formatTerminalAttentionCount } from '@/utils/terminalAttention'
import { TILE_META } from './TileContent'
import { TileActionButtons } from './TileActionButtons'

interface TileListItemProps {
  tile: TileState
  active?: boolean
  displayLabel?: string
  attentionCount?: number
  onClick: () => void
  onDoubleClick?: () => void
  onConfigure?: (event: React.MouseEvent<HTMLButtonElement>) => void
  onFocusTile?: () => void
  onDetachTile?: () => void
  detached?: boolean
  onClose?: () => void
  draggable?: boolean
  onDragStart?: (event: React.DragEvent) => void
  onDragOver?: (event: React.DragEvent) => void
  onDrop?: (event: React.DragEvent) => void
  className?: string
}

export function TileListItem({
  tile,
  active = false,
  displayLabel,
  attentionCount = 0,
  onClick,
  onDoubleClick,
  onConfigure,
  onFocusTile,
  onDetachTile,
  detached = false,
  onClose,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  className = '',
}: TileListItemProps): React.ReactElement {
  const meta = TILE_META[tile.type]
  const Icon = meta.icon
  const fallbackLabel = tile.type === 'note' ? meta.label : `${meta.label} ${tile.id.slice(-4)}`
  const label = (displayLabel ?? tile.label)?.trim() || fallbackLabel
  const attentionLabel = formatTerminalAttentionCount(attentionCount)
  const hasActions = Boolean(onConfigure && onFocusTile && onClose)
  const actionPaddingClass = hasActions
    ? onDetachTile ? 'pr-[7.75rem]' : 'pr-[5.75rem]'
    : ''

  return (
    <div
      className={`relative rounded-2xl border ${className}`.trim()}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        background: active ? 'var(--surface-raised)' : 'var(--surface)',
        borderColor: active ? 'var(--text-display)' : 'var(--border)',
      }}
    >
      <button
        className={`flex h-full w-full items-center gap-2 px-3 py-2.5 ${actionPaddingClass}`}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        title={label}
      >
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border-visible text-text-secondary">
          <Icon size={11} className="shrink-0" />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-center">
          <div className="min-w-0 truncate text-sm text-text-display">
            {label}
          </div>
          {attentionLabel && (
            <span
              className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-text-display px-1.5 font-mono text-[10px] leading-none text-text-display"
              title={`${attentionCount} terminal output ${attentionCount === 1 ? 'event' : 'events'}`}
            >
              {attentionLabel}
            </span>
          )}
          {detached && (
            <span className="nd-caption shrink-0 rounded-full border border-border-visible px-2 py-1 text-text-secondary">
              Detached
            </span>
          )}
        </div>
      </button>

      {onConfigure && onFocusTile && onClose && (
        <TileActionButtons
          className="absolute right-2 top-1/2 -translate-y-1/2"
          onConfigure={onConfigure}
          onFocus={onFocusTile}
          onDetach={onDetachTile}
          detached={detached}
          onClose={onClose}
        />
      )}
    </div>
  )
}
