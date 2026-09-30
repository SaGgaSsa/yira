import React from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentUsageHistorySnapshot } from '@shared/types'
import { getCacheHitPercent } from '@/utils/activityUsage'
import { formatCompactTokens } from '@/utils/agentUsagePanel'
import { activityPanelClass } from './shared'

export function UsageKpis({ history, workspaceNames }: {
  history: AgentUsageHistorySnapshot | null
  workspaceNames: Record<string, string>
}): React.ReactElement {
  const { t } = useTranslation()
  const total = history?.totals.total ?? 0
  const cacheHit = history ? getCacheHitPercent(history) : null
  const inputOutput = history
    ? history.totals.input + history.totals.output + history.totals.reasoning
    : null
  const mostActive = history?.byWorkspace[0]
  const rows = [
    {
      label: t('activity.totalTokens'),
      value: history ? formatCompactTokens(total) : '—',
      detail: t('activity.sessionsSub', { count: history?.totals.sessions ?? 0 }),
    },
    {
      label: t('activity.inputOutput'),
      value: inputOutput === null ? '—' : formatCompactTokens(inputOutput),
      detail: t('activity.noCache'),
    },
    {
      label: t('activity.cacheHit'),
      value: cacheHit === null ? '—' : `${cacheHit}%`,
      detail: t('activity.cacheReadAmount', { count: formatCompactTokens(history?.totals.cacheRead ?? 0) }),
    },
    {
      label: t('activity.sessions'),
      value: history ? String(history.totals.sessions) : '—',
      detail: t('activity.withoutSubagents'),
    },
    {
      label: t('activity.lines'),
      value: history?.lines
        ? `${formatCompactTokens(history.lines.added)} / ${formatCompactTokens(history.lines.removed)}`
        : '—',
      detail: t('activity.claudeOnly'),
    },
    {
      label: t('activity.topWorkspace'),
      value: mostActive ? workspaceNames[mostActive.workspaceId] ?? mostActive.workspaceId : '—',
      detail: t('activity.workspaceTokens'),
    },
  ]

  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {rows.map((row) => (
        <div key={row.label} className={`${activityPanelClass} px-3 py-2`}>
          <div className="text-[10px] uppercase text-text-muted">{row.label}</div>
          <div className="mt-1 truncate text-sm font-semibold text-text-primary">
            {row.label === t('activity.lines') && history?.lines ? (
              <span>
                <span className="text-[var(--success)]">+{formatCompactTokens(history.lines.added)}</span>
                {' / '}
                <span className="text-[var(--danger)]">−{formatCompactTokens(history.lines.removed)}</span>
              </span>
            ) : row.value}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-text-secondary">{row.detail}</div>
        </div>
      ))}
    </section>
  )
}
