import React from 'react'
import { Settings, Grid3X3, LayoutGrid, Columns, PanelLeft, PanelRight, SplitSquareHorizontal, SplitSquareVertical, ClipboardList, Activity, Bot } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AgentProvider, AgentUsageSnapshot, SplitOrientation, ViewMode, WorkspaceType } from '@shared/types'
import { AgentUsageIndicator } from './AgentUsageIndicator'
import { useSettingsStore } from '@/store/settingsStore'

interface TopBarProps {
  hasWorkspace: boolean
  zoom: number
  viewMode: ViewMode
  splitOrientation: SplitOrientation
  workspaceType: WorkspaceType
  boardEnabled: boolean
  boardVisible: boolean
  boardReviewCount: number
  canSplitView: boolean
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  activityOpen: boolean
  onToggleActivity: () => void
  agentsViewAvailable: boolean
  agentsViewOpen: boolean
  agentSessionCount: number
  agentAttentionCount: number
  onToggleAgentsView: () => void
  agentProvider?: AgentProvider
  agentUsage: AgentUsageSnapshot | null
  hasWorkspacePanel: boolean
  workspacePanelOpen: boolean
  onToggleWorkspacePanel: () => void
  onSetViewMode: (mode: ViewMode) => void
  onFitToContent: () => void
  onZoomToggle: () => void
  onOpenSettings: () => void
}

function SegmentedButton({
  active,
  label,
  title,
  icon: Icon,
  badgeCount = 0,
  onClick,
  disabled = false,
}: {
  active?: boolean
  label: string
  title?: string
  icon: typeof LayoutGrid
  badgeCount?: number
  onClick: () => void
  disabled?: boolean
}) {
  const badgeLabel = badgeCount > 0 ? (badgeCount > 9 ? '9+' : String(badgeCount)) : null

  return (
    <button
      className={`relative inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
        active
          ? 'bg-text-primary text-text-inverse'
          : 'text-text-secondary hover:bg-hover-bg hover:text-text-primary'
      } disabled:cursor-not-allowed disabled:opacity-40`}
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={label}
    >
      <Icon size={14} />
      {badgeLabel && (
        <span
          className="absolute -right-1 -top-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-current bg-bg-secondary px-0.5 font-mono text-[8px] leading-none"
          title={`${badgeCount} board ${badgeCount === 1 ? 'task' : 'tasks'} waiting for review`}
        >
          {badgeLabel}
        </span>
      )}
    </button>
  )
}

export function TopBar({
  hasWorkspace,
  zoom,
  viewMode,
  splitOrientation,
  workspaceType,
  boardEnabled,
  boardVisible,
  boardReviewCount,
  canSplitView,
  sidebarCollapsed,
  onToggleSidebar,
  activityOpen,
  onToggleActivity,
  agentsViewAvailable,
  agentsViewOpen,
  agentSessionCount,
  agentAttentionCount,
  onToggleAgentsView,
  agentProvider,
  agentUsage,
  hasWorkspacePanel,
  workspacePanelOpen,
  onToggleWorkspacePanel,
  onSetViewMode,
  onFitToContent,
  onZoomToggle,
  onOpenSettings,
}: TopBarProps): React.ReactElement {
  const { t } = useTranslation()
  const agents = useSettingsStore((state) => state.agents)
  const zoomPercent = Math.round(zoom * 100)
  const SplitIcon = splitOrientation === 'horizontal' ? SplitSquareVertical : SplitSquareHorizontal
  const isGridWorkspace = workspaceType === 'grid'

  return (
    <header className="window-titlebar nd-panel relative flex shrink-0 items-center border-x-0 border-t-0">
      {hasWorkspace && (
        <>
          <div className="flex max-w-[calc(50%-6rem)] items-center gap-1 overflow-hidden">
            <button
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
              onClick={onToggleSidebar}
              title={sidebarCollapsed ? t('sidebar.open') : t('sidebar.collapse')}
              aria-label={sidebarCollapsed ? t('sidebar.open') : t('sidebar.collapse')}
            >
              <PanelLeft size={14} />
            </button>
            <button
              className={`relative inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                activityOpen
                  ? 'bg-text-primary text-text-inverse'
                  : 'text-text-secondary hover:bg-hover-bg hover:text-text-primary'
              }`}
              onClick={onToggleActivity}
              title={t('activity.activity')}
              aria-label={t('activity.activity')}
              aria-pressed={activityOpen}
            >
              <Activity size={14} />
            </button>
            {agentsViewAvailable && (
              <button
                className={`relative inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-xs transition-colors ${
                  agentsViewOpen
                    ? 'bg-text-primary text-text-inverse'
                    : 'text-text-secondary hover:bg-hover-bg hover:text-text-primary'
                }`}
                onClick={onToggleAgentsView}
                title={agentAttentionCount > 0
                  ? `${t('agentsView.openAgentsView', { count: agentSessionCount })} · ${t('agentsView.needsAttention', { count: agentAttentionCount })}`
                  : t('agentsView.openAgentsView', { count: agentSessionCount })}
                aria-label={t('agentsView.openAgentsView', { count: agentSessionCount })}
                aria-pressed={agentsViewOpen}
              >
                <Bot size={14} aria-hidden="true" />
                <span className="font-mono text-[10px]">{agentSessionCount}</span>
                {agentAttentionCount > 0 && (
                  <span
                    className="absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-bg-primary bg-warning"
                    title={t('agentsView.needsAttention', { count: agentAttentionCount })}
                    aria-hidden="true"
                  />
                )}
              </button>
            )}
            {agentProvider && agents[agentProvider]?.enabled && <AgentUsageIndicator provider={agentProvider} snapshot={agentUsage?.[agentProvider]} />}
          </div>

          <div className="absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-md border border-border-visible bg-bg-secondary px-0.5 top-1/2">
            <SegmentedButton
              active={viewMode === 'fullview'}
              label={t('shortcuts.focus')}
              icon={Columns}
              onClick={() => onSetViewMode('fullview')}
            />
            <SegmentedButton
              active={viewMode === 'splitview'}
              label={t('shortcuts.split')}
              title={splitOrientation === 'horizontal' ? 'Split top/bottom' : 'Split left/right'}
              icon={SplitIcon}
              onClick={() => onSetViewMode('splitview')}
              disabled={!canSplitView}
            />
            {isGridWorkspace ? (
              <SegmentedButton
                active={viewMode === 'gridview'}
                label={t('shortcuts.grid')}
                title={viewMode === 'gridview' ? t('workspace.canvas') : t('shortcuts.grid')}
                icon={Grid3X3}
                onClick={() => onSetViewMode(viewMode === 'gridview' ? 'canvas' : 'gridview')}
              />
            ) : (
              <SegmentedButton
                active={viewMode === 'canvas'}
                label={t('shortcuts.canvas')}
                title={viewMode === 'canvas' ? t('shortcuts.grid') : t('shortcuts.canvas')}
                icon={LayoutGrid}
                onClick={() => onSetViewMode(viewMode === 'canvas' ? 'gridview' : 'canvas')}
              />
            )}
            {boardEnabled && boardVisible && (
              <SegmentedButton
                active={viewMode === 'board'}
                label={t('tile.board')}
                icon={ClipboardList}
                badgeCount={boardReviewCount}
                onClick={() => onSetViewMode('board')}
              />
            )}
          </div>

          <div className="ml-auto flex items-center justify-end gap-1">
            {!isGridWorkspace && !activityOpen && !agentsViewOpen && (
              <>
                <button
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={onFitToContent}
                  disabled={viewMode !== 'canvas'}
                  title={t('canvas.showAll')}
                  aria-label={t('canvas.showAll')}
                >
                  <Columns size={14} />
                </button>
                <button
                  className="inline-flex h-7 items-center rounded-md px-1.5 font-mono text-xs text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
                  onClick={onZoomToggle}
                  title={t('ui.toggleZoom')}
                >
                  {zoomPercent}%
                </button>
              </>
            )}

            {hasWorkspacePanel && !activityOpen && !agentsViewOpen && (
              <button
                className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display ${workspacePanelOpen ? 'text-text-display' : ''}`}
                onClick={onToggleWorkspacePanel}
                title={workspacePanelOpen ? 'Hide workspace panel' : 'Show workspace panel'}
                aria-label={workspacePanelOpen ? 'Hide workspace panel' : 'Show workspace panel'}
              >
                <PanelRight size={14} />
              </button>
            )}

            <button
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
              onClick={onOpenSettings}
              title={t('common.settings')}
              aria-label={t('common.settings')}
            >
              <Settings size={14} />
            </button>
          </div>
        </>
      )}
    </header>
  )
}
