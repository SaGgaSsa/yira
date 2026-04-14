import React from 'react'
import { Settings, ZoomIn, LayoutGrid, Columns, Rows, Table, PanelLeft } from 'lucide-react'

interface TopBarProps {
  zoom: number
  viewMode: 'canvas' | 'fullview'
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  onSetViewMode: (mode: 'canvas' | 'fullview') => void
  onArrangeGrid: () => void
  onArrangeColumns: () => void
  onArrangeRows: () => void
  onZoomToggle: () => void
  onOpenSettings: () => void
}

export function TopBar({
  zoom,
  viewMode,
  sidebarCollapsed,
  onToggleSidebar,
  onSetViewMode,
  onArrangeGrid,
  onArrangeColumns,
  onArrangeRows,
  onZoomToggle,
  onOpenSettings,
}: TopBarProps): React.ReactElement {
  const zoomPercent = Math.round(zoom * 100)

  return (
    <header className="relative w-full flex items-center px-3 py-1.5 border-b border-border bg-bg-secondary shrink-0 h-9">
      {/* Left: sidebar toggle */}
      <div className="flex items-center justify-start">
        <button
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-hover-bg transition-colors"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? 'Open sidebar' : 'Collapse sidebar'}
        >
          <PanelLeft size={14} />
        </button>
      </div>

      {/* Center: view modes */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 rounded bg-bg-primary border border-border-subtle">
        <button
          className={`flex items-center gap-1 px-1.5 py-1 rounded text-xs transition-colors hover:bg-hover-bg ${
            viewMode === 'canvas' ? 'text-accent' : 'text-text-muted hover:text-text-primary'
          }`}
          onClick={() => onSetViewMode('canvas')}
          title="Canvas view"
        >
          <LayoutGrid size={13} />
        </button>
        <button
          className={`flex items-center gap-1 px-1.5 py-1 rounded text-xs transition-colors hover:bg-hover-bg ${
            viewMode === 'fullview' ? 'text-accent' : 'text-text-muted hover:text-text-primary'
          }`}
          onClick={() => onSetViewMode('fullview')}
          title="Tabbed fullview"
        >
          <Columns size={13} />
        </button>
        <button
          className="flex items-center gap-1 px-1.5 py-1 rounded text-xs text-text-muted hover:text-text-primary hover:bg-hover-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          disabled
          title="Split view — coming soon"
        >
          <Table size={13} />
        </button>
        <button
          className="flex items-center gap-1 px-1.5 py-1 rounded text-xs text-text-muted hover:text-text-primary hover:bg-hover-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          disabled
          title="Stack view — coming soon"
        >
          <Rows size={13} />
        </button>
      </div>

      {/* Right: zoom + settings */}
      <div className="ml-auto flex items-center justify-end gap-3">
        <div className="flex items-center gap-1 rounded border border-border-subtle bg-bg-primary px-1 py-0.5">
          <button
            className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary disabled:opacity-40"
            onClick={onArrangeGrid}
            disabled={viewMode !== 'canvas'}
            title="Arrange in grid"
          >
            <Table size={13} />
          </button>
          <button
            className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary disabled:opacity-40"
            onClick={onArrangeColumns}
            disabled={viewMode !== 'canvas'}
            title="Arrange in columns"
          >
            <Columns size={13} />
          </button>
          <button
            className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary disabled:opacity-40"
            onClick={onArrangeRows}
            disabled={viewMode !== 'canvas'}
            title="Arrange in rows"
          >
            <Rows size={13} />
          </button>
        </div>

        <button
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium tabular-nums hover:bg-hover-bg transition-colors"
          onClick={onZoomToggle}
          title="Toggle zoom 100%"
        >
          <ZoomIn size={13} />
          <span className={zoomPercent === 100 ? 'text-accent' : 'text-text-secondary'}>
            {zoomPercent}%
          </span>
        </button>

        <button
          className="flex items-center gap-1.5 px-2 py-1 rounded text-text-secondary hover:text-text-primary hover:bg-hover-bg transition-colors"
          onClick={onOpenSettings}
          title="Settings"
        >
          <Settings size={14} />
        </button>
      </div>
    </header>
  )
}
