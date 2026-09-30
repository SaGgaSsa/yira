import React from 'react'
import { ArrowUpRight, CircleDot, LoaderCircle, Terminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { canReadWorkspaceGitDiff } from '@/hooks/useWorkspaceGitDiff'
import { getEffectiveAgentProvider } from '@/utils/effectiveAgent'
import type { UserSettings } from '@shared/types'
import type { WorkspaceActivityCardData, WorkspaceActivityStatus } from '@/utils/workspaceActivity'
import { formatCompactTokens } from '@/utils/agentUsagePanel'
import { agentProviderDetails } from './AgentUsageIndicator'
import { WorkspaceGitDiff } from './WorkspaceGitDiff'

export interface WorkspaceActivityCardProps {
  card: WorkspaceActivityCardData
  onOpen: () => void
  onGoToTerminal: (() => void) | null
  tokensToday?: number
  agents: UserSettings['agents']
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

export function WorkspaceActivityCard({
  card,
  onOpen,
  onGoToTerminal,
  tokensToday,
  agents,
}: WorkspaceActivityCardProps): React.ReactElement {
  const { t } = useTranslation()
  const { workspace, status, terminalCount, isCurrent } = card
  const provider = getEffectiveAgentProvider(workspace.config, agents)
  const statusColor = getStatusColor(status)
  const StatusIcon = status === 'active' ? LoaderCircle : status === 'unread' ? CircleDot : Terminal
  const hasWorkspaceGitDiff = canReadWorkspaceGitDiff(workspace.config.rootFolderPath)

  return (
    <article
      className="flex min-h-[70px] flex-col justify-center gap-1 rounded-lg border border-border-subtle bg-bg-tertiary px-3 py-2"
      data-activity-card={workspace.id}
      data-activity-status={status}
      aria-current={isCurrent ? 'true' : undefined}
    >
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary" title={workspace.name}>
          {workspace.name}
        </h3>
        <span
          className="inline-flex min-w-0 max-w-[45%] items-center gap-1 truncate rounded-full border px-1.5 py-0.5 text-[10px]"
          style={{ borderColor: statusColor, color: statusColor }}
        >
          <StatusIcon
            size={10}
            aria-hidden="true"
            className={status === 'active' ? 'motion-safe:animate-spin' : undefined}
          />
          {t(getStatusLabelKey(status))}
        </span>
        {onGoToTerminal && (
          <button
            type="button"
            className="rounded p-1 text-text-secondary hover:text-text-primary"
            aria-label={t('activity.goToTerminal')}
            title={t('activity.goToTerminal')}
            onClick={onGoToTerminal}
          >
            <Terminal size={13} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className="rounded p-1 text-text-secondary hover:text-text-primary"
          aria-label={t('activity.openWorkspace')}
          title={t('activity.openWorkspace')}
          data-open-workspace-icon="arrow-up-right"
          onClick={onOpen}
        >
          <ArrowUpRight size={13} aria-hidden="true" data-icon="ArrowUpRight" />
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-2 text-[10px] text-text-secondary">
        {provider && (
          <img
            className="size-3 shrink-0 object-contain"
            src={agentProviderDetails[provider].logoPath}
            alt=""
            aria-hidden="true"
            title={agentProviderDetails[provider].label}
          />
        )}
        <span className="shrink-0">{t('activity.terminals', { count: terminalCount })}</span>
        {provider && tokensToday !== undefined && (
          <span className="shrink-0">
            {formatCompactTokens(tokensToday)} {t('activity.tokensToday')}
          </span>
        )}
        {hasWorkspaceGitDiff && (
          <WorkspaceGitDiff
            workspaceId={workspace.id}
            rootFolderPath={workspace.config.rootFolderPath}
            sourceControlRepositoryPaths={workspace.config.sourceControlRepositoryPaths}
          />
        )}
      </div>
    </article>
  )
}
