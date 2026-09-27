import React from 'react'
import { useTranslation } from 'react-i18next'
import { CircleDot, LoaderCircle, Terminal } from 'lucide-react'
import { canReadWorkspaceGitDiff } from '@/hooks/useWorkspaceGitDiff'
import { WorkspaceGitDiff } from './WorkspaceGitDiff'
import type { WorkspaceActivityCardData, WorkspaceActivityStatus } from '@/utils/workspaceActivity'

export interface WorkspaceActivityCardProps {
  card: WorkspaceActivityCardData
  onOpen: () => void
  onGoToTerminal: (() => void) | null
}

function getStatusColor(status: WorkspaceActivityStatus): string {
  switch (status) {
    case 'active': return 'var(--activity)'
    case 'unread': return 'var(--text-primary)'
    case 'idle': return 'var(--text-secondary)'
  }
}

function getStatusLabelKey(status: WorkspaceActivityStatus): string {
  switch (status) {
    case 'active': return 'activity.statusActive'
    case 'unread': return 'activity.statusUnread'
    case 'idle': return 'activity.statusIdle'
  }
}

export function WorkspaceActivityCard({ card, onOpen, onGoToTerminal }: WorkspaceActivityCardProps): React.ReactElement {
  const { t } = useTranslation()
  const { workspace, status, terminalCount, isCurrent } = card
  const hasWorkspaceGitDiff = canReadWorkspaceGitDiff(workspace.config.rootFolderPath)
  const statusColor = getStatusColor(status)
  const StatusIcon = status === 'active' ? LoaderCircle : status === 'unread' ? CircleDot : Terminal

  return (
    <article
      className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-bg-tertiary p-4"
      data-activity-card={workspace.id}
      data-activity-status={status}
      aria-current={isCurrent ? 'true' : undefined}
    >
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-text-primary" title={workspace.name}>
          {workspace.name}
        </h3>
        {hasWorkspaceGitDiff && (
          <WorkspaceGitDiff
            workspaceId={workspace.id}
            rootFolderPath={workspace.config.rootFolderPath}
            sourceControlRepositoryPaths={workspace.config.sourceControlRepositoryPaths}
          />
        )}
      </div>

      <div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
          style={{ borderColor: statusColor, color: statusColor }}
        >
          <StatusIcon
            size={12}
            aria-hidden="true"
            className={status === 'active' ? 'motion-safe:animate-spin' : undefined}
          />
          {t(getStatusLabelKey(status))}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-secondary">
        <span>{t('activity.terminals', { count: terminalCount })}</span>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <button
          className="inline-flex h-8 items-center rounded-full border px-4 text-sm text-text-primary transition-colors hover:bg-hover-bg"
          style={{ borderColor: 'var(--text-primary)' }}
          onClick={onOpen}
          type="button"
        >
          {t('activity.openWorkspace')}
        </button>
        {onGoToTerminal && (
          <button
            className="inline-flex h-8 items-center rounded-full border border-border px-4 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
            onClick={onGoToTerminal}
            type="button"
          >
            {t('activity.goToTerminal')}
          </button>
        )}
      </div>
    </article>
  )
}
