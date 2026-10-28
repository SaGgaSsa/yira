import React from 'react'
import { useTranslation } from 'react-i18next'
import { Maximize2, PanelBottomClose, PanelTopOpen, Pin, Settings, X } from 'lucide-react'
import type { TFunction } from 'i18next'
import type { AgentSessionTileButtonProps } from './AgentSessionTileContext'

export function getTemporaryTileTitle(t: TFunction, pinTitle?: string): string {
  return pinTitle
    ? `${t('agentsView.temporaryBadgeTitle')}\n${pinTitle}`
    : t('agentsView.temporaryBadgeTitle')
}

interface TileActionButtonsProps extends AgentSessionTileButtonProps {
  onConfigure: (event: React.MouseEvent<HTMLButtonElement>) => void
  onFocus: () => void
  onClose: () => void
  onDetach?: () => void
  detached?: boolean
  className?: string
}

function TileActionButton({
  title,
  onClick,
  children,
  disabled = false,
}: {
  title: string
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  children: React.ReactNode
  disabled?: boolean
}): React.ReactElement {
  return (
    <button
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
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

export function TileActionButtons({
  onConfigure,
  onFocus,
  onClose,
  onDetach,
  detached = false,
  temporary = false,
  onPin,
  pinDisabled,
  pinTitle,
  className = '',
}: TileActionButtonsProps): React.ReactElement {
  const { t } = useTranslation()
  return (
    <div className={`flex shrink-0 items-center gap-1 ${className}`.trim()}>
      {/* The pin button doubles as the temporary marker, so it shows even when pinning is unavailable. */}
      {temporary && (
        <TileActionButton
          title={getTemporaryTileTitle(t, pinTitle)}
          onClick={() => onPin?.()}
          disabled={!onPin || pinDisabled}
        >
          <Pin size={13} />
        </TileActionButton>
      )}
      <TileActionButton title={t('ui.configureTile')} onClick={onConfigure}>
        <Settings size={13} />
      </TileActionButton>
      <TileActionButton title={t('ui.focusTile')} onClick={() => onFocus()}>
        <Maximize2 size={13} />
      </TileActionButton>
      {onDetach && !temporary && (
        <TileActionButton title={detached ? t('ui.attachTile') : t('ui.detachTile')} onClick={() => onDetach()}>
          {detached ? <PanelBottomClose size={13} /> : <PanelTopOpen size={13} />}
        </TileActionButton>
      )}
      <TileActionButton title={t('ui.closeTile')} onClick={() => onClose()}>
        <X size={13} />
      </TileActionButton>
    </div>
  )
}
