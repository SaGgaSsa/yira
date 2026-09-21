import React from 'react'
import { useTranslation } from 'react-i18next'
import { canReadWorkspaceGitDiff } from '@/hooks/useWorkspaceGitDiff'
import type { TerminalActivityStatus } from '@/utils/terminalActivity'
import { TerminalActivityIcon } from './TerminalActivityIcon'
import { WorkspaceGitDiff } from './WorkspaceGitDiff'
import type { WorkspaceActivityCardData } from '@/utils/workspaceActivity'

export const MAX_ACTIVITY_SESSION_ROWS = 3

export interface WorkspaceActivityCardProps {
  card: WorkspaceActivityCardData
  onOpen: () => void
  onGoToTerminal: (() => void) | null
}

function getStatusColor(status: TerminalActivityStatus): string {
  switch (status) {
    case 'needs-input': return 'var(--warning)'
    case 'working': return 'var(--accent)'
    case 'done': return 'var(--success)'
    case 'unread': return 'var(--text-primary)'
    case 'idle': return 'var(--text-secondary)'
  }
}

export function WorkspaceActivityCard({ card, onOpen, onGoToTerminal }: WorkspaceActivityCardProps): React.ReactElement {
  const { t } = useTranslation()
  const { workspace, activity, terminalCount, activeAgents, agentDetails, isCurrent } = card
  const hasWorkspaceGitDiff = canReadWorkspaceGitDiff(workspace.config.rootFolderPath)
  const statusColor = getStatusColor(activity.status)
  const visibleSessions = agentDetails.slice(0, MAX_ACTIVITY_SESSION_ROWS)
  const hiddenSessionCount = agentDetails.length - visibleSessions.length

  return (
    <article
      className="flex flex-col gap-3 rounded-xl border bg-bg-secondary p-4"
      style={{
        borderColor: activity.status === 'needs-input'
          ? 'var(--warning)'
          : isCurrent
            ? 'var(--accent)'
            : 'var(--border)',
      }}
      data-activity-card={workspace.id}
      data-activity-status={activity.status}
      data-activity-sessions={agentDetails.length}
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
          <TerminalActivityIcon activity={activity} size={12} />
          {t(`terminalActivity.${activity.status}`)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-secondary">
        <span>{t('activity.terminals', { count: terminalCount })}</span>
        <span>{t('activity.agents', { count: activeAgents })}</span>
      </div>

      {agentDetails.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="nd-label text-text-secondary">{t('activity.sessions')}</div>
          <ul className="flex flex-col gap-1">
            {visibleSessions.map((detail) => (
              <li
                key={`${detail.provider}/${detail.sessionId}`}
                className="flex min-w-0 items-center justify-between gap-2 text-xs text-text-secondary"
              >
                <span className="truncate text-text-primary">{t(`workspace.${detail.provider}`)}</span>
                <span className="shrink-0">{t(`terminalActivity.${detail.status}`)}</span>
              </li>
            ))}
          </ul>
          {hiddenSessionCount > 0 && (
            <div className="text-xs text-text-secondary">
              {t('activity.moreSessions', { count: hiddenSessionCount })}
            </div>
          )}
        </div>
      )}

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
