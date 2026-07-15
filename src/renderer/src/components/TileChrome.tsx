import React, { useRef, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { useSettingsStore } from '@/store/settingsStore'
import { isTileInteractionLocked } from '@/utils/grouping'
import { getSplitPanelFrame } from '@/utils/splitViewLayout'
import type { TileState, ViewMode, SplitPanelId, SplitOrientation } from '@shared/types'
import { getTileSizePreset, NOTE_COLORS } from '@shared/types'
import { GripVertical, StickyNote, Globe, Terminal, Clock, Lock } from 'lucide-react'
import { TileActionButtons } from './TileActionButtons'

interface Props {
  tile: TileState
  isFocused: boolean
  isSelected: boolean
  onFocus: () => void
  onUpdate: (patch: Partial<TileState>) => void
  onUpdatePositions: (positions: Array<{ id: string; x: number; y: number }>) => void
  onConfigure: (event: React.MouseEvent<HTMLButtonElement>) => void
  onFocusView: () => void
  onDetach?: () => void
  onDelete: () => void
  onRemoveFromGroup?: () => void
  children: ReactNode
  mode?: ViewMode
  isHiddenInFullview?: boolean
  splitPanel?: SplitPanelId
  splitOrientation?: SplitOrientation
}

type ResizeDirection = 'e' | 's' | 'se' | 'w' | 'n' | 'ne' | 'sw' | 'nw'

const TYPE_ICONS: Record<string, typeof Terminal> = {
  terminal: Terminal,
  note: StickyNote,
  browser: Globe,
  timer: Clock,
}

const TYPE_LABELS: Record<string, string> = {
  terminal: 'Terminal',
  note: 'Note',
  browser: 'Browser',
  timer: 'Timer',
}

function getTileDisplayLabel(tile: TileState): string {
  return tile.label?.trim() || TYPE_LABELS[tile.type] || 'Tile'
}

export function TileChrome({
  tile,
  isFocused,
  isSelected,
  onFocus,
  onUpdate,
  onUpdatePositions,
  onConfigure,
  onFocusView,
  onDetach,
  onDelete,
  onRemoveFromGroup,
  children,
  mode = 'canvas',
  isHiddenInFullview = false,
  splitPanel = 'left',
  splitOrientation = 'vertical',
}: Props): React.ReactElement {
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState<ResizeDirection | null>(null)
  const dragStartRef = useRef<{ mx: number; my: number; positions: Array<{ id: string; x: number; y: number }>; anchorX: number; anchorY: number } | null>(null)
  const resizeStartRef = useRef<{ mx: number; my: number; w: number; h: number; tx: number; ty: number } | null>(null)
  const tiles = useCanvasStore((s) => s.tiles)
  const storedGroups = useCanvasStore((s) => s.groups)
  const groupsEnabled = useSettingsStore((s) => s.groups.enabled)
  const groups = groupsEnabled ? storedGroups : []
  const selectedTileIds = useCanvasStore((s) => s.selectedTileIds)
  const zoom = useCanvasStore((s) => s.viewport.zoom)
  const gridSize = useSettingsStore((s) => s.gridSize)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)
  const isFullview = mode === 'fullview'
  const isSplitview = mode === 'splitview'
  const isFixedView = isFullview || isSplitview
  const sizePreset = getTileSizePreset(tile.type)
  const minWidth = sizePreset.minWidth
  const minHeight = sizePreset.minHeight
  const isLocked = Boolean(tile.locked)
  const isGroupLocked = Boolean(tile.groupId && groups.find((group) => group.id === tile.groupId)?.locked)
  const isInteractionLocked = isTileInteractionLocked(tile, groups)
  const lockedGroupIds = useMemo(
    () => new Set(groups.filter((group) => group.locked).map((group) => group.id)),
    [groups],
  )

  useEffect(() => {
    if (isFixedView) return
    const width = Math.max(minWidth, tile.width)
    const height = Math.max(minHeight, tile.height)
    if (width === tile.width && height === tile.height) return
    onUpdate({ width, height })
  }, [isFixedView, minHeight, minWidth, tile.height, tile.width, onUpdate])

  // ─── Drag ───────────────────────────────────────────────────────────────
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (isFixedView || isInteractionLocked) return
      e.preventDefault()
      e.stopPropagation()
      onFocus()
      const movableIds = new Set(isSelected ? selectedTileIds : [tile.id])
      const positions = tiles
        .filter((entry) => (
          movableIds.has(entry.id) &&
          !entry.locked &&
          !(entry.groupId && lockedGroupIds.has(entry.groupId))
        ))
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
    [tile, onFocus, isFixedView, isInteractionLocked, isSelected, selectedTileIds, tiles, lockedGroupIds],
  )

  // ─── Resize ─────────────────────────────────────────────────────────────
  const handleResizeStart = useCallback(
    (dir: ResizeDirection) => (e: React.MouseEvent) => {
      if (isFixedView || isInteractionLocked) return
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
    [tile, onFocus, isFixedView, isInteractionLocked],
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

        if (dir.includes('e')) newW = Math.max(minWidth, resizeStartRef.current.w + dx)
        if (dir.includes('w')) {
          newW = Math.max(minWidth, resizeStartRef.current.w - dx)
          newX = resizeStartRef.current.tx + (resizeStartRef.current.w - newW)
        }
        if (dir.includes('s')) newH = Math.max(minHeight, resizeStartRef.current.h + dy)
        if (dir.includes('n')) {
          newH = Math.max(minHeight, resizeStartRef.current.h - dy)
          newY = resizeStartRef.current.ty + (resizeStartRef.current.h - newH)
        }

        // Snap
        if (snapToGrid) {
          newW = Math.round(newW / gridSize) * gridSize
          newH = Math.round(newH / gridSize) * gridSize
          newX = Math.round(newX / gridSize) * gridSize
          newY = Math.round(newY / gridSize) * gridSize
        }

        if (newW < minWidth) {
          newW = minWidth
          if (dir.includes('w')) newX = resizeStartRef.current.tx + (resizeStartRef.current.w - newW)
        }
        if (newH < minHeight) {
          newH = minHeight
          if (dir.includes('n')) newY = resizeStartRef.current.ty + (resizeStartRef.current.h - newH)
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
  }, [gridSize, isDragging, isResizing, minHeight, minWidth, onUpdate, onUpdatePositions, snapToGrid, zoom])

  const cursor = isDragging ? 'grabbing' : isResizing ? `${isResizing}-resize` : 'default'
  const splitStyle = getSplitPanelFrame(splitOrientation, splitPanel)

  return (
    <div
      className="absolute"
      style={{
        left: isFullview ? 0 : isSplitview ? splitStyle.left : tile.x,
        top: isFullview ? 0 : isSplitview ? splitStyle.top : tile.y,
        width: isFullview ? '100%' : isSplitview ? splitStyle.width : tile.width,
        height: isFullview ? '100%' : isSplitview ? splitStyle.height : tile.height,
        zIndex: isFixedView ? (isHiddenInFullview ? 0 : 1) : tile.zIndex,
        cursor,
        opacity: isFixedView && isHiddenInFullview ? 0 : 1,
        pointerEvents: isFixedView && isHiddenInFullview ? 'none' : 'auto',
        visibility: isFixedView && isHiddenInFullview ? 'hidden' : 'visible',
      }}
      onMouseDown={onFocus}
      onWheel={(event) => {
        event.stopPropagation()
      }}
    >
      {/* Tile body */}
      <div
        className="w-full h-full flex flex-col overflow-hidden"
        style={{
          background: 'var(--surface)',
          color: 'var(--text-primary)',
          border: isFixedView
            ? 'none'
            : isFocused
              ? '1px solid var(--text-display)'
              : isSelected
                ? '1px solid var(--border-visible)'
              : tile.type === 'note'
                ? '1px solid var(--border-visible)'
                : '1px solid var(--border)',
          borderRadius: 0,
          transition: 'border-color 0.15s ease, background 0.15s ease',
          boxShadow: tile.type === 'note' && tile.noteColor
            ? `inset 0 3px 0 ${NOTE_COLORS[tile.noteColor]?.bg || 'var(--border-visible)'}`
            : 'none',
        }}
      >
        {/* Title bar */}
        {!isFixedView && (
          <div
            className="flex items-center gap-2 px-3 py-2 select-none shrink-0"
            style={{
              background: 'var(--surface-raised)',
              borderBottom: '1px solid var(--border)',
              cursor: isInteractionLocked ? 'default' : 'grab',
            }}
            onMouseDown={handleDragStart}
          >
            <GripVertical size={12} className="text-text-secondary shrink-0" />

            <button
              className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors shrink-0 ${
                isInteractionLocked
                  ? 'bg-text-primary text-bg-primary'
                  : 'text-text-secondary hover:bg-hover-bg hover:text-text-display'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                if (isGroupLocked) return
                onUpdate({ locked: !isLocked })
              }}
              disabled={isGroupLocked}
              title={isGroupLocked ? 'Locked by group' : isLocked ? 'Unlock window' : 'Lock window'}
            >
              <Lock size={11} />
            </button>

            {/* Type icon */}
            {(() => {
              const Icon = TYPE_ICONS[tile.type]
              return Icon ? <Icon size={12} className="text-text-secondary shrink-0" /> : null
            })()}

            <span className="nd-label truncate flex-1 text-text-secondary">
              {getTileDisplayLabel(tile)}
            </span>

            {tile.groupId && onRemoveFromGroup && (
              <button
                className="rounded-full border border-border-visible px-2 py-1 text-[10px] uppercase text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  if (isGroupLocked) return
                  onRemoveFromGroup()
                }}
                disabled={isGroupLocked}
                style={{
                  opacity: isGroupLocked ? 0.45 : 1,
                  cursor: isGroupLocked ? 'not-allowed' : 'pointer',
                }}
                title={isGroupLocked ? 'Unlock group to remove this tile' : 'Remove from group'}
              >
                Out
              </button>
            )}

            {/* Terminal: shell profile badge */}
            {tile.type === 'terminal' && (tile.terminalConnection === 'remote-ssh' || tile.shellProfileId) && (
              <span
                className="nd-caption rounded-full border border-border-visible px-2 py-1 shrink-0"
                style={{ background: 'var(--surface)', color: 'var(--text-secondary)' }}
              >
                {tile.terminalConnection === 'remote-ssh' ? 'remote ssh' : tile.shellProfileId}
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

            <TileActionButtons
              onConfigure={onConfigure}
              onFocus={onFocusView}
              onDetach={onDetach}
              onClose={onDelete}
            />
          </div>
        )}

        {/* Terminal content */}
        <div className="tile-font-scope flex-1 min-h-0">
          {children}
        </div>
      </div>

      {/* Resize handles (8 directions) */}
      {!isFixedView && !isDragging && !isInteractionLocked && (
        <>
          <div
            className="absolute"
            style={{ top: 0, left: -4, width: 8, height: '100%', cursor: 'col-resize' }}
            onMouseDown={handleResizeStart('w')}
          />
          <div
            className="absolute"
            style={{ top: 0, right: -4, width: 8, height: '100%', cursor: 'col-resize' }}
            onMouseDown={handleResizeStart('e')}
          />
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
          <div
            className="absolute"
            style={{ top: -6, left: -6, width: 12, height: 12, cursor: 'nw-resize' }}
            onMouseDown={handleResizeStart('nw')}
          />
          <div
            className="absolute"
            style={{ top: -6, right: -6, width: 12, height: 12, cursor: 'ne-resize' }}
            onMouseDown={handleResizeStart('ne')}
          />
          <div
            className="absolute"
            style={{ bottom: -6, left: -6, width: 12, height: 12, cursor: 'sw-resize' }}
            onMouseDown={handleResizeStart('sw')}
          />
          <div
            className="absolute"
            style={{ bottom: -6, right: -6, width: 12, height: 12, cursor: 'se-resize' }}
            onMouseDown={handleResizeStart('se')}
          />
        </>
      )}
    </div>
  )
}
