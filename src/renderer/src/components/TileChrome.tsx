import React, { useRef, useCallback, useEffect, useState, type ReactNode } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { useSettingsStore } from '@/store/settingsStore'
import type { TileState, NoteColor } from '@shared/types'
import { KANBAN_BOARD_FIXED_WIDTH, NOTE_COLORS } from '@shared/types'
import { X, GripVertical, StickyNote, Globe, LayoutGrid, Terminal, Lock } from 'lucide-react'

interface Props {
  tile: TileState
  isFocused: boolean
  isSelected: boolean
  onFocus: () => void
  onUpdate: (patch: Partial<TileState>) => void
  onUpdatePositions: (positions: Array<{ id: string; x: number; y: number }>) => void
  onDelete: () => void
  onRemoveFromGroup?: () => void
  children: ReactNode
  mode?: 'canvas' | 'fullview'
  fullviewTopInset?: number
  isHiddenInFullview?: boolean
}

type ResizeDirection = 'e' | 's' | 'se' | 'w' | 'n' | 'ne' | 'sw' | 'nw'

const TYPE_ICONS: Record<string, typeof Terminal> = {
  terminal: Terminal,
  note: StickyNote,
  browser: Globe,
  kanban: LayoutGrid,
}

const TYPE_LABELS: Record<string, string> = {
  terminal: 'Terminal',
  note: 'Note',
  browser: 'Browser',
  kanban: 'Board',
}

const RADIUS_PRESETS = [12, 20, 28, 0]

export function TileChrome({
  tile,
  isFocused,
  isSelected,
  onFocus,
  onUpdate,
  onUpdatePositions,
  onDelete,
  onRemoveFromGroup,
  children,
  mode = 'canvas',
  fullviewTopInset = 0,
  isHiddenInFullview = false,
}: Props): React.ReactElement {
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState<ResizeDirection | null>(null)
  const dragStartRef = useRef<{ mx: number; my: number; positions: Array<{ id: string; x: number; y: number }>; anchorX: number; anchorY: number } | null>(null)
  const resizeStartRef = useRef<{ mx: number; my: number; w: number; h: number; tx: number; ty: number } | null>(null)
  const tiles = useCanvasStore((s) => s.tiles)
  const selectedTileIds = useCanvasStore((s) => s.selectedTileIds)
  const zoom = useCanvasStore((s) => s.viewport.zoom)
  const gridSize = useSettingsStore((s) => s.gridSize)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)
  const isFullview = mode === 'fullview'
  const isFixedWidthKanban = tile.type === 'kanban'
  const isLocked = Boolean(tile.locked)
  const radius = RADIUS_PRESETS[tile.radiusIndex ?? 0] ?? RADIUS_PRESETS[0]

  useEffect(() => {
    if (isFullview || !isFixedWidthKanban || tile.width === KANBAN_BOARD_FIXED_WIDTH) return
    onUpdate({ width: KANBAN_BOARD_FIXED_WIDTH })
  }, [isFullview, isFixedWidthKanban, tile.width, onUpdate])

  // ─── Drag ───────────────────────────────────────────────────────────────
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (isFullview || isLocked) return
      e.preventDefault()
      e.stopPropagation()
      onFocus()
      const movableIds = new Set(isSelected ? selectedTileIds : [tile.id])
      const positions = tiles
        .filter((entry) => movableIds.has(entry.id) && !entry.locked)
        .map((entry) => ({ id: entry.id, x: entry.x, y: entry.y }))

      if (positions.length === 0) return

      dragStartRef.current = {
        mx: e.clientX,
        my: e.clientY,
        positions,
        anchorX: tile.x,
        anchorY: tile.y,
      }
      setIsDragging(true)
    },
    [tile, onFocus, isFullview, isLocked, isSelected, selectedTileIds, tiles],
  )

  // ─── Resize ─────────────────────────────────────────────────────────────
  const handleResizeStart = useCallback(
    (dir: ResizeDirection) => (e: React.MouseEvent) => {
      if (isFullview || isLocked) return
      e.preventDefault()
      e.stopPropagation()
      onFocus()
      resizeStartRef.current = {
        mx: e.clientX,
        my: e.clientY,
        w: tile.width,
        h: tile.height,
        tx: tile.x,
        ty: tile.y,
      }
      setIsResizing(dir)
    },
    [tile, onFocus, isFullview, isLocked],
  )

  // ─── Global mouse move/up ──────────────────────────────────────────────
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && dragStartRef.current) {
        const dx = (e.clientX - dragStartRef.current.mx) / zoom
        const dy = (e.clientY - dragStartRef.current.my) / zoom
        let deltaX = dx
        let deltaY = dy

        if (snapToGrid) {
          const snappedX = Math.round((dragStartRef.current.anchorX + dx) / gridSize) * gridSize
          const snappedY = Math.round((dragStartRef.current.anchorY + dy) / gridSize) * gridSize
          deltaX = snappedX - dragStartRef.current.anchorX
          deltaY = snappedY - dragStartRef.current.anchorY
        }

        onUpdatePositions(
          dragStartRef.current.positions.map((position) => ({
            id: position.id,
            x: position.x + deltaX,
            y: position.y + deltaY,
          })),
        )
      }

      if (isResizing && resizeStartRef.current) {
        const dx = (e.clientX - resizeStartRef.current.mx) / zoom
        const dy = (e.clientY - resizeStartRef.current.my) / zoom
        const dir = isResizing

        let newW = resizeStartRef.current.w
        let newH = resizeStartRef.current.h
        let newX = resizeStartRef.current.tx
        let newY = resizeStartRef.current.ty

        if (!isFixedWidthKanban && dir.includes('e')) newW = Math.max(300, resizeStartRef.current.w + dx)
        if (!isFixedWidthKanban && dir.includes('w')) {
          newW = Math.max(300, resizeStartRef.current.w - dx)
          newX = resizeStartRef.current.tx + dx
        }
        if (dir.includes('s')) newH = Math.max(200, resizeStartRef.current.h + dy)
        if (dir.includes('n')) {
          newH = Math.max(200, resizeStartRef.current.h - dy)
          newY = resizeStartRef.current.ty + dy
        }

        // Snap
        if (snapToGrid) {
          newW = isFixedWidthKanban ? KANBAN_BOARD_FIXED_WIDTH : Math.round(newW / gridSize) * gridSize
          newH = Math.round(newH / gridSize) * gridSize
          newX = isFixedWidthKanban ? resizeStartRef.current.tx : Math.round(newX / gridSize) * gridSize
          newY = Math.round(newY / gridSize) * gridSize
        } else if (isFixedWidthKanban) {
          newW = KANBAN_BOARD_FIXED_WIDTH
          newX = resizeStartRef.current.tx
        }

        onUpdate({ width: newW, height: newH, x: newX, y: newY })
      }
    }

    const handleMouseUp = () => {
      dragStartRef.current = null
      resizeStartRef.current = null
      setIsDragging(false)
      setIsResizing(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [gridSize, isDragging, isFixedWidthKanban, isResizing, onUpdate, onUpdatePositions, snapToGrid, zoom])

  const cursor = isDragging ? 'grabbing' : isResizing ? `${isResizing}-resize` : 'default'

  return (
    <div
      className="absolute"
      style={{
        left: isFullview ? 0 : tile.x,
        top: isFullview ? fullviewTopInset : tile.y,
        width: isFullview ? '100%' : tile.width,
        height: isFullview ? `calc(100% - ${fullviewTopInset}px)` : tile.height,
        zIndex: isFullview ? (isHiddenInFullview ? 0 : 1) : tile.zIndex,
        cursor,
        opacity: isFullview && isHiddenInFullview ? 0 : 1,
        pointerEvents: isFullview && isHiddenInFullview ? 'none' : 'auto',
        visibility: isFullview && isHiddenInFullview ? 'hidden' : 'visible',
      }}
      onMouseDown={onFocus}
    >
      {/* Tile body */}
      <div
        className="w-full h-full flex flex-col overflow-hidden"
        style={{
          background: tile.type === 'note' && tile.noteColor
            ? NOTE_COLORS[tile.noteColor]?.bg || 'var(--surface)'
            : 'var(--surface)',
          color: tile.type === 'note' && tile.noteColor
            ? NOTE_COLORS[tile.noteColor]?.text || '#78350f'
            : 'var(--text-primary)',
          border: isFullview
            ? 'none'
            : isFocused
              ? '1px solid var(--text-display)'
              : isSelected
                ? '1px solid var(--border-visible)'
              : tile.type === 'note'
                ? '1px solid var(--border-visible)'
                : '1px solid var(--border)',
          borderRadius: isFullview ? 0 : radius,
          boxShadow: 'none',
          transition: 'border-color 0.15s ease, background 0.15s ease',
        }}
      >
        {/* Title bar */}
        {!isFullview && (
          <div
            className="flex items-center gap-2 px-3 py-2 select-none shrink-0"
            style={{
              background: 'var(--surface-raised)',
              borderBottom: '1px solid var(--border)',
              cursor: isLocked ? 'default' : 'grab',
              display: tile.hideTitlebar ? 'none' : 'flex',
            }}
            onMouseDown={handleDragStart}
          >
            <GripVertical size={12} className="text-text-secondary shrink-0" />

            <button
              className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors shrink-0 ${
                isLocked
                  ? 'bg-text-primary text-bg-primary'
                  : 'text-text-secondary hover:bg-hover-bg hover:text-text-display'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                onUpdate({ locked: !isLocked })
              }}
              title={isLocked ? 'Unlock window' : 'Lock window'}
            >
              <Lock size={11} />
            </button>

            {/* Type icon */}
            {(() => {
              const Icon = TYPE_ICONS[tile.type]
              return Icon ? <Icon size={12} className="text-text-secondary shrink-0" /> : null
            })()}

            <span className="nd-label truncate flex-1 text-text-secondary">
              {tile.label ?? TYPE_LABELS[tile.type] ?? 'Tile'}
            </span>

            {tile.groupId && onRemoveFromGroup && (
              <button
                className="rounded-full border border-border-visible px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveFromGroup()
                }}
                title="Remove from group"
              >
                Out
              </button>
            )}

            {/* Terminal: shell profile badge */}
            {tile.type === 'terminal' && tile.shellProfileId && (
              <span
                className="nd-caption rounded-full border border-border-visible px-2 py-1 shrink-0"
                style={{ background: 'var(--surface)', color: 'var(--text-secondary)' }}
              >
                {tile.shellProfileId}
              </span>
            )}

            {/* Note: color indicator */}
            {tile.type === 'note' && tile.noteColor && (
              <span
                className="w-4 h-4 rounded-full shrink-0 border"
                style={{
                  background: NOTE_COLORS[tile.noteColor]?.bg || '#fef3c7',
                  borderColor: 'var(--border-visible)',
                }}
              />
            )}

            {/* Delete button */}
            <button
              className="p-1 rounded-full hover:bg-hover-bg text-text-secondary hover:text-danger transition-colors shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {!isFullview && tile.hideTitlebar && (
          <div
            className="shrink-0"
            style={{
              height: 8,
              cursor: isLocked ? 'default' : 'grab',
              background: 'transparent',
            }}
            onMouseDown={handleDragStart}
          />
        )}

        {/* Terminal content */}
        <div className="flex-1 min-h-0">
          {children}
        </div>
      </div>

      {/* Resize handles (8 directions) */}
      {!isFullview && !isDragging && !isLocked && (
        <>
          {!isFixedWidthKanban && (
            <div
              className="absolute"
              style={{ top: 0, left: -4, width: 8, height: '100%', cursor: 'col-resize' }}
              onMouseDown={handleResizeStart('w')}
            />
          )}
          {!isFixedWidthKanban && (
            <div
              className="absolute"
              style={{ top: 0, right: -4, width: 8, height: '100%', cursor: 'col-resize' }}
              onMouseDown={handleResizeStart('e')}
            />
          )}
          <div
            className="absolute"
            style={{ left: 0, top: -4, height: 8, width: '100%', cursor: 'row-resize' }}
            onMouseDown={handleResizeStart('n')}
          />
          <div
            className="absolute"
            style={{ left: 0, bottom: -4, height: 8, width: '100%', cursor: 'row-resize' }}
            onMouseDown={handleResizeStart('s')}
          />
          {/* Corners */}
          {!isFixedWidthKanban && (
            <div
              className="absolute"
              style={{ top: -6, left: -6, width: 12, height: 12, cursor: 'nw-resize' }}
              onMouseDown={handleResizeStart('nw')}
            />
          )}
          {!isFixedWidthKanban && (
            <div
              className="absolute"
              style={{ top: -6, right: -6, width: 12, height: 12, cursor: 'ne-resize' }}
              onMouseDown={handleResizeStart('ne')}
            />
          )}
          {!isFixedWidthKanban && (
            <div
              className="absolute"
              style={{ bottom: -6, left: -6, width: 12, height: 12, cursor: 'sw-resize' }}
              onMouseDown={handleResizeStart('sw')}
            />
          )}
          {!isFixedWidthKanban && (
            <div
              className="absolute"
              style={{ bottom: -6, right: -6, width: 12, height: 12, cursor: 'se-resize' }}
              onMouseDown={handleResizeStart('se')}
            />
          )}
        </>
      )}
    </div>
  )
}
