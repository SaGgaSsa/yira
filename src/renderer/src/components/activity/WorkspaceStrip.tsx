import React from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentUsageHistorySnapshot, UserSettings, WorkspaceMetadata } from '@shared/types'
import { getWorkspaceTokensToday } from '@/utils/activityUsage'
import type { WorkspaceActivityCardData } from '@/utils/workspaceActivity'
import { WorkspaceActivityCard } from '../WorkspaceActivityCard'

export function WorkspaceStrip({ cards, todayHistory, agents, onOpenWorkspace, onGoToTerminal }: {
  cards: readonly WorkspaceActivityCardData[]
  todayHistory: AgentUsageHistorySnapshot | null
  agents: UserSettings['agents']
  onOpenWorkspace: (workspace: WorkspaceMetadata) => void
  onGoToTerminal: (workspace: WorkspaceMetadata, tileId: string | null) => void
}): React.ReactElement {
  const { t } = useTranslation()

  if (cards.length === 0) {
    return <p className="text-sm text-text-secondary" data-activity-empty="true">{t('activity.emptyMessage')}</p>
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
      {cards.map((card) => (
        <WorkspaceActivityCard
          key={card.workspace.id}
          card={card}
          agents={agents}
          onOpen={() => onOpenWorkspace(card.workspace)}
          onGoToTerminal={card.attentionTileId
            ? () => onGoToTerminal(card.workspace, card.attentionTileId)
            : null}
          tokensToday={getWorkspaceTokensToday(todayHistory, card.workspace.id)}
        />
      ))}
    </div>
  )
}
