import React from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentProvider, AgentUsageHistorySnapshot, AgentUsagePeriod } from '@shared/types'
import { buildUsageChart, USAGE_CHART } from '@/utils/activityUsage'
import { formatCompactTokens } from '@/utils/agentUsagePanel'
import { agentProviderDetails } from '../AgentUsageIndicator'
import { activityPanelClass, ActivityEmptyState } from './shared'

function getProviderColor(provider: AgentProvider): string {
  return provider === 'claude' ? 'var(--agent-claude)' : 'var(--agent-codex)'
}

export function UsageChart({ history, providers, period }: {
  history: AgentUsageHistorySnapshot | null
  providers: AgentProvider[]
  period: AgentUsagePeriod
}): React.ReactElement {
  const { t, i18n } = useTranslation()
  const chart = buildUsageChart(history, providers, period, Date.now(), i18n.language)
  const title = period === 'today' ? t('activity.tokensPerHour') : t('activity.tokensPerDay')

  return (
    <section className={activityPanelClass}>
      <h2 className="mb-3 text-sm font-semibold text-text-primary">{title}</h2>
      {!history || history.totals.total === 0 ? <ActivityEmptyState /> : (
        <svg
          viewBox={`0 0 ${USAGE_CHART.width} ${USAGE_CHART.height}`}
          className="block h-auto w-full"
          role="img"
          aria-label={title}
        >
          {chart.ticks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={chart.plot.left}
                y1={tick.y}
                x2={chart.plot.right}
                y2={tick.y}
                stroke="var(--border-subtle)"
              />
              <text
                x={chart.plot.left - 8}
                y={tick.y + 4}
                textAnchor="end"
                className="fill-text-muted text-[10px]"
              >
                {formatCompactTokens(tick.value)}
              </text>
            </g>
          ))}
          {chart.areas.map((area) => (
            <g key={area.provider} style={{ color: getProviderColor(area.provider) }}>
              <polygon
                points={area.points}
                fill="currentColor"
                fillOpacity={providers.length === 1 ? 0.2 : 0.35}
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <circle cx={area.lastX} cy={area.lastY} r="3" fill="currentColor" />
            </g>
          ))}
          {chart.xLabels.map((item) => (
            <text
              key={`${item.label}:${item.x}`}
              x={item.x}
              y={USAGE_CHART.height - 8}
              textAnchor={item.x === chart.plot.left
                ? 'start'
                : item.x === chart.plot.right ? 'end' : 'middle'}
              className="fill-text-muted text-[10px]"
            >
              {period === 'today' ? `${item.label} h` : item.label}
            </text>
          ))}
        </svg>
      )}
      <div className="mt-2 flex gap-4" role="list" aria-label={t('activity.agents')}>
        {providers.map((provider) => (
          <span key={provider} className="flex items-center gap-1.5 text-xs text-text-secondary">
            <i className="size-2 rounded-full" style={{ background: getProviderColor(provider) }} aria-hidden="true" />
            {agentProviderDetails[provider].label}
          </span>
        ))}
      </div>
    </section>
  )
}
