import React from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentUsageHistorySnapshot } from '@shared/types'
import { formatCompactTokens } from '@/utils/agentUsagePanel'
import { activityPanelClass, ActivityEmptyState } from './shared'

const tokenKinds = [
  { key: 'input', color: 'var(--token-input)' },
  { key: 'output', color: 'var(--token-output)' },
  { key: 'cacheRead', color: 'var(--token-cache-read)' },
  { key: 'cacheWrite', color: 'var(--token-cache-write)' },
  { key: 'reasoning', color: 'var(--token-reasoning)' },
] as const

export function TokenMix({ history }: {
  history: AgentUsageHistorySnapshot | null
}): React.ReactElement {
  const { t } = useTranslation()
  const values = tokenKinds
    .map(({ key, color }) => ({ key, color, value: history?.totals[key] ?? 0 }))
    .filter((item) => item.value > 0)
  const total = values.reduce((sum, item) => sum + item.value, 0)

  return (
    <section className={activityPanelClass}>
      <h2 className="mb-3 text-sm font-semibold text-text-primary">{t('activity.tokenMix')}</h2>
      {values.length === 0 ? <ActivityEmptyState /> : (
        <>
          <div className="flex h-1.5 overflow-hidden rounded bg-bg-secondary" aria-hidden="true">
            {values.map((item) => (
              <span
                key={item.key}
                style={{ width: `${item.value / total * 100}%`, background: item.color }}
              />
            ))}
          </div>
          <ul className="mt-3 space-y-2">
            {values.map((item) => (
              <li key={item.key} className="flex items-center gap-2 text-xs text-text-secondary">
                <i className="size-2 rounded-full" style={{ background: item.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1">{t(`activity.token.${item.key}`)}</span>
                <span>{Math.round(item.value / total * 100)}%</span>
                <span className="min-w-14 text-right">{formatCompactTokens(item.value)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
