import React, { useRef, useCallback, useEffect, useState } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { useSettingsStore } from '@/store/settingsStore'
import { TileChrome } from '@/components/TileChrome'
import { TileContent } from '@/components/TileContent'
import { ContextMenu } from '@/components/ContextMenu'
import { Terminal, StickyNote, Globe, LayoutGrid } from 'lucide-react'
import type { TileState, Viewport, ShellProfileId } from '@shared/types'

interface DragState {
  type: 'pan'
  startX: number
  startY: number
  initTx: number
  initTy: number
}

// Module-level refs for exposing methods
const canvasMethodsRef = { current: null as CanvasMethods | null }

interface CanvasMethods {
  centerViewOnTile: (tileId: string) => void
  centerViewOnCanvas: () => void
}

export function getCanvasMethods(): CanvasMethods | null {
  return canvasMethodsRef.current
}

interface CanvasProps {
  onCreateTerminal: (profileId: ShellProfileId) => void
  onCreateNote: () => void
  onCreateBrowser: () => void
  onCreateBoard: () => void
  profiles: Array<{ id: ShellProfileId; label: string; available: boolean }>
  viewMode?: 'canvas' | 'fullview'
  fullviewActiveTileId?: string | null
  fullviewTopInset?: number
}

export function Canvas({
  onCreateTerminal,
  onCreateNote,
  onCreateBrowser,
  onCreateBoard,
  profiles,
  viewMode = 'canvas',
  fullviewActiveTileId = null,
  fullviewTopInset = 0,
}: CanvasProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const spaceHeldRef = useRef(false)
  const [isPanning, setIsPanning] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const tiles = useCanvasStore((s) => s.tiles)
  const viewport = useCanvasStore((s) => s.viewport)
  const setViewport = useCanvasStore((s) => s.setViewport)
  const focusedTileId = useCanvasStore((s) => s.focusedTileId)
  const activeWorkspaceId = useCanvasStore((s) => s.activeWorkspaceId)
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const updateTile = useCanvasStore((s) => s.updateTile)
  const focusTile = useCanvasStore((s) => s.focusTile)
  const removeTile = useCanvasStore((s) => s.removeTile)
  const isFullview = viewMode === 'fullview'
  const showGrid = useSettingsStore((s) => s.showGrid)
  const gridSize = useSettingsStore((s) => s.gridSize)

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      if (isFullview) return
      if (e.target !== containerRef.current && e.target !== e.currentTarget) return
      setContextMenu({ x: e.clientX, y: e.clientY })
    },
    [isFullview],
  )

  // Center view on focused tile
  const centerViewOnTile = useCallback(
    (tileId: string) => {
      const tile = tiles.find((t) => t.id === tileId)
      if (!tile || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const centerX = rect.width / 2
      const centerY = rect.height / 2
      const tileCenterX = tile.x + tile.width / 2
      const tileCenterY = tile.y + tile.height / 2
      const newTx = centerX - tileCenterX * viewport.zoom
      const newTy = centerY - tileCenterY * viewport.zoom
      setViewport({ tx: newTx, ty: newTy, zoom: viewport.zoom })
    },
    [tiles, viewport.zoom, setViewport],
  )

  // Center view on canvas origin
  const centerViewOnCanvas = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    setViewport({ tx: centerX, ty: centerY, zoom: 1 })
  }, [setViewport])

  // Expose methods to parent
  canvasMethodsRef.current = {
    centerViewOnTile,
    centerViewOnCanvas,
  }

  // Screen-to-world conversion
  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return { x: sx, y: sy }
      return {
        x: (sx - rect.left - viewport.tx) / viewport.zoom,
        y: (sy - rect.top - viewport.ty) / viewport.zoom,
      }
    },
    [viewport],
  )

  // Wheel zoom at cursor
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      if (isFullview) return
      const rect = containerRef.current!.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
      const newZoom = Math.max(0.1, Math.min(5, viewport.zoom * zoomFactor))

      // Zoom toward cursor
      const newTx = mx - (mx - viewport.tx) * (newZoom / viewport.zoom)
      const newTy = my - (my - viewport.ty) * (newZoom / viewport.zoom)

      setViewport({ tx: newTx, ty: newTy, zoom: newZoom })
    },
    [isFullview, viewport, setViewport],
  )

  // Mouse down — start pan if on background (direct pan, no Space needed)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isFullview) return
      // Only pan if clicking on the canvas background (not a tile)
      if (e.target !== containerRef.current && e.target !== e.currentTarget) return
      if (e.button !== 0) return

      // Clear focus first
      focusTile(null)

      // Always start pan on background click
      dragRef.current = {
        type: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        initTx: viewport.tx,
        initTy: viewport.ty,
      }
      setIsPanning(true)
    },
    [isFullview, viewport, focusTile],
  )

  // Global mouse move/up for pan
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag || drag.type !== 'pan') return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      setViewport({
        tx: drag.initTx + dx,
        ty: drag.initTy + dy,
        zoom: viewport.zoom,
      })
    }

    const handleMouseUp = () => {
      dragRef.current = null
      setIsPanning(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [viewport, setViewport])

  // Space key for pan mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && focusedTileId === null) {
        spaceHeldRef.current = true
        if (containerRef.current) containerRef.current.style.cursor = 'grab'
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false
        if (containerRef.current) containerRef.current.style.cursor = ''
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [focusedTileId])

  return (
    <>
      <div
        ref={containerRef}
        className="canvas-root absolute inset-0 overflow-hidden"
        style={{
          background: isFullview ? 'var(--bg-primary)' : 'var(--surface-panel)',
          cursor: isFullview ? 'default' : isPanning ? 'grabbing' : spaceHeldRef.current ? 'grab' : 'default',
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onContextMenu={onContextMenu}
      >
        {/* Grid background */}
        {!isFullview && showGrid && <GridBackground tx={viewport.tx} ty={viewport.ty} zoom={viewport.zoom} gridSize={gridSize} />}

        {/* Tiles container */}
        <div
          className={`canvas-viewport ${isPanning ? 'no-transition' : ''}`}
          style={{
            position: 'absolute',
            inset: isFullview ? 0 : undefined,
            transform: isFullview ? 'none' : `translate(${viewport.tx}px, ${viewport.ty}px) scale(${viewport.zoom})`,
            transformOrigin: isFullview ? undefined : '0 0',
            width: isFullview ? '100%' : 0,
            height: isFullview ? '100%' : 0,
          }}
        >
          {tiles.map((tile: TileState) => (
            <TileChrome
              key={tile.id}
              tile={tile}
              isFocused={tile.id === focusedTileId}
              mode={viewMode}
              fullviewTopInset={fullviewTopInset}
              isHiddenInFullview={isFullview && tile.id !== fullviewActiveTileId}
              onFocus={() => {
                focusTile(tile.id)
                if (!isFullview) bringToFront(tile.id)
              }}
              onUpdate={(patch) => updateTile(tile.id, patch)}
              onDelete={() => {
                if (tile.type === 'terminal') window.electron.terminal.destroy(tile.id)
                if (tile.type === 'note') window.electron.note.delete(tile.id)
                if (tile.type === 'kanban' && activeWorkspaceId) window.electron.board.delete(activeWorkspaceId, tile.id)
                removeTile(tile.id)
              }}
            >
              <TileContent
                tile={tile}
                isFocused={tile.id === focusedTileId}
                onFocus={() => {
                  focusTile(tile.id)
                  if (!isFullview) bringToFront(tile.id)
                }}
                onUpdate={(patch) => updateTile(tile.id, patch)}
              />
            </TileChrome>
          ))}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              label: 'New Terminal',
              icon: Terminal,
              submenu: profiles.map((p) => ({
                label: p.label,
                disabled: !p.available,
                action: () => onCreateTerminal(p.id),
              })),
            },
            { label: 'New Note', icon: StickyNote, action: onCreateNote },
            { label: 'New Browser', icon: Globe, action: onCreateBrowser },
            { label: 'New Board', icon: LayoutGrid, action: onCreateBoard },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  )
}

// ─── Grid Background ────────────────────────────────────────────────────────

function GridBackground({ tx, ty, zoom, gridSize }: { tx: number; ty: number; zoom: number; gridSize: number }): React.ReactElement {
  const gridSizeSmall = gridSize
  const gridSizeLarge = gridSize * 5
  const gridSmall = gridSizeSmall * zoom
  const gridLarge = gridSizeLarge * zoom

  // Only render grid when cells are big enough to see
  const showSmall = gridSmall >= 4
  const showLarge = gridLarge >= 8

  if (!showSmall && !showLarge) return <div className="absolute inset-0" />

  const offsetX = tx % gridLarge
  const offsetY = ty % gridLarge

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'hidden' }}>
      <defs>
        {showSmall && (
          <pattern id="gridSmall" width={gridLarge} height={gridLarge} patternUnits="userSpaceOnUse" x={offsetX} y={offsetY}>
            <path
              d={`M ${gridSmall} 0 L 0 0 0 ${gridSmall}`}
              fill="none"
              stroke="var(--border-visible)"
              strokeWidth={0.5}
            />
            {/* Sub-grid lines */}
            {Array.from({ length: 4 }, (_, i) => (
              <path
                key={`sg-${i}`}
                d={`M ${(i + 1) * gridSmall} 0 L ${(i + 1) * gridSmall} ${gridLarge}`}
                fill="none"
                stroke="var(--border)"
                strokeWidth={0.3}
              />
            ))}
            {Array.from({ length: 4 }, (_, i) => (
              <path
                key={`sg-h-${i}`}
                d={`M 0 ${(i + 1) * gridSmall} L ${gridLarge} ${(i + 1) * gridSmall}`}
                fill="none"
                stroke="var(--border)"
                strokeWidth={0.3}
              />
            ))}
          </pattern>
        )}
      </defs>
      {showSmall && <rect x={0} y={0} width="100%" height="100%" fill="url(#gridSmall)" />}
    </svg>
  )
}
