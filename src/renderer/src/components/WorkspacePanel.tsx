import React, { useCallback, useEffect, useRef, useState } from 'react'
import { WorkspaceExplorer } from './WorkspaceExplorer'

const PANEL_MIN = 300
const PANEL_MAX = 560
const PANEL_DEFAULT = 344

type WorkspacePanelTab = 'explorer' | 'agents' | 'source-control'

interface WorkspacePanelProps {
  rootPath: string
}

export function WorkspacePanel({ rootPath }: WorkspacePanelProps): React.ReactElement {
  const [width, setWidth] = useState(PANEL_DEFAULT)
  const [resizing, setResizing] = useState(false)
  const [tab, setTab] = useState<WorkspacePanelTab>('explorer')
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null)

  const handleResizeStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    resizeStartRef.current = { x: event.clientX, width }
    setResizing(true)
  }, [width])

  useEffect(() => {
    if (!resizing) return

    const handleMove = (event: MouseEvent) => {
      const start = resizeStartRef.current
      if (!start) return
      setWidth(Math.max(PANEL_MIN, Math.min(PANEL_MAX, start.width - (event.clientX - start.x))))
    }
    const handleUp = () => {
      resizeStartRef.current = null
      setResizing(false)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [resizing])

  return (
    <aside className="relative flex min-h-0 shrink-0 flex-col border-l border-border bg-bg-secondary" style={{ width, minWidth: PANEL_MIN }}>
      <div className="absolute bottom-0 left-0 top-0 z-10 w-2 cursor-col-resize" onMouseDown={handleResizeStart}>
        <div className="absolute bottom-8 left-0 top-8 w-px bg-border-visible" />
      </div>
      <div className="flex shrink-0 border-b border-border px-2">
        {([
          ['explorer', 'Explorer'],
          ['agents', 'Agents'],
          ['source-control', 'Source Control'],
        ] as Array<[WorkspacePanelTab, string]>).map(([id, label]) => (
          <button
            key={id}
            className={`nd-label border-b-2 px-3 py-3 transition-colors ${tab === id ? 'border-text-display text-text-display' : 'border-transparent text-text-secondary hover:text-text-display'}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">{tab === 'explorer' && <WorkspaceExplorer rootPath={rootPath} />}</div>
    </aside>
  )
}
