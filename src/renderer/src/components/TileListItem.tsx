import React from 'react'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import { Maximize2, PanelBottomClose, PanelTopOpen, Power, Settings, X } from 'lucide-react'
import type { TileState } from '@shared/types'
import { formatTerminalAttentionCount } from '@/utils/terminalAttention'
import { getTileTypeLabel, TILE_META } from './TileContent'
import { TerminalTileActivityIcon } from './TerminalActivityIcon'

export interface ListRowProps {
  icon?: LucideIcon
  leadingIcon?: React.ReactNode
  label: string
  variant?: 'default' | 'workspace'
  workspaceDiff?: React.ReactNode
  active?: boolean
  sessionActive?: boolean
  attentionCount?: number
  attentionTitle?: string
  onClick: () => void
  onDoubleClick?: () => void
  onConfigure?: (event: React.MouseEvent<HTMLButtonElement>) => void
  onFocus?: () => void
  onDeactivate?: () => void
  deactivateDisabled?: boolean
  onDetach?: () => void
  detached?: boolean
  onClose?: () => void
  configureTitle?: string
  focusTitle?: string
  deactivateTitle?: string
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
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-50 ${workspaceVariant ? 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--interactive)]' : ''}`}
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
  leadingIcon,
  label,
  variant = 'default',
  workspaceDiff,
  active = false,
  sessionActive = false,
  attentionCount = 0,
  attentionTitle,
  onClick,
  onDoubleClick,
  onConfigure,
  onFocus,
  onDeactivate,
  deactivateDisabled = false,
  onDetach,
  detached = false,
  onClose,
  configureTitle = 'Configure',
  focusTitle = 'Focus',
  deactivateTitle = 'Deactivate workspace',
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
  const actionCount = [onConfigure, onFocus, onDeactivate, onDetach, onClose].filter(Boolean).length
  const isWorkspace = variant === 'workspace'
  const hasWorkspaceDiff = isWorkspace && Boolean(workspaceDiff)
  const workspaceIsActive = isWorkspace && (active || sessionActive)
  const actionPaddingClass = actionCount >= 4
    ? 'pr-[7.75rem]'
    : actionCount > 0
      ? 'pr-[5.75rem]'
      : ''
  const rowStateClassName = isWorkspace
    ? workspaceIsActive
      ? ''
      : 'bg-bg-secondary hover:bg-hover-bg'
    : ''
  const iconClassName = 'border-border-visible text-text-secondary'
  const labelClassName = isWorkspace && !workspaceIsActive
    ? 'text-text-secondary'
    : 'text-text-display'

  return (
    <div
      className={`relative rounded-2xl border ${isWorkspace ? 'flex items-center' : ''} ${rowStateClassName} ${className}`.trim()}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={isWorkspace
        ? {
            background: workspaceIsActive ? 'var(--surface-raised)' : undefined,
            borderColor: workspaceIsActive ? 'var(--text-display)' : 'var(--border)',
          }
        : {
            background: active ? 'var(--surface-raised)' : 'var(--surface)',
            borderColor: active ? 'var(--text-display)' : 'var(--border)',
          }}
    >
      <button
        className={`flex h-full items-center gap-2 px-3 py-2.5 ${isWorkspace ? 'min-w-0 flex-1' : `w-full ${actionPaddingClass}`} ${isWorkspace ? 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--interactive)]' : ''}`}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        title={label}
        type="button"
      >
        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${iconClassName}`}>
          {leadingIcon ?? (Icon ? <Icon size={11} className="shrink-0" /> : null)}
        </div>
        <div className={`flex min-w-0 flex-1 items-center gap-2 ${isWorkspace ? 'justify-start text-left' : 'justify-center text-center'}`}>
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

      {(actionCount > 0 || hasWorkspaceDiff) && (
        <div className={isWorkspace
          ? 'flex shrink-0 items-center gap-1 pr-2'
          : 'absolute right-2 top-1/2 flex shrink-0 -translate-y-1/2 items-center gap-1'}>
          {isWorkspace && workspaceDiff}
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
          {onDeactivate && (
            <ListRowActionButton
              title={deactivateTitle}
              onClick={() => onDeactivate()}
              disabled={deactivateDisabled}
              workspaceVariant={isWorkspace}
            >
              <Power size={13} aria-hidden="true" />
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
  const { t } = useTranslation()
  const meta = TILE_META[tile.type]
  const tileTypeLabel = getTileTypeLabel(tile.type, t)
  const fallbackLabel = tile.type === 'note' ? tileTypeLabel : `${tileTypeLabel} ${tile.id.slice(-4)}`
  const label = (displayLabel ?? tile.label)?.trim() || fallbackLabel
  const hasActions = Boolean(onConfigure && onFocusTile && onClose)

  return (
    <ListRow
      icon={meta.icon}
      leadingIcon={tile.type === 'terminal' ? <TerminalTileActivityIcon tileId={tile.id} attentionCount={attentionCount} /> : undefined}
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
      configureTitle={t('ui.configureTile')}
      focusTitle={t('ui.focusTile')}
      detachTitle={t('ui.detachTile')}
      attachTitle={t('ui.attachTile')}
      closeTitle={t('ui.closeTile')}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={className}
    />
  )
}
