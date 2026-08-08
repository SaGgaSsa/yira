import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Maximize2, PanelBottomClose, PanelTopOpen, Settings, X } from 'lucide-react'
import type { TileState } from '@shared/types'
import { formatTerminalAttentionCount } from '@/utils/terminalAttention'
import { TILE_META } from './TileContent'

export interface ListRowProps {
  icon: LucideIcon
  label: string
  active?: boolean
  attentionCount?: number
  attentionTitle?: string
  onClick: () => void
  onDoubleClick?: () => void
  onConfigure?: (event: React.MouseEvent<HTMLButtonElement>) => void
  onFocus?: () => void
  onDetach?: () => void
  detached?: boolean
  onClose?: () => void
  configureTitle?: string
  focusTitle?: string
  detachTitle?: string
  attachTitle?: string
  closeTitle?: string
  detachedLabel?: string
  draggable?: boolean
  onDragStart?: (event: React.DragEvent) => void
  onDragOver?: (event: React.DragEvent) => void
  onDrop?: (event: React.DragEvent) => void
  className?: string
}

interface ListRowActionButtonProps {
  title: string
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  children: React.ReactNode
}

function ListRowActionButton({ title, onClick, children }: ListRowActionButtonProps): React.ReactElement {
  return (
    <button
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onClick(event)
      }}
      title={title}
      type="button"
    >
      {children}
    </button>
  )
}

export function ListRow({
  icon: Icon,
  label,
  active = false,
  attentionCount = 0,
  attentionTitle,
  onClick,
  onDoubleClick,
  onConfigure,
  onFocus,
  onDetach,
  detached = false,
  onClose,
  configureTitle = 'Configure',
  focusTitle = 'Focus',
  detachTitle = 'Detach',
  attachTitle = 'Attach',
  closeTitle = 'Close',
  detachedLabel = 'Detached',
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  className = '',
}: ListRowProps): React.ReactElement {
  const attentionLabel = formatTerminalAttentionCount(attentionCount)
  const actionCount = [onConfigure, onFocus, onDetach, onClose].filter(Boolean).length
  const actionPaddingClass = actionCount >= 4
    ? 'pr-[7.75rem]'
    : actionCount > 0
      ? 'pr-[5.75rem]'
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
        type="button"
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
              title={attentionTitle ?? `${attentionCount} terminal output ${attentionCount === 1 ? 'event' : 'events'}`}
            >
              {attentionLabel}
            </span>
          )}
          {detached && (
            <span className="nd-caption shrink-0 rounded-full border border-border-visible px-2 py-1 text-text-secondary">
              {detachedLabel}
            </span>
          )}
        </div>
      </button>

      {actionCount > 0 && (
        <div className="absolute right-2 top-1/2 flex shrink-0 -translate-y-1/2 items-center gap-1">
          {onConfigure && (
            <ListRowActionButton title={configureTitle} onClick={onConfigure}>
              <Settings size={13} />
            </ListRowActionButton>
          )}
          {onFocus && (
            <ListRowActionButton title={focusTitle} onClick={() => onFocus()}>
              <Maximize2 size={13} />
            </ListRowActionButton>
          )}
          {onDetach && (
            <ListRowActionButton
              title={detached ? attachTitle : detachTitle}
              onClick={() => onDetach()}
            >
              {detached ? <PanelBottomClose size={13} /> : <PanelTopOpen size={13} />}
            </ListRowActionButton>
          )}
          {onClose && (
            <ListRowActionButton title={closeTitle} onClick={() => onClose()}>
              <X size={13} />
            </ListRowActionButton>
          )}
        </div>
      )}
    </div>
  )
}

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
  const fallbackLabel = tile.type === 'note' ? meta.label : `${meta.label} ${tile.id.slice(-4)}`
  const label = (displayLabel ?? tile.label)?.trim() || fallbackLabel
  const hasActions = Boolean(onConfigure && onFocusTile && onClose)

  return (
    <ListRow
      icon={meta.icon}
      label={label}
      active={active}
      attentionCount={attentionCount}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onConfigure={hasActions ? onConfigure : undefined}
      onFocus={hasActions ? onFocusTile : undefined}
      onDetach={hasActions ? onDetachTile : undefined}
      detached={detached}
      onClose={hasActions ? onClose : undefined}
      configureTitle="Configure tile"
      focusTitle="Focus tile"
      detachTitle="Detach tile"
      attachTitle="Attach tile"
      closeTitle="Close tile"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={className}
    />
  )
}
