import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentUsageDetailsSnapshot, AgentUsageSnapshot, WorkspaceMetadata } from '@shared/types'
import type { WorkspaceActivityCardData } from '@/utils/workspaceActivity'
import { getVisibleAgentProviders } from '@/utils/agentUsagePanel'
import { WorkspaceActivityCard } from './WorkspaceActivityCard'
import { AgentUsagePanel } from './AgentUsagePanel'

export interface WorkspaceActivityViewProps {
  cards: readonly WorkspaceActivityCardData[]
  agentUsage?: AgentUsageSnapshot | null
  workspaces?: readonly WorkspaceMetadata[]
  onOpenWorkspace: (workspace: WorkspaceMetadata) => void
  onGoToTerminal: (workspace: WorkspaceMetadata, tileId: string | null) => void
}

export function WorkspaceActivityView({ cards, agentUsage = null, workspaces, onOpenWorkspace, onGoToTerminal }: WorkspaceActivityViewProps): React.ReactElement {
  const { t } = useTranslation()
  const [details, setDetails] = useState<AgentUsageDetailsSnapshot | null>(null)
  const workspaceList = useMemo(() => workspaces ?? cards.map((card) => card.workspace), [workspaces, cards])
  const providers = useMemo(() => getVisibleAgentProviders(workspaceList), [workspaceList])
  const workspaceNames = useMemo(() => Object.fromEntries(workspaceList.map((workspace) => [workspace.id, workspace.name])), [workspaceList])

  useEffect(() => {
    let active = true
    const refresh = () => {
      if (!window.electron?.agents?.usageDetails) return
      void window.electron.agents.usageDetails().then((snapshot) => { if (active) setDetails(snapshot) }).catch(() => { if (active) setDetails(null) })
    }
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg-secondary" data-activity-view="true">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className={providers.length ? 'grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]' : ''}>
          <div className="min-w-0">
            {cards.length === 0 ? (
              <div className="nd-panel-raised rounded-[20px] px-5 py-8 text-center" data-activity-empty="true">
                <div className="nd-label text-text-primary">{t('activity.emptyTitle')}</div>
                <div className="mt-3 text-sm text-text-secondary">{t('activity.emptyMessage')}</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {cards.map((card) => (
                  <WorkspaceActivityCard
                    key={card.workspace.id}
                    card={card}
                    tokensToday={card.workspace.config.agentProvider ? details?.providers[card.workspace.config.agentProvider]?.tokensByWorkspace[card.workspace.id] : undefined}
                    onOpen={() => onOpenWorkspace(card.workspace)}
                    onGoToTerminal={card.attentionTileId ? () => onGoToTerminal(card.workspace, card.attentionTileId) : null}
                  />
                ))}
              </div>
            )}
          </div>
          {providers.length > 0 && <AgentUsagePanel providers={providers} usage={agentUsage} details={details} workspaceNames={workspaceNames} />}
        </div>
      </div>
    </div>
  )
}
