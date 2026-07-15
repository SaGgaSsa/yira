import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Settings, Crosshair, Grid3X3, LayoutGrid, Columns, PanelLeft, PanelRight, SplitSquareHorizontal, SplitSquareVertical, ClipboardList } from 'lucide-react'
import type { SplitOrientation, ViewMode, WorkspaceType } from '@shared/types'

interface TopBarProps {
  zoom: number
  viewMode: ViewMode
  splitOrientation: SplitOrientation
  workspaceType: WorkspaceType
  boardEnabled: boolean
  boardReviewCount: number
  canSplitView: boolean
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
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
      className={`nd-label inline-flex h-8 items-center gap-1.5 rounded-full px-3 transition-colors ${
        active
          ? 'bg-text-primary text-bg-primary'
          : 'text-text-secondary hover:bg-hover-bg hover:text-text-primary'
      } disabled:cursor-not-allowed disabled:opacity-40`}
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
    >
      <Icon size={13} />
      <span>{label}</span>
      {badgeLabel && (
        <span
          className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-current px-1.5 font-mono text-[10px] leading-none"
          title={`${badgeCount} board ${badgeCount === 1 ? 'task' : 'tasks'} waiting for review`}
        >
          {badgeLabel}
        </span>
      )}
    </button>
  )
}

export function TopBar({
  zoom,
  viewMode,
  splitOrientation,
  workspaceType,
  boardEnabled,
  boardReviewCount,
  canSplitView,
  sidebarCollapsed,
  onToggleSidebar,
  hasWorkspacePanel,
  workspacePanelOpen,
  onToggleWorkspacePanel,
  onSetViewMode,
  onFitToContent,
  onZoomToggle,
  onOpenSettings,
}: TopBarProps): React.ReactElement {
  const headerRef = useRef<HTMLElement>(null)
  const [viewSelectorTop, setViewSelectorTop] = useState<number | null>(null)
  const zoomPercent = Math.round(zoom * 100)
  const SplitIcon = splitOrientation === 'horizontal' ? SplitSquareVertical : SplitSquareHorizontal
  const isGridWorkspace = workspaceType === 'grid'

  const updateViewSelectorPosition = () => {
    const header = headerRef.current
    if (!header) return

    const { top, height } = header.getBoundingClientRect()
    const nextTop = top + height / 2
    setViewSelectorTop((currentTop) => currentTop === nextTop ? currentTop : nextTop)
  }

  useLayoutEffect(() => {
    updateViewSelectorPosition()
  })

  useEffect(() => {
    const header = headerRef.current
    if (!header) return

    const observer = new ResizeObserver(updateViewSelectorPosition)
    observer.observe(header)
    window.addEventListener('resize', updateViewSelectorPosition)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateViewSelectorPosition)
    }
  }, [])

  const viewSelector = (
    <div
      className="fixed left-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-border-visible bg-bg-secondary px-1.5"
      style={{
        top: viewSelectorTop ?? 0,
        height: 'var(--app-chrome-control-height)',
      }}
    >
      <SegmentedButton
        active={viewMode === 'fullview'}
        label="Focus"
        icon={Columns}
        onClick={() => onSetViewMode('fullview')}
      />
      {isGridWorkspace ? (
        <SegmentedButton
          active={viewMode === 'gridview'}
          label="Grid"
          title={viewMode === 'gridview' ? 'Switch to Canvas' : 'Grid'}
          icon={Grid3X3}
          onClick={() => onSetViewMode(viewMode === 'gridview' ? 'canvas' : 'gridview')}
        />
      ) : (
        <>
          <SegmentedButton
            active={viewMode === 'splitview'}
            label="Split"
            title={splitOrientation === 'horizontal' ? 'Split top/bottom' : 'Split left/right'}
            icon={SplitIcon}
            onClick={() => onSetViewMode('splitview')}
            disabled={!canSplitView}
          />
          <SegmentedButton
            active={viewMode === 'canvas'}
            label="Canvas"
            title={viewMode === 'canvas' ? 'Switch to Grid' : 'Canvas'}
            icon={LayoutGrid}
            onClick={() => onSetViewMode(viewMode === 'canvas' ? 'gridview' : 'canvas')}
          />
        </>
      )}
      {boardEnabled && (
        <SegmentedButton
          active={viewMode === 'board'}
          label="Board"
          icon={ClipboardList}
          badgeCount={boardReviewCount}
          onClick={() => onSetViewMode('board')}
        />
      )}
    </div>
  )

  return (
    <>
      <header ref={headerRef} className="nd-panel app-chrome-row relative flex shrink-0 items-center justify-between border-x-0 border-t-0 px-6">
        <button
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-visible bg-bg-secondary text-text-secondary transition-colors hover:text-text-display"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? 'Open sidebar' : 'Collapse sidebar'}
        >
          <PanelLeft size={16} />
        </button>

        <div className="flex items-center gap-3">
          {!isGridWorkspace && (
            <>
              <div className="nd-panel-raised flex h-10 items-center gap-1 rounded-full px-1">
                <button
                  className="nd-label inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={onFitToContent}
                  disabled={viewMode !== 'canvas'}
                  title="Show all tiles"
                >
                  <Columns size={13} />
                  <span>Show All</span>
                </button>
              </div>

              <button
                className="nd-panel-raised inline-flex h-10 items-center gap-2 rounded-full px-3 text-text-secondary transition-colors hover:text-text-primary"
                onClick={onZoomToggle}
                title="Toggle zoom 100%"
              >
                <Crosshair size={14} />
                <span className="font-mono text-sm text-text-display">{zoomPercent}%</span>
              </button>
            </>
          )}

          {hasWorkspacePanel && (
            <button
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-visible bg-bg-secondary text-text-secondary transition-colors hover:text-text-display ${workspacePanelOpen ? 'text-text-display' : ''}`}
              onClick={onToggleWorkspacePanel}
              title={workspacePanelOpen ? 'Hide workspace panel' : 'Show workspace panel'}
            >
              <PanelRight size={16} />
            </button>
          )}

          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-visible bg-bg-secondary text-text-secondary transition-colors hover:text-text-display"
            onClick={onOpenSettings}
            title="Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      {viewSelectorTop !== null && createPortal(viewSelector, document.body)}
    </>
  )
}
