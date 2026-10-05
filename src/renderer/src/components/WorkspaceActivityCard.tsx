import React from 'react'
import { ArrowUpRight, CircleDot, LoaderCircle, Terminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { canReadWorkspaceGitDiff } from '@/hooks/useWorkspaceGitDiff'
import { getEffectiveAgentProvider } from '@/utils/effectiveAgent'
import type { UserSettings } from '@shared/types'
import type { TerminalProcessAgent } from '@shared/terminalProcessActivity'
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

const OPENCODE_LABEL = 'OpenCode'

function AgentLogo({ agent }: { agent: TerminalProcessAgent }): React.ReactElement | null {
  if (agent === 'opencode') return null
  return (
    <img
      className="size-3.5 shrink-0 object-contain"
      src={agentProviderDetails[agent].logoPath}
      alt=""
      aria-hidden="true"
    />
  )
}

function agentLabel(agent: TerminalProcessAgent): string {
  return agent === 'opencode' ? OPENCODE_LABEL : agentProviderDetails[agent].label
}

export function WorkspaceActivityCard({
  card,
  onOpen,
  onGoToTerminal,
  tokensToday,
  agents,
}: WorkspaceActivityCardProps): React.ReactElement {
  const { t } = useTranslation()
  const { workspace, status, terminalCount, workingTerminalCount, agents: runningAgents, isCurrent } = card
  const provider = getEffectiveAgentProvider(workspace.config, agents)
  const statusColor = getStatusColor(status)
  const StatusIcon = status === 'active' ? LoaderCircle : status === 'unread' ? CircleDot : Terminal
  const hasWorkspaceGitDiff = canReadWorkspaceGitDiff(workspace.config.rootFolderPath)

  return (
    <article
      className="flex min-h-[132px] flex-col gap-2 rounded-lg border border-border-subtle bg-bg-tertiary px-4 py-3"
      data-activity-card={workspace.id}
      data-activity-status={status}
      aria-current={isCurrent ? 'true' : undefined}
    >
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-text-primary" title={workspace.name}>
          {workspace.name}
        </h3>
        {onGoToTerminal && (
          <button
            type="button"
            className="rounded p-1 text-text-secondary hover:text-text-primary"
            aria-label={t('activity.goToTerminal')}
            title={t('activity.goToTerminal')}
            onClick={onGoToTerminal}
          >
            <Terminal size={15} aria-hidden="true" />
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
          <ArrowUpRight size={15} aria-hidden="true" data-icon="ArrowUpRight" />
        </button>
      </div>

      <span
        className="inline-flex w-fit max-w-full items-center gap-1 truncate rounded-full border px-2 py-0.5 text-xs"
        style={{ borderColor: statusColor, color: statusColor }}
      >
        <StatusIcon
          size={12}
          aria-hidden="true"
          className={status === 'active' ? 'motion-safe:animate-spin' : undefined}
        />
        {t(getStatusLabelKey(status))}
      </span>

      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary" data-activity-terminals="true">
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <Terminal size={14} aria-hidden="true" />
          {t('activity.terminals', { count: terminalCount })}
        </span>
        {workingTerminalCount > 0 && (
          <span className="shrink-0" style={{ color: 'var(--activity)' }}>
            {t('activity.workingCount', { count: workingTerminalCount })}
          </span>
        )}
        {provider && tokensToday !== undefined && (
          <span className="shrink-0">
            {formatCompactTokens(tokensToday)} {t('activity.tokensToday')}
          </span>
        )}
      </div>

      <ul className="flex min-w-0 flex-col gap-1 text-sm" data-activity-agents="true">
        {runningAgents.length === 0 ? (
          <li className="flex items-center gap-1.5 text-text-disabled">
            {provider && <AgentLogo agent={provider} />}
            {t('activity.noAgentsRunning')}
          </li>
        ) : runningAgents.map((summary) => (
          <li key={summary.agent} className="flex min-w-0 items-center gap-1.5 text-text-primary" data-activity-agent={summary.agent}>
            <AgentLogo agent={summary.agent} />
            <span className="truncate">{agentLabel(summary.agent)}</span>
            <span className="text-text-secondary">× {summary.count}</span>
            {summary.working > 0 && (
              <span className="ml-auto shrink-0 text-xs" style={{ color: 'var(--activity)' }}>
                {t('activity.workingCount', { count: summary.working })}
              </span>
            )}
          </li>
        ))}
      </ul>

      {hasWorkspaceGitDiff && (
        <div className="mt-auto min-w-0 text-xs text-text-secondary">
          <WorkspaceGitDiff
            workspaceId={workspace.id}
            rootFolderPath={workspace.config.rootFolderPath}
            sourceControlRepositoryPaths={workspace.config.sourceControlRepositoryPaths}
          />
        </div>
      )}
    </article>
  )
}
