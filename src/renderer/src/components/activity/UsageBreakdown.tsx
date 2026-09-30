import React from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentUsageHistorySnapshot } from '@shared/types'
import { formatCompactTokens } from '@/utils/agentUsagePanel'
import { activityPanelClass, ActivityEmptyState } from './shared'

export function UsageBreakdown({ history, workspaceNames }: {
  history: AgentUsageHistorySnapshot | null
  workspaceNames: Record<string, string>
}): React.ReactElement {
  const { t } = useTranslation()
  const rows = history?.byWorkspace ?? []
  const total = Math.max(1, history?.totals.total ?? 0)

  return (
    <section className={activityPanelClass}>
      <h2 className="mb-3 text-sm font-semibold text-text-primary">{t('activity.byWorkspace')}</h2>
      {rows.length === 0 ? <ActivityEmptyState /> : (
        <div className="space-y-2">
          {rows.map((row) => {
            const percent = row.tokens / total * 100
            return (
              <div key={row.workspaceId}>
                <div className="flex justify-between gap-3 text-xs text-text-secondary">
                  <span className="truncate">{workspaceNames[row.workspaceId] ?? row.workspaceId}</span>
                  <span className="shrink-0">{Math.round(percent)}% · {formatCompactTokens(row.tokens)}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded bg-bg-secondary">
                  <div className="h-full bg-activity" style={{ width: `${percent}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
