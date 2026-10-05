import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  AgentProvider,
  AgentUsageHistorySnapshot,
  AgentUsagePeriod,
  AgentUsageSnapshot,
  UserSettings,
  WorkspaceMetadata,
} from '@shared/types'
import { getEnabledAgentProviders } from '@/utils/effectiveAgent'
import {
  ACTIVITY_FILTER_KEY,
  getActivityUsageRequests,
  normalizeActivityFilter,
  readActivityFilters,
  type ActivityProviderFilter,
} from '@/utils/activityUsage'
import type { WorkspaceActivityCardData } from '@/utils/workspaceActivity'
import { ActivityToolbar } from './activity/ActivityToolbar'
import { ModelBreakdown } from './activity/ModelBreakdown'
import { PlanLimits } from './activity/PlanLimits'
import { RecentSessions } from './activity/RecentSessions'
import { TokenMix } from './activity/TokenMix'
import { UsageBreakdown } from './activity/UsageBreakdown'
import { UsageChart } from './activity/UsageChart'
import { UsageKpis } from './activity/UsageKpis'
import { WorkspaceStrip } from './activity/WorkspaceStrip'
import { activityPanelClass } from './activity/shared'

interface CachedActivityHistory {
  history: AgentUsageHistorySnapshot | null
  todayHistory: AgentUsageHistorySnapshot | null
}

// Kept for the app session so reopening Activity shows the last data while it refreshes.
const activityHistoryCache = new Map<string, CachedActivityHistory>()

function activityCacheKey(period: AgentUsagePeriod, providers: readonly AgentProvider[]): string {
  return `${period}|${providers.join(',')}`
}

export interface WorkspaceActivityViewProps {
  cards: readonly WorkspaceActivityCardData[]
  agentUsage?: AgentUsageSnapshot | null
  workspaces?: readonly WorkspaceMetadata[]
  onOpenWorkspace: (workspace: WorkspaceMetadata) => void
  onGoToTerminal: (workspace: WorkspaceMetadata, tileId: string | null) => void
  onOpenSettings?: (section?: 'agents') => void
  agents: UserSettings['agents']
}

export function WorkspaceActivityView({
  cards,
  agentUsage = null,
  workspaces,
  onOpenWorkspace,
  onGoToTerminal,
  onOpenSettings,
  agents,
}: WorkspaceActivityViewProps): React.ReactElement {
  const { t } = useTranslation()
  const enabled = useMemo(() => getEnabledAgentProviders(agents), [agents])
  const [filters, setFilters] = useState(readActivityFilters)
  const providerFilter = normalizeActivityFilter(filters.provider, enabled)
  const providers: AgentProvider[] = providerFilter === 'all' ? enabled : [providerFilter]
  const cacheKey = activityCacheKey(filters.period, providers)
  const [history, setHistory] = useState<AgentUsageHistorySnapshot | null>(
    () => activityHistoryCache.get(cacheKey)?.history ?? null,
  )
  const [todayHistory, setTodayHistory] = useState<AgentUsageHistorySnapshot | null>(
    () => activityHistoryCache.get(cacheKey)?.todayHistory ?? null,
  )
  const workspaceList = workspaces ?? cards.map((card) => card.workspace)
  const workspaceNames = useMemo(
    () => Object.fromEntries(workspaceList.map((workspace) => [workspace.id, workspace.name])),
    [workspaceList],
  )

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVITY_FILTER_KEY, JSON.stringify({ ...filters, provider: providerFilter }))
    } catch {
      // Browser storage can be disabled.
    }
  }, [filters, providerFilter])

  useEffect(() => {
    let active = true
    let timer = 0
    const cached = activityHistoryCache.get(cacheKey)
    setHistory(cached?.history ?? null)
    setTodayHistory(cached?.todayHistory ?? null)
    const refresh = async () => {
      if (!window.electron?.agents?.usageHistory || providers.length === 0) return
      try {
        const [historyRequest, todayRequest] = getActivityUsageRequests(
          filters.period,
          providers,
          enabled,
        )
        const nextHistory = await window.electron.agents.usageHistory(historyRequest)
        const nextToday = todayRequest
          ? await window.electron.agents.usageHistory(todayRequest)
          : nextHistory
        if (!active) return
        activityHistoryCache.set(cacheKey, { history: nextHistory, todayHistory: nextToday })
        setHistory(nextHistory)
        setTodayHistory(nextToday)
        const indexing = nextHistory?.indexing === true || nextToday?.indexing === true
        timer = window.setTimeout(refresh, indexing ? 5000 : 60_000)
      } catch {
        if (active) timer = window.setTimeout(refresh, 60_000)
      }
    }
    void refresh()
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [cacheKey, enabled.join(','), filters.period, providers.join(',')])

  const changeFilters = (next: Partial<typeof filters>) => {
    setFilters((current) => ({ ...current, ...next }))
  }

  if (enabled.length === 0) {
    return (
      <div
        className="flex min-h-0 flex-1 items-center justify-center bg-bg-secondary"
        data-activity-view="true"
      >
        <div className={`${activityPanelClass} max-w-lg text-center`}>
          <h2 className="text-base font-semibold text-text-primary">
            {t('activity.noAgentsEnabled')}
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            {t('activity.enableAgentsHint')}
          </p>
          <button
            type="button"
            className="mt-4 rounded-full border border-border-visible px-4 py-2 text-sm text-text-primary"
            onClick={() => onOpenSettings?.('agents')}
          >
            {t('settings.agents')}
          </button>
        </div>
      </div>
    )
  }

  const period: AgentUsagePeriod = filters.period
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg-secondary"
      data-activity-view="true"
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
        <ActivityToolbar
          enabled={enabled}
          provider={providerFilter}
          period={period}
          updatedAt={history?.updatedAt}
          indexing={history?.indexing === true || todayHistory?.indexing === true}
          onProviderChange={(provider: ActivityProviderFilter) => changeFilters({ provider })}
          onPeriodChange={(nextPeriod) => changeFilters({ period: nextPeriod })}
        />

        <section aria-label={t('activity.workspaces')}>
          <WorkspaceStrip
            cards={cards}
            todayHistory={todayHistory}
            agents={agents}
            onOpenWorkspace={onOpenWorkspace}
            onGoToTerminal={onGoToTerminal}
          />
        </section>

        <UsageKpis history={history} workspaceNames={workspaceNames} />
        <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <UsageChart history={history} providers={providers} period={period} />
          <PlanLimits providers={providers} usage={agentUsage} />
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <div className="space-y-4">
            <UsageBreakdown history={history} workspaceNames={workspaceNames} />
            <ModelBreakdown history={history} />
          </div>
          <div className="space-y-4">
            <TokenMix history={history} />
            <RecentSessions history={history} workspaceNames={workspaceNames} />
          </div>
        </div>
      </div>
    </div>
  )
}
