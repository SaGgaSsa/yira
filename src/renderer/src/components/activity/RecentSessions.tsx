import React from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentUsageHistorySnapshot } from '@shared/types'
import { formatCompactTokens } from '@/utils/agentUsagePanel'
import { agentProviderDetails } from '../AgentUsageIndicator'
import { activityPanelClass, ActivityEmptyState } from './shared'

export function RecentSessions({ history, workspaceNames }: {
  history: AgentUsageHistorySnapshot | null
  workspaceNames: Record<string, string>
}): React.ReactElement {
  const { t } = useTranslation()
  const sessions = history?.recentSessions.filter((session) => (
    Date.now() - new Date(session.lastActivityAt).getTime() <= 30 * 60_000
  )) ?? []

  return (
    <section className={activityPanelClass}>
      <h2 className="mb-3 text-sm font-semibold text-text-primary">{t('activity.recentSessions')}</h2>
      {sessions.length === 0 ? <ActivityEmptyState /> : (
        <ul className="space-y-3">
          {sessions.map((session) => {
            const workspace = workspaceNames[session.workspaceId ?? '']
            const contextPercent = session.contextWindow
              ? Math.min(100, (session.contextTokens ?? 0) / session.contextWindow * 100)
              : null
            return (
              <li key={`${session.provider}:${session.sessionId}`} className="text-xs">
                <div className="flex items-center gap-2">
                  <img
                    className="size-3.5"
                    src={agentProviderDetails[session.provider].logoPath}
                    alt=""
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-text-primary">
                    {workspace ?? agentProviderDetails[session.provider].label}
                    {session.model && <span className="text-text-muted"> · {session.model}</span>}
                  </span>
                  <time className="text-text-secondary">
                    {new Date(session.lastActivityAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
                {contextPercent !== null && (
                  <div className="mt-1 ml-5 flex items-center gap-2 text-[10px] text-text-muted">
                    <span>{t('activity.context')}</span>
                    <span className="h-1 flex-1 overflow-hidden rounded bg-bg-secondary">
                      <span
                        className={`block h-full ${contextPercent >= 85 ? 'bg-amber-300' : 'bg-activity'}`}
                        style={{ width: `${contextPercent}%` }}
                      />
                    </span>
                    <span>
                      {session.contextWindowApprox ? '~' : ''}
                      {formatCompactTokens(session.contextTokens ?? 0)} / {formatCompactTokens(session.contextWindow ?? 0)}
                    </span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
