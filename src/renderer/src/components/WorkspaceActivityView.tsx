import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkspaceMetadata } from '@shared/types'
import type { TerminalActivityStatus } from '@/utils/terminalActivity'
import { hasWorkspaceActivityAttention, type WorkspaceActivityCardData } from '@/utils/workspaceActivity'
import { WorkspaceActivityCard } from './WorkspaceActivityCard'

export type WorkspaceActivityStatusFilter = 'all' | TerminalActivityStatus

const STATUS_FILTERS: WorkspaceActivityStatusFilter[] = ['all', 'needs-input', 'working', 'unread', 'done', 'idle']

export interface WorkspaceActivityViewProps {
  cards: readonly WorkspaceActivityCardData[]
  onOpenWorkspace: (workspace: WorkspaceMetadata) => void
  onGoToTerminal: (workspace: WorkspaceMetadata, tileId: string | null) => void
  onClose: () => void
}

export type WorkspaceActivityListState = 'empty' | 'no-results' | 'cards'

export function resolveActivityListState(
  totalCards: number,
  visibleCards: number,
): WorkspaceActivityListState {
  if (totalCards === 0) return 'empty'
  if (visibleCards === 0) return 'no-results'
  return 'cards'
}

export function filterWorkspaceActivityCards(
  cards: readonly WorkspaceActivityCardData[],
  search: string,
  status: WorkspaceActivityStatusFilter,
): WorkspaceActivityCardData[] {
  const query = search.trim().toLowerCase()
  return cards.filter((card) => {
    if (status !== 'all' && card.activity.status !== status) return false
    if (query && !card.workspace.name.toLowerCase().includes(query)) return false
    return true
  })
}

export function WorkspaceActivityView({
  cards,
  onOpenWorkspace,
  onGoToTerminal,
  onClose,
}: WorkspaceActivityViewProps): React.ReactElement {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<WorkspaceActivityStatusFilter>('all')

  const attentionCount = useMemo(() => cards.filter(hasWorkspaceActivityAttention).length, [cards])
  const visibleCards = useMemo(
    () => filterWorkspaceActivityCards(cards, search, statusFilter),
    [cards, search, statusFilter],
  )
  const listState = resolveActivityListState(cards.length, visibleCards.length)
  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg-primary" data-activity-view="true">
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="nd-label text-text-primary">{t('activity.title')}</h2>
            <p className="mt-1 text-sm text-text-secondary">
              {t('activity.summary', { active: cards.length, attention: attentionCount })}
            </p>
          </div>
          <button
            className="inline-flex h-8 items-center rounded-full border border-border px-4 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
            onClick={onClose}
            type="button"
          >
            {t('common.back')}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-bg-secondary px-3 text-sm text-text-primary placeholder:text-text-secondary"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('activity.searchPlaceholder')}
            aria-label={t('activity.searchPlaceholder')}
            type="search"
          />
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <span>{t('activity.filterStatus')}</span>
            <select
              className="h-8 rounded-md border border-border bg-bg-secondary px-2 text-sm text-text-primary"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as WorkspaceActivityStatusFilter)}
              aria-label={t('activity.filterStatus')}
            >
              {STATUS_FILTERS.map((filter) => (
                <option key={filter} value={filter}>
                  {filter === 'all' ? t('activity.filterAll') : t(`terminalActivity.${filter}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {listState === 'empty' ? (
          <div className="nd-panel-raised rounded-[20px] px-5 py-8 text-center" data-activity-empty="true">
            <div className="nd-label text-text-primary">{t('activity.emptyTitle')}</div>
            <div className="mt-3 text-sm text-text-secondary">{t('activity.emptyMessage')}</div>
          </div>
        ) : listState === 'no-results' ? (
          <div className="nd-panel-raised rounded-[20px] px-5 py-8 text-center" data-activity-no-results="true">
            <div className="nd-label text-text-primary">{t('activity.noResultsTitle')}</div>
            <div className="mt-3 text-sm text-text-secondary">{t('activity.noResultsMessage')}</div>
            <button
              className="mt-4 inline-flex h-8 items-center rounded-full border border-border px-4 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
              onClick={clearFilters}
              type="button"
            >
              {t('activity.clearFilters')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleCards.map((card) => (
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
