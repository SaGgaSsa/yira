import React, { useState, useCallback, useRef, useEffect } from 'react'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  children?: React.ReactNode
  footer?: React.ReactNode
}

const SIDEBAR_MIN = 240
const SIDEBAR_MAX = 520
const SIDEBAR_DEFAULT = 280

export function Sidebar({ collapsed, onToggle, children, footer }: SidebarProps): React.ReactElement {
  const [width, setWidth] = useState(SIDEBAR_DEFAULT)
  const [resizing, setResizing] = useState(false)
  const resizeStartRef = useRef<{ x: number; w: number } | null>(null)

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setResizing(true)
      resizeStartRef.current = { x: e.clientX, w: width }
    },
    [width],
  )

  useEffect(() => {
    if (!resizing) return

    const handleMove = (e: MouseEvent) => {
      const start = resizeStartRef.current
      if (!start) return
      const dx = e.clientX - start.x
      const newWidth = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, start.w + dx))
      setWidth(newWidth)
    }

    const handleUp = () => {
      setResizing(false)
      resizeStartRef.current = null
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
    <aside
      className={`flex flex-col border-r border-border bg-bg-secondary overflow-hidden shrink-0 ${
        collapsed ? 'w-0 border-r-0' : ''
      }`}
      style={{ width: collapsed ? 0 : width }}
    >
      {/* Resize handle */}
      {!collapsed && (
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/30 transition-colors z-10"
          onMouseDown={handleResizeStart}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col" style={{ minWidth: collapsed ? 0 : SIDEBAR_MIN }}>
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-border">
            {footer}
          </div>
        )}
      </div>
    </aside>
  )
}
