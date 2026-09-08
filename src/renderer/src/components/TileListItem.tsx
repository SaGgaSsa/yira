import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Maximize2, PanelBottomClose, PanelTopOpen, Pin, Settings, X } from 'lucide-react'
import type { TileState } from '@shared/types'
import { formatTerminalAttentionCount } from '@/utils/terminalAttention'
import { TILE_META } from './TileContent'

export interface ListRowProps {
  icon: LucideIcon
  label: string
  variant?: 'default' | 'workspace'
  active?: boolean
  attentionCount?: number
  attentionTitle?: string
  onClick: () => void
  onDoubleClick?: () => void
  onConfigure?: (event: React.MouseEvent<HTMLButtonElement>) => void
  onFocus?: () => void
  onPin?: () => void
  pinned?: boolean
  pinDisabled?: boolean
  onDetach?: () => void
  detached?: boolean
  onClose?: () => void
  configureTitle?: string
  focusTitle?: string
  pinTitle?: string
  unpinTitle?: string
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
  pressed?: boolean
  disabled?: boolean
  workspaceVariant?: boolean
}

function ListRowActionButton({ title, onClick, children, pressed, disabled = false, workspaceVariant = false }: ListRowActionButtonProps): React.ReactElement {
  return (
    <button
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-50 ${workspaceVariant ? 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent' : ''}`}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onClick(event)
      }}
      aria-label={title}
      aria-pressed={pressed}
      disabled={disabled}
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
  variant = 'default',
  active = false,
  attentionCount = 0,
  attentionTitle,
  onClick,
  onDoubleClick,
  onConfigure,
  onFocus,
  onPin,
  pinned = false,
  pinDisabled = false,
  onDetach,
  detached = false,
  onClose,
  configureTitle = 'Configure',
  focusTitle = 'Focus',
  pinTitle = 'Pin',
  unpinTitle = 'Unpin',
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
  const actionCount = [onConfigure, onFocus, onPin, onDetach, onClose].filter(Boolean).length
  const isWorkspace = variant === 'workspace'
  const actionPaddingClass = actionCount >= 4
    ? 'pr-[7.75rem]'
    : actionCount > 0
      ? 'pr-[5.75rem]'
      : ''
  const rowStateClassName = isWorkspace
    ? active
      ? 'bg-accent-subtle'
      : 'bg-bg-secondary hover:bg-hover-bg'
    : ''
  const iconClassName = isWorkspace && active
    ? 'border-accent text-accent'
    : 'border-border-visible text-text-secondary'
  const labelClassName = isWorkspace && !active
    ? 'text-text-secondary'
    : 'text-text-display'

  return (
    <div
      className={`relative rounded-2xl border ${rowStateClassName} ${className}`.trim()}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={isWorkspace
        ? {
            borderColor: active ? 'var(--accent)' : 'var(--border)',
            boxShadow: active ? 'inset 3px 0 0 var(--accent)' : undefined,
          }
        : {
            background: active ? 'var(--surface-raised)' : 'var(--surface)',
            borderColor: active ? 'var(--text-display)' : 'var(--border)',
          }}
    >
      <button
        className={`flex h-full w-full items-center gap-2 px-3 py-2.5 ${actionPaddingClass} ${isWorkspace ? 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent' : ''}`}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        title={label}
        type="button"
      >
        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${iconClassName}`}>
          <Icon size={11} className="shrink-0" />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-center">
          <div className={`min-w-0 truncate text-sm ${labelClassName}`}>
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
            <ListRowActionButton title={configureTitle} onClick={onConfigure} workspaceVariant={isWorkspace}>
              <Settings size={13} />
            </ListRowActionButton>
          )}
          {onFocus && (
            <ListRowActionButton title={focusTitle} onClick={() => onFocus()} workspaceVariant={isWorkspace}>
              <Maximize2 size={13} />
            </ListRowActionButton>
          )}
          {onPin && (
            <ListRowActionButton
              title={pinned ? unpinTitle : pinTitle}
              onClick={() => onPin()}
              pressed={pinned}
              disabled={pinDisabled}
              workspaceVariant={isWorkspace}
            >
              <Pin size={13} className={pinned ? `fill-current ${isWorkspace && !active ? 'text-text-secondary' : 'text-text-display'}` : undefined} aria-hidden="true" />
            </ListRowActionButton>
          )}
          {onDetach && (
            <ListRowActionButton
              title={detached ? attachTitle : detachTitle}
              onClick={() => onDetach()}
              workspaceVariant={isWorkspace}
            >
              {detached ? <PanelBottomClose size={13} /> : <PanelTopOpen size={13} />}
            </ListRowActionButton>
          )}
          {onClose && (
            <ListRowActionButton title={closeTitle} onClick={() => onClose()} workspaceVariant={isWorkspace}>
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
