import React from 'react'
import { Settings, Grid3x3, LayoutGrid, Columns2, PanelLeft, PanelRight, SquareSplitHorizontal, SquareSplitVertical, ClipboardList, Activity, RectangleVertical } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AgentProvider, AgentUsageSnapshot, SplitOrientation, ViewMode, WorkspaceConfig, WorkspaceType } from '@shared/types'
import type { MainView } from '../utils/layoutState'
import { AgentUsageIndicator } from './AgentUsageIndicator'
import { WorkspaceRunControl } from './WorkspaceRunControl'
import { TileLauncher, type TileLauncherProps } from './TileLauncher'
import { WorkspaceSwitcher, type WorkspaceSwitcherProps } from './WorkspaceSwitcher'
import { ZenTimerControl } from './ZenTimerControl'
import { useSettingsStore } from '@/store/settingsStore'

interface TopBarProps {
  hasWorkspace: boolean
  workspaceId?: string
  workspaceName: string
  workspaceConfig: WorkspaceConfig
  onEditWorkspaceScripts: () => void
  onSaveWorkspaceCommand: (command: string) => Promise<void>
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
  mainView: MainView
  onToggleActivity: () => void
  /** Focus view limits terminals to the reading column. */
  readingMode: boolean
  agentProvider?: AgentProvider
  agentUsage: AgentUsageSnapshot | null
  hasWorkspacePanel: boolean
  workspacePanelOpen: boolean
  onToggleWorkspacePanel: () => void
  tileLauncher: TileLauncherProps
  workspaceSwitcher: WorkspaceSwitcherProps
  onSetViewMode: (mode: ViewMode) => void
  onFitToContent: () => void
  onZoomToggle: () => void
  onOpenSettings: () => void
  onOpenZenWorkspace?: (workspaceId: string) => void
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
  workspaceId,
  workspaceName,
  workspaceConfig,
  onEditWorkspaceScripts,
  onSaveWorkspaceCommand,
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
  mainView,
  onToggleActivity,
  readingMode,
  agentProvider,
  agentUsage,
  hasWorkspacePanel,
  workspacePanelOpen,
  onToggleWorkspacePanel,
  tileLauncher,
  workspaceSwitcher,
  onSetViewMode,
  onFitToContent,
  onZoomToggle,
  onOpenSettings,
  onOpenZenWorkspace,
}: TopBarProps): React.ReactElement {
  const { t } = useTranslation()
  const agents = useSettingsStore((state) => state.agents)
  const zoomPercent = Math.round(zoom * 100)
  const SplitIcon = splitOrientation === 'horizontal' ? SquareSplitVertical : SquareSplitHorizontal
  const isGridWorkspace = workspaceType === 'grid'
  const activityOpen = mainView === 'activity'
  const homeOpen = mainView === 'home'
  // With Activity or Home on top, no view button is selected and the tile controls are hidden.
  const overlayOpen = mainView !== 'workspace'
  const focusActive = !overlayOpen && viewMode === 'fullview'
  const FocusIcon = readingMode ? RectangleVertical : Columns2
  const tileViewOpen = !overlayOpen && viewMode !== 'board'
  const settingsButton = (
    <button
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
      onClick={onOpenSettings}
      title={t('common.settings')}
      aria-label={t('common.settings')}
    >
      <Settings size={14} />
    </button>
  )

  return (
    <header className="window-titlebar nd-panel relative flex shrink-0 items-center border-x-0 border-t-0">
      {/* Settings stay reachable before any workspace is open. */}
      {!hasWorkspace && <div className="ml-auto flex items-center">{settingsButton}</div>}
      {hasWorkspace && (
        <>
          <div className="flex max-w-[calc(50%-16rem)] items-center gap-1 overflow-hidden">
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
            {agentProvider && agents[agentProvider]?.enabled && <AgentUsageIndicator provider={agentProvider} snapshot={agentUsage?.[agentProvider]} />}
          </div>

          <div className="absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-md border border-border-visible bg-bg-secondary px-0.5 top-1/2">
            {/* Anchored before the switcher so the centered view buttons never move. */}
            <div className="absolute right-full top-1/2 mr-1.5 -translate-y-1/2">
              <WorkspaceSwitcher {...workspaceSwitcher} />
            </div>
            <SegmentedButton
              active={focusActive}
              label={t('shortcuts.focus')}
              title={readingMode ? t('ui.focusReading') : undefined}
              icon={FocusIcon}
              onClick={() => onSetViewMode('fullview')}
            />
            <SegmentedButton
              active={!overlayOpen && viewMode === 'splitview'}
              label={t('shortcuts.split')}
              title={splitOrientation === 'horizontal' ? 'Split top/bottom' : 'Split left/right'}
              icon={SplitIcon}
              onClick={() => onSetViewMode('splitview')}
              disabled={!canSplitView}
            />
            {isGridWorkspace ? (
              <SegmentedButton
                active={!overlayOpen && viewMode === 'gridview'}
                label={t('shortcuts.grid')}
                title={viewMode === 'gridview' ? t('workspace.canvas') : t('shortcuts.grid')}
                icon={Grid3x3}
                onClick={() => onSetViewMode(viewMode === 'gridview' && !overlayOpen ? 'canvas' : 'gridview')}
              />
            ) : (
              <SegmentedButton
                active={!overlayOpen && viewMode === 'canvas'}
                label={t('shortcuts.canvas')}
                title={viewMode === 'canvas' ? t('shortcuts.grid') : t('shortcuts.canvas')}
                icon={LayoutGrid}
                onClick={() => onSetViewMode(viewMode === 'canvas' && !overlayOpen ? 'gridview' : 'canvas')}
              />
            )}
            {boardEnabled && boardVisible && (
              <SegmentedButton
                active={!overlayOpen && viewMode === 'board'}
                label={t('tile.board')}
                icon={ClipboardList}
                badgeCount={boardReviewCount}
                onClick={() => onSetViewMode('board')}
              />
            )}
            {/* Anchored past the switcher so expanding it never shifts the centered buttons. */}
            {tileViewOpen && (
              <div className="absolute left-full top-1/2 ml-1.5 -translate-y-1/2">
                <TileLauncher {...tileLauncher} />
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center justify-end gap-1">
            <ZenTimerControl
              workspaceId={workspaceId ?? null}
              onOpenWorkspace={onOpenZenWorkspace ?? (() => {})}
            />
            {!isGridWorkspace && !overlayOpen && (
              <>
                <button
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={onFitToContent}
                  disabled={viewMode !== 'canvas'}
                  title={t('canvas.showAll')}
                  aria-label={t('canvas.showAll')}
                >
                  <Columns2 size={14} />
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

            {/* Scripts belong to the active workspace, so the control stays available in Agents View. */}
            {workspaceId && !activityOpen && (
              <WorkspaceRunControl
                workspaceId={workspaceId}
                workspaceName={workspaceName}
                workspaceConfig={workspaceConfig}
                onEditCommands={() => onEditWorkspaceScripts()}
                onSaveCommand={onSaveWorkspaceCommand}
              />
            )}

            {hasWorkspacePanel && !activityOpen && !homeOpen && (
              <button
                className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display ${workspacePanelOpen ? 'text-text-display' : ''}`}
                onClick={onToggleWorkspacePanel}
                title={workspacePanelOpen ? 'Hide workspace panel' : 'Show workspace panel'}
                aria-label={workspacePanelOpen ? 'Hide workspace panel' : 'Show workspace panel'}
              >
                <PanelRight size={14} />
              </button>
            )}

            {settingsButton}
          </div>
        </>
      )}
    </header>
  )
}
