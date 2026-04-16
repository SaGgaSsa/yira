import React from 'react'
import { Settings, Crosshair, LayoutGrid, Columns, PanelLeft } from 'lucide-react'

interface TopBarProps {
  zoom: number
  viewMode: 'canvas' | 'fullview'
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  onSetViewMode: (mode: 'canvas' | 'fullview') => void
  onFitToContent: () => void
  onZoomToggle: () => void
  onOpenSettings: () => void
}

function SegmentedButton({
  active,
  label,
  icon: Icon,
  onClick,
  disabled = false,
}: {
  active?: boolean
  label: string
  icon: typeof LayoutGrid
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      className={`nd-label inline-flex h-9 items-center gap-2 rounded-full px-4 transition-colors ${
        active
          ? 'bg-text-primary text-bg-primary'
          : 'text-text-secondary hover:bg-hover-bg hover:text-text-primary'
      } disabled:cursor-not-allowed disabled:opacity-40`}
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  )
}

export function TopBar({
  zoom,
  viewMode,
  sidebarCollapsed,
  onToggleSidebar,
  onSetViewMode,
  onFitToContent,
  onZoomToggle,
  onOpenSettings,
}: TopBarProps): React.ReactElement {
  const zoomPercent = Math.round(zoom * 100)

  return (
    <header className="nd-panel flex h-[84px] shrink-0 items-center justify-between border-x-0 border-t-0 px-6">
      <button
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border-visible bg-bg-secondary text-text-secondary transition-colors hover:text-text-display"
        onClick={onToggleSidebar}
        title={sidebarCollapsed ? 'Open sidebar' : 'Collapse sidebar'}
      >
        <PanelLeft size={18} />
      </button>

      <div className="flex items-center gap-3 rounded-full border border-border-visible bg-bg-secondary px-2 py-2">
        <SegmentedButton
          active={viewMode === 'fullview'}
          label="Focus"
          icon={Columns}
          onClick={() => onSetViewMode('fullview')}
        />
        <SegmentedButton
          active={viewMode === 'canvas'}
          label="Canvas"
          icon={LayoutGrid}
          onClick={() => onSetViewMode('canvas')}
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="nd-panel-raised flex items-center gap-1 rounded-full px-2 py-2">
          <button
            className="nd-label inline-flex h-9 items-center gap-2 rounded-full px-3 text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            onClick={onFitToContent}
            disabled={viewMode !== 'canvas'}
            title="Show all tiles"
          >
            <Columns size={13} />
            <span>Show All</span>
          </button>
        </div>

        <button
          className="nd-panel-raised inline-flex h-11 items-center gap-3 rounded-full px-4 text-text-secondary transition-colors hover:text-text-primary"
          onClick={onZoomToggle}
          title="Toggle zoom 100%"
        >
          <Crosshair size={16} />
          <span className="nd-label text-text-secondary">Zoom</span>
          <span className="font-mono text-sm text-text-display">{zoomPercent}%</span>
        </button>

        <button
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border-visible bg-bg-secondary text-text-secondary transition-colors hover:text-text-display"
          onClick={onOpenSettings}
          title="Settings"
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  )
}
