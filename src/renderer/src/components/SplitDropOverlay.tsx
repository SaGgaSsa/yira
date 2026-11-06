import React, { useEffect, useState } from 'react'
import type { SplitOrientation, SplitPanelId } from '@shared/types'

interface SplitDropOverlayProps {
  orientation: SplitOrientation
  onDropInPanel: (panel: SplitPanelId) => void
  onCancel: () => void
}

export function SplitDropOverlay({
  orientation,
  onDropInPanel,
  onCancel,
}: SplitDropOverlayProps): React.ReactElement {
  const [hoveredPanel, setHoveredPanel] = useState<SplitPanelId | null>(null)

  useEffect(() => {
    // A row that disappears mid-drag never fires dragend on window, so pointerdown on the root cancels too.
    window.addEventListener('dragend', onCancel, true)
    return () => window.removeEventListener('dragend', onCancel, true)
  }, [onCancel])

  return (
    <div
      className={`absolute inset-0 z-50 flex ${orientation === 'horizontal' ? 'flex-col' : 'flex-row'}`}
      onPointerDown={onCancel}
    >
      {(['left', 'right'] as const).map((panel) => (
        <div
          key={panel}
          data-split-drop-zone={panel}
          className={`min-w-0 min-h-0 flex-1 border-2 transition-colors ${
            hoveredPanel === panel
              ? 'border-accent bg-accent/15'
              : 'border-border-visible bg-transparent'
          }`}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            setHoveredPanel(panel)
          }}
          onDragLeave={(event) => {
            if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
            setHoveredPanel((current) => (current === panel ? null : current))
          }}
          onDrop={(event) => {
            event.preventDefault()
            onDropInPanel(panel)
          }}
        />
      ))}
    </div>
  )
}
