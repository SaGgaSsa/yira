import React from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkspaceMetadata } from '@shared/types'
import type { WorkspaceActivityCardData } from '@/utils/workspaceActivity'
import { WorkspaceActivityCard } from './WorkspaceActivityCard'

export interface WorkspaceActivityViewProps {
  cards: readonly WorkspaceActivityCardData[]
  onOpenWorkspace: (workspace: WorkspaceMetadata) => void
  onGoToTerminal: (workspace: WorkspaceMetadata, tileId: string | null) => void
}

export function WorkspaceActivityView({
  cards,
  onOpenWorkspace,
  onGoToTerminal,
}: WorkspaceActivityViewProps): React.ReactElement {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg-secondary" data-activity-view="true">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {cards.length === 0 ? (
          <div className="nd-panel-raised rounded-[20px] px-5 py-8 text-center" data-activity-empty="true">
            <div className="nd-label text-text-primary">{t('activity.emptyTitle')}</div>
            <div className="mt-3 text-sm text-text-secondary">{t('activity.emptyMessage')}</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <WorkspaceActivityCard
                key={card.workspace.id}
                card={card}
                onOpen={() => onOpenWorkspace(card.workspace)}
                onGoToTerminal={card.attentionTileId ? () => onGoToTerminal(card.workspace, card.attentionTileId) : null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
