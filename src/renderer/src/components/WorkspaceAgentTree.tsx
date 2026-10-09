import React from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentActiveSession, WorkspaceMetadata } from '@shared/types'
import { useNow } from '@/hooks/useNow'
import { formatActivityElapsed } from '@/utils/activityPalette'
import { getAgentSessionTitle } from '@/utils/terminalDisplayTitle'

const ELAPSED_REFRESH_MS = 30_000
// Spinner glyphs that Claude and Codex put in front of their terminal title.
const TITLE_SPINNER_PREFIX = /^[·*✢-✽◐-◓⠀-⣿]+\s*/u

export interface WorkspaceAgentTreeProps {
  workspace: WorkspaceMetadata
  /** Entries must already be filtered and ordered by getWorkspaceAgentEntries. */
  sessions: readonly AgentActiveSession[]
  /** Tile of the agent shown on screen; its row is marked as current. */
  focusedTileId?: string | null
  onOpenAgent: (workspace: WorkspaceMetadata, session: AgentActiveSession) => void
}

function getStatusLabel(status: AgentActiveSession['status'], translate: (key: string) => string): string {
  if (status === 'needs-input') return translate('workspaceAgents.statusWaiting')
  if (status === 'done') return translate('workspaceAgents.statusReady')
  return translate('workspaceAgents.statusWorking')
}

function getStatusDotClass(status: AgentActiveSession['status']): string {
  if (status === 'needs-input') return 'bg-warning'
  if (status === 'done') return 'border-[1.5px] border-text-secondary'
  return 'bg-activity animate-pulse motion-reduce:animate-none'
}

function StatusDot({ status }: { status: AgentActiveSession['status'] }): React.ReactElement {
  return <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${getStatusDotClass(status)}`} aria-hidden="true" />
}

export function WorkspaceAgentTree({
  workspace,
  sessions,
  focusedTileId = null,
  onOpenAgent,
}: WorkspaceAgentTreeProps): React.ReactElement | null {
  const { t } = useTranslation()
  const now = useNow(ELAPSED_REFRESH_MS)
  if (sessions.length === 0) return null

  return (
    <div className="mt-px flex flex-col gap-px">
      {sessions.map((session) => {
        const providerName = t(session.provider === 'claude' ? 'agentsView.claude' : 'agentsView.codex')
        const sessionName = getAgentSessionTitle(session).replace(TITLE_SPINNER_PREFIX, '') || providerName
        const statusLabel = getStatusLabel(session.status, t)
        const focused = focusedTileId !== null && session.tileId === focusedTileId
        const waiting = session.status === 'needs-input'
        const done = session.status === 'done'
        const nameClass = focused
          ? 'font-medium text-text-display'
          : waiting || done ? 'text-text-primary' : 'text-text-secondary'

        return (
          <button
            key={session.sessionId}
            type="button"
            data-workspace-agent-session={session.sessionId}
            aria-label={`${sessionName}, ${statusLabel}`}
            aria-current={focused ? 'true' : undefined}
            title={`${sessionName} · ${statusLabel}`}
            onClick={() => onOpenAgent(workspace, session)}
            className={`relative flex h-[26px] min-w-0 items-center gap-2 rounded-md pl-6 pr-1.5 text-left transition-colors ${focused ? 'bg-active-bg before:absolute before:inset-y-[5px] before:left-0 before:w-0.5 before:rounded-full before:bg-text-display' : 'hover:bg-hover-bg'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--interactive)]`}
          >
            <StatusDot status={session.status} />
            <span className={`min-w-0 flex-1 truncate text-sm ${nameClass}`}>{sessionName}</span>
            {waiting && (
              <span className="shrink-0 font-mono text-[10px] text-warning">
                {t('workspaceAgents.statusWaiting')}
              </span>
            )}
            {done && (
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-text-muted">
                {formatActivityElapsed(session.lastActivityAt, now)}
              </span>
            )}
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

  const counts: Array<{ status: AgentActiveSession['status']; count: number; label: string }> = [
    { status: 'needs-input', count: needsInputCount, label: t('workspaceAgents.waitingCount', { count: needsInputCount }) },
    { status: 'done', count: doneCount, label: t('workspaceAgents.readyCount', { count: doneCount }) },
    { status: 'working', count: workingCount, label: t('workspaceAgents.workingCount', { count: workingCount }) },
  ]

  return (
    <span className="flex shrink-0 items-center gap-2">
      {counts.filter(({ count }) => count > 0).map(({ status, count, label }) => (
        <span
          key={status}
          className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums text-text-secondary"
          aria-label={label}
          title={label}
        >
          <StatusDot status={status} />
          {count}
        </span>
      ))}
    </span>
  )
}
