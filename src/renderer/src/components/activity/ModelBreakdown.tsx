import React from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentUsageHistorySnapshot } from '@shared/types'
import { formatCompactTokens } from '@/utils/agentUsagePanel'
import { agentProviderDetails } from '../AgentUsageIndicator'
import { activityPanelClass, ActivityEmptyState } from './shared'

function getProviderColor(provider: 'claude' | 'codex'): string {
  return provider === 'claude' ? 'var(--agent-claude)' : 'var(--agent-codex)'
}

export function ModelBreakdown({ history }: {
  history: AgentUsageHistorySnapshot | null
}): React.ReactElement {
  const { t } = useTranslation()
  const rows = history?.byModel ?? []
  const total = Math.max(1, history?.totals.total ?? 0)

  return (
    <section className={activityPanelClass}>
      <h2 className="mb-3 text-sm font-semibold text-text-primary">{t('activity.byModel')}</h2>
      {rows.length === 0 ? <ActivityEmptyState /> : (
        <div className="space-y-2">
          {rows.map((row) => {
            const percent = row.tokens / total * 100
            return (
              <div key={`${row.provider}:${row.model}`}>
                <div className="flex items-center gap-2 text-xs">
                  <img
                    className="size-3.5"
                    src={agentProviderDetails[row.provider].logoPath}
                    alt=""
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-text-primary">{row.model}</span>
                  <span className="shrink-0 text-text-secondary">
                    {Math.round(percent)}% · {formatCompactTokens(row.tokens)}
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded bg-bg-secondary">
                  <div
                    className="h-full"
                    style={{ width: `${percent}%`, background: getProviderColor(row.provider) }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
