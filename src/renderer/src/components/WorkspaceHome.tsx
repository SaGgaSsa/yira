import React, { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { WorkspaceMetadata } from '@shared/types'
import { filterWorkspacesByQuery, getWorkspaceLastUsedParts } from '@/utils/workspaceSidebarSections'

export interface WorkspaceHomeProps {
  /** All workspaces, already ordered by last use. */
  workspaces: readonly WorkspaceMetadata[]
  activeWorkspaceIds: ReadonlySet<string>
  now: number
  onSelectWorkspace: (workspace: WorkspaceMetadata) => void
  onCreateWorkspace: () => void
}

const LAST_USED_KEYS = {
  minute: 'workspaceHome.lastUsedMinute',
  hour: 'workspaceHome.lastUsedHour',
  day: 'workspaceHome.lastUsedDay',
  week: 'workspaceHome.lastUsedWeek',
} as const

export function WorkspaceHome({
  workspaces,
  activeWorkspaceIds,
  now,
  onSelectWorkspace,
  onCreateWorkspace,
}: WorkspaceHomeProps): React.ReactElement {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const visibleWorkspaces = useMemo(() => filterWorkspacesByQuery(workspaces, query), [query, workspaces])
  const searching = query.trim().length > 0

  return (
    <main className="h-full min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col justify-center gap-7 px-6 py-12">
        <header className="flex flex-col gap-3">
          <h1 className="nd-display text-4xl text-text-display">
            {t('workspaceHome.title')}
          </h1>
          <p className="text-sm text-text-secondary">{t('workspaceHome.subtitle')}</p>
        </header>

        <label className="relative block">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-disabled" />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Escape' && query) {
                event.preventDefault()
                setQuery('')
              }
              if (event.key === 'Enter' && searching && visibleWorkspaces[0]) {
                event.preventDefault()
                onSelectWorkspace(visibleWorkspaces[0])
              }
            }}
            placeholder={t('workspaceHome.searchPlaceholder')}
            aria-label={t('workspaceHome.searchPlaceholder')}
            className="w-full rounded-full border border-border-visible bg-bg-secondary py-3 pl-11 pr-4 text-sm text-text-display outline-hidden placeholder:text-text-disabled focus:border-text-secondary"
          />
        </label>

        {searching && visibleWorkspaces.length === 0 && (
          <p className="text-sm text-text-disabled">{t('workspaceHome.noResults')}</p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visibleWorkspaces.map((workspace) => {
            const lastUsed = getWorkspaceLastUsedParts(workspace.lastSelectedAt, now)
            const lastUsedKey = lastUsed
              ? LAST_USED_KEYS[lastUsed.unit]
              : null

            return (
              <button
                key={workspace.id}
                type="button"
                onClick={() => onSelectWorkspace(workspace)}
                title={workspace.name}
                className="flex min-h-28 min-w-0 flex-col gap-3 rounded-2xl border border-border bg-bg-secondary p-4 text-left transition-colors hover:bg-hover-bg focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--interactive)"
              >
                <span className="flex min-w-0 items-start justify-between gap-3">
                  <span className="min-w-0 truncate text-base text-text-display">{workspace.name}</span>
                  {activeWorkspaceIds.has(workspace.id) ? (
                    <span className="nd-caption shrink-0 pt-0.5 text-text-secondary">
                      {t('workspaceHome.active')}
                    </span>
                  ) : lastUsed && lastUsedKey && (
                    <span className="nd-caption shrink-0 pt-0.5 text-text-muted">
                      {t(lastUsedKey, { count: lastUsed.value })}
                    </span>
                  )}
                </span>
                {workspace.config.rootFolderPath && (
                  <span
                    className="mt-auto block w-full truncate font-mono text-xs text-text-disabled"
                    title={workspace.config.rootFolderPath}
                  >
                    {workspace.config.rootFolderPath}
                  </span>
                )}
              </button>
            )
          })}

          {!searching && (
            <button
              type="button"
              onClick={onCreateWorkspace}
              className="flex min-h-28 min-w-0 flex-col items-start justify-center gap-3 rounded-2xl border border-dashed border-border-visible bg-transparent p-4 text-left transition-colors hover:bg-hover-bg focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--interactive)"
            >
              <span className="flex items-center gap-2 text-text-display">
                <Plus size={16} aria-hidden="true" />
                <span className="text-base">{t('workspaceHome.newProject')}</span>
              </span>
              <span className="text-sm text-text-secondary">{t('workspaceHome.newProjectDescription')}</span>
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
