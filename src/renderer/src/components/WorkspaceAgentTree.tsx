import React from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentActiveSession, WorkspaceMetadata } from '@shared/types'
import { getAgentSessionTitle } from '@/utils/terminalDisplayTitle'

export interface WorkspaceAgentTreeProps {
  workspace: WorkspaceMetadata
  /** Entries must already be filtered and ordered by getWorkspaceAgentEntries. */
  sessions: readonly AgentActiveSession[]
  onOpenAgent: (workspace: WorkspaceMetadata, session: AgentActiveSession) => void
}

function getStatusLabel(status: AgentActiveSession['status'], translate: (key: string) => string): string {
  if (status === 'needs-input') return translate('workspaceAgents.statusWaiting')
  if (status === 'done') return translate('workspaceAgents.statusReady')
  return translate('workspaceAgents.statusWorking')
}

function getStatusDotClass(status: AgentActiveSession['status']): string {
  if (status === 'needs-input') return 'bg-warning'
  if (status === 'done') return 'bg-text-display'
  return 'bg-activity'
}

export function WorkspaceAgentTree({
  workspace,
  sessions,
  onOpenAgent,
}: WorkspaceAgentTreeProps): React.ReactElement | null {
  const { t } = useTranslation()
  if (sessions.length === 0) return null

  return (
    <div className="ml-3 flex flex-col gap-0.5 border-l border-border pl-2">
      {sessions.map((session) => {
        const providerName = t(session.provider === 'claude' ? 'agentsView.claude' : 'agentsView.codex')
        const sessionName = getAgentSessionTitle(session) || providerName
        const statusLabel = getStatusLabel(session.status, t)

        return (
          <button
            key={session.sessionId}
            type="button"
            data-workspace-agent-session={session.sessionId}
            aria-label={`${sessionName}, ${statusLabel}`}
            title={sessionName}
            onClick={() => onOpenAgent(workspace, session)}
            className="flex min-w-0 items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-hover-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--interactive)]"
          >
            <span className="mt-1.5 flex h-2 w-2 shrink-0 items-center justify-center">
              <span className={`h-2 w-2 rounded-full ${getStatusDotClass(session.status)}`} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-text-primary">{sessionName}</span>
              <span className="nd-caption block truncate text-text-muted">{statusLabel}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export interface WorkspaceAgentSummaryProps {
  needsInputCount: number
  doneCount: number
  workingCount: number
}

export function WorkspaceAgentSummary({
  needsInputCount,
  doneCount,
  workingCount,
}: WorkspaceAgentSummaryProps): React.ReactElement | null {
  const { t } = useTranslation()
  if (needsInputCount <= 0 && doneCount <= 0 && workingCount <= 0) return null

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {needsInputCount > 0 && (
        <span className="rounded-full border border-warning px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-warning">
          {t('workspaceAgents.waitingCount', { count: needsInputCount })}
        </span>
      )}
      {doneCount > 0 && (
        <span className="rounded-full border border-border-visible px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-text-display">
          {t('workspaceAgents.readyCount', { count: doneCount })}
        </span>
      )}
      {workingCount > 0 && (
        <span className="rounded-full border border-activity px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-activity">
          {t('workspaceAgents.workingCount', { count: workingCount })}
        </span>
      )}
    </span>
  )
}
