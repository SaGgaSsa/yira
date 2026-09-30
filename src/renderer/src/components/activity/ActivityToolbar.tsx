import React from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentProvider, AgentUsagePeriod } from '@shared/types'
import { agentProviderDetails } from '../AgentUsageIndicator'
import type { ActivityProviderFilter } from '@/utils/activityUsage'

export interface ActivityToolbarProps {
  enabled: AgentProvider[]
  provider: ActivityProviderFilter
  period: AgentUsagePeriod
  updatedAt?: string
  indexing: boolean
  onProviderChange: (provider: ActivityProviderFilter) => void
  onPeriodChange: (period: AgentUsagePeriod) => void
}

export function ActivityToolbar({
  enabled,
  provider,
  period,
  updatedAt,
  indexing,
  onProviderChange,
  onPeriodChange,
}: ActivityToolbarProps): React.ReactElement {
  const { t } = useTranslation()

  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div
        role="group"
        aria-label={t('activity.agentFilter')}
        className="flex items-center gap-1 rounded-full border border-border-subtle bg-bg-tertiary p-1"
      >
        {enabled.length > 1 && (
          <button
            type="button"
            className={`rounded-full px-3 py-1.5 text-xs ${provider === 'all'
              ? 'bg-bg-secondary text-text-primary'
              : 'text-text-secondary'}`}
            aria-pressed={provider === 'all'}
            onClick={() => onProviderChange('all')}
          >
            {t('activity.all')}
          </button>
        )}
        {enabled.map((item) => (
          <button
            key={item}
            data-agent-filter-provider={item}
            type="button"
            className={`rounded-full px-3 py-1.5 text-xs ${provider === item
              ? 'bg-bg-secondary text-text-primary'
              : 'text-text-secondary'}`}
            aria-pressed={provider === item}
            onClick={() => onProviderChange(item)}
          >
            {agentProviderDetails[item].label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs text-text-secondary">
        {updatedAt && (
          <span>
            {t('activity.updatedAt', {
              time: new Date(updatedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </span>
        )}
        {indexing && <span>{t('activity.indexing')}</span>}
        <div
          role="group"
          aria-label={t('activity.periodFilter')}
          className="flex rounded-full border border-border-subtle p-1"
        >
          {(['today', '7d', '30d'] as AgentUsagePeriod[]).map((item) => (
            <button
              key={item}
              type="button"
              className={`rounded-full px-2.5 py-1 ${period === item
                ? 'bg-bg-tertiary text-text-primary'
                : ''}`}
              aria-pressed={period === item}
              onClick={() => onPeriodChange(item)}
            >
              {t(`activity.period.${item}`)}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
