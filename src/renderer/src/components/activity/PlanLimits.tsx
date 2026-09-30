import React from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentProvider, AgentUsageSnapshot } from '@shared/types'
import { formatUsageResetAt, getUsageThreshold, agentProviderDetails } from '../AgentUsageIndicator'
import { getUsagePace } from '@/utils/agentUsagePanel'
import { activityPanelClass, ActivityEmptyState } from './shared'

function getBarColor(percent: number): string {
  const threshold = getUsageThreshold(percent)
  if (threshold === 'critical') return 'bg-red-400'
  if (threshold === 'warning') return 'bg-amber-300'
  return 'bg-activity'
}

export function PlanLimits({ providers, usage }: {
  providers: AgentProvider[]
  usage: AgentUsageSnapshot | null
}): React.ReactElement {
  const { t } = useTranslation()
  const available = providers.filter((provider) => usage?.[provider]?.status === 'available')

  return (
    <section className={activityPanelClass}>
      <h2 className="mb-3 text-sm font-semibold text-text-primary">{t('activity.planLimits')}</h2>
      {available.length === 0 ? <ActivityEmptyState /> : (
        <div className="space-y-4">
          {available.map((provider) => {
            const snapshot = usage?.[provider]
            return (
              <div key={provider}>
                <div className="mb-2 flex items-center gap-2 text-xs">
                  <img
                    className="size-4"
                    src={agentProviderDetails[provider].logoPath}
                    alt=""
                    aria-hidden="true"
                  />
                  <b>{agentProviderDetails[provider].label}</b>
                  {snapshot?.planType && <span className="text-text-secondary">{snapshot.planType}</span>}
                </div>
                {snapshot?.windows.map((window) => {
                  const pace = getUsagePace(window, Date.now())
                  return (
                    <div key={window.kind} className="mb-2">
                      <div className="flex justify-between gap-2 text-[11px] text-text-secondary">
                        <span>
                          {t(window.kind === 'fiveHour' ? 'activity.windowFiveHour' : 'activity.windowWeekly')}
                          {' · '}{Math.round(window.usedPercent)}%
                          {pace.projection !== null && (
                            <span className={`ml-2 ${pace.projection >= 100 ? 'text-amber-300' : ''}`}>
                              ≈ {Math.round(pace.projection)}% {t('activity.atReset')}
                            </span>
                          )}
                        </span>
                        <span>{formatUsageResetAt(window.resetsAt, window.kind) ?? '—'}</span>
                      </div>
                      <div className="relative mt-1 h-1.5 rounded bg-bg-secondary">
                        <span
                          className={`block h-full rounded ${getBarColor(window.usedPercent)}`}
                          style={{ width: `${Math.max(0, Math.min(100, window.usedPercent))}%` }}
                        />
                        <span
                          className="absolute -top-0.5 h-2.5 w-px bg-text-primary"
                          style={{ left: `${pace.elapsed * 100}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
                {provider === 'codex' && (
                  <p className="text-[11px] text-text-secondary">
                    {t('activity.credits')}: {snapshot?.credits?.balance ?? t('activity.noData')}
                    {' · '}{t('activity.limitReached')}: {snapshot?.limitReached ?? t('activity.no')}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
