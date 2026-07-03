import React from 'react'
import { Maximize2, PanelBottomClose, PanelTopOpen, Settings, X } from 'lucide-react'

interface TileActionButtonsProps {
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
}: {
  title: string
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  children: React.ReactNode
}): React.ReactElement {
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

export function TileActionButtons({
  onConfigure,
  onFocus,
  onClose,
  onDetach,
  detached = false,
  className = '',
}: TileActionButtonsProps): React.ReactElement {
  return (
    <div className={`flex shrink-0 items-center gap-1 ${className}`.trim()}>
      <TileActionButton title="Configure tile" onClick={onConfigure}>
        <Settings size={13} />
      </TileActionButton>
      <TileActionButton title="Focus tile" onClick={() => onFocus()}>
        <Maximize2 size={13} />
      </TileActionButton>
      {onDetach && (
        <TileActionButton title={detached ? 'Attach tile' : 'Detach tile'} onClick={() => onDetach()}>
          {detached ? <PanelBottomClose size={13} /> : <PanelTopOpen size={13} />}
        </TileActionButton>
      )}
      <TileActionButton title="Close tile" onClick={() => onClose()}>
        <X size={13} />
      </TileActionButton>
    </div>
  )
}
