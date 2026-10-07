import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EllipsisVertical, Maximize2, Power, Settings } from 'lucide-react'
import type { WorkspaceMetadata } from '@shared/types'
import { canReadWorkspaceGitDiff } from '@/hooks/useWorkspaceGitDiff'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { WorkspaceGitDiff } from './WorkspaceGitDiff'

export interface WorkspaceListItemProps {
  workspace: WorkspaceMetadata
  /** Rendered inside the card, before the name (the collapse toggle). */
  leading?: React.ReactNode
  active?: boolean
  sessionActive?: boolean
  onClick: () => void
  onConfigure: () => void
  onFocus: () => void
  onDeactivate?: () => void
  deactivatePending?: boolean
  className?: string
}

export function WorkspaceListItem({
  workspace,
  leading,
  active = false,
  sessionActive = false,
  onClick,
  onConfigure,
  onFocus,
  onDeactivate,
  deactivatePending = false,
  className = '',
}: WorkspaceListItemProps): React.ReactElement {
  const { t } = useTranslation()
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const hasWorkspaceGitDiff = canReadWorkspaceGitDiff(
    workspace.config.rootFolderPath,
  )
  const highlighted = active || sessionActive
  const menuItems: MenuItem[] = [
    { label: t('workspace.configure'), icon: Settings, action: onConfigure },
    { label: t('workspace.focus'), icon: Maximize2, action: onFocus },
    ...(onDeactivate
      ? [{ label: t('workspace.deactivate'), icon: Power, action: onDeactivate, disabled: deactivatePending }]
      : []),
  ]

  return (
    <div
      className={`relative flex items-center rounded-2xl border ${highlighted ? '' : 'bg-bg-secondary hover:bg-hover-bg'} ${className}`.trim()}
      style={{
        background: highlighted ? 'var(--surface-raised)' : undefined,
        borderColor: highlighted ? 'var(--text-display)' : 'var(--border)',
      }}
    >
      {leading && <div className="flex shrink-0 items-center pl-1.5">{leading}</div>}
      <button
        className={`flex h-full min-w-0 flex-1 items-center py-2.5 pr-3 text-left ${leading ? 'pl-1' : 'pl-3'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
        onClick={onClick}
        title={workspace.name}
        type="button"
      >
        <span className={`min-w-0 truncate text-sm ${highlighted ? 'text-text-display' : 'text-text-secondary'}`}>
          {workspace.name}
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1 pr-2">
        {hasWorkspaceGitDiff && (
          <WorkspaceGitDiff
            workspaceId={workspace.id}
            rootFolderPath={workspace.config.rootFolderPath}
            sourceControlRepositoryPaths={workspace.config.sourceControlRepositoryPaths}
            active={active}
          />
        )}
        <button
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            const rect = event.currentTarget.getBoundingClientRect()
            // Right-align the menu (200px minimum width) with the button.
            setMenuPosition((current) => (current ? null : { x: Math.max(8, rect.right - 200), y: rect.bottom + 4 }))
          }}
          aria-label={t('workspace.actions')}
          aria-haspopup="menu"
          aria-expanded={menuPosition !== null}
          title={t('workspace.actions')}
          type="button"
        >
          <EllipsisVertical size={13} aria-hidden="true" />
        </button>
      </div>

      {menuPosition && (
        <ContextMenu
          x={menuPosition.x}
          y={menuPosition.y}
          items={menuItems}
          onClose={() => setMenuPosition(null)}
        />
      )}
    </div>
  )
}
