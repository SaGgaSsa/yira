import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { useSettingsStore } from '@/store/settingsStore'
import { TileChrome } from '@/components/TileChrome'
import { TileContent } from '@/components/TileContent'
import { ContextMenu } from '@/components/ContextMenu'
import { findMergeTargetGroup, findSelectedGroup, getGroupingBlockedReason } from '@/utils/grouping'
import { Terminal, StickyNote, Globe, LayoutGrid, Lock } from 'lucide-react'
import { GROUP_COLORS, GROUP_COLOR_ORDER, type TileState, type ShellProfileId, type TileGroup, type GroupColorId } from '@shared/types'

const GROUP_FRAME_PADDING = 20
const GROUP_TOOLBAR_GAP = 30
const FIT_PADDING = 48
const GROUP_TOOLBAR_EXTRA_TOP_PADDING = 40

interface ViewPadding {
  top: number
  right: number
  bottom: number
  left: number
}

interface PanDragState {
  type: 'pan'
  startX: number
  startY: number
  initTx: number
  initTy: number
}

interface SelectionDragState {
  type: 'select'
  startX: number
  startY: number
}

interface GroupDragState {
  type: 'group'
  groupId: string
  startX: number
  startY: number
  positions: Array<{ id: string; x: number; y: number }>
  anchorX: number
  anchorY: number
}

type DragState = PanDragState | SelectionDragState | GroupDragState

interface GroupBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  x: number
  y: number
  width: number
  height: number
}

interface GroupRenderState {
  group: TileGroup
  members: TileState[]
  bounds: GroupBounds
}

// Module-level refs for exposing methods
const canvasMethodsRef = { current: null as CanvasMethods | null }

interface CanvasMethods {
  centerViewOnTile: (tileId: string) => void
  centerViewOnCanvas: () => void
  centerViewOnBounds: (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => void
  fitViewToBounds: (
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    padding?: Partial<ViewPadding>,
  ) => void
  fitViewToContent: () => void
}

export function getCanvasMethods(): CanvasMethods | null {
  return canvasMethodsRef.current
}

function resolveViewPadding(padding?: Partial<ViewPadding>): ViewPadding {
  return {
    top: padding?.top ?? FIT_PADDING,
    right: padding?.right ?? FIT_PADDING,
    bottom: padding?.bottom ?? FIT_PADDING,
    left: padding?.left ?? FIT_PADDING,
  }
}

interface CanvasProps {
  onCreateTerminal: (profileId: ShellProfileId) => void
  onCreateNote: () => void
  onCreateBrowser: () => void
  onCreateBoard: () => void
  onCreateGroupFromSelection: () => void | Promise<void>
  onDeleteTile: (tileId: string) => Promise<boolean>
  onConfirmRemoveFromGroup: (tile: TileState, group: TileGroup) => Promise<boolean>
  profiles: Array<{ id: ShellProfileId; label: string; available: boolean }>
  tileRefreshKeys?: Record<string, number>
  viewMode?: 'canvas' | 'fullview'
  fullviewActiveTileId?: string | null
  fullviewTopInset?: number
}

export function Canvas({
  onCreateTerminal,
  onCreateNote,
  onCreateBrowser,
  onCreateBoard,
  onCreateGroupFromSelection,
  onDeleteTile,
  onConfirmRemoveFromGroup,
  profiles,
  tileRefreshKeys = {},
  viewMode = 'canvas',
  fullviewActiveTileId = null,
  fullviewTopInset = 0,
}: CanvasProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const spaceHeldRef = useRef(false)
  const [isPanning, setIsPanning] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [colorPicker, setColorPicker] = useState<{ groupId: string; x: number; y: number } | null>(null)

  const tiles = useCanvasStore((s) => s.tiles)
  const groups = useCanvasStore((s) => s.groups)
  const viewport = useCanvasStore((s) => s.viewport)
  const selectedTileIds = useCanvasStore((s) => s.selectedTileIds)
  const setViewport = useCanvasStore((s) => s.setViewport)
  const focusedTileId = useCanvasStore((s) => s.focusedTileId)
  const selectTiles = useCanvasStore((s) => s.selectTiles)
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const updateTile = useCanvasStore((s) => s.updateTile)
  const updateTilePositions = useCanvasStore((s) => s.updateTilePositions)
  const focusTile = useCanvasStore((s) => s.focusTile)
  const removeTileFromGroup = useCanvasStore((s) => s.removeTileFromGroup)
  const setGroupColor = useCanvasStore((s) => s.setGroupColor)
  const setGroupLocked = useCanvasStore((s) => s.setGroupLocked)
  const isFullview = viewMode === 'fullview'
  const showGrid = useSettingsStore((s) => s.showGrid)
  const gridSize = useSettingsStore((s) => s.gridSize)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)

  const groupRenderData = useMemo<GroupRenderState[]>(() => {
    return groups.flatMap((group) => {
      const members = tiles.filter((tile) => group.tileIds.includes(tile.id))
      if (members.length === 0) return []

      const minX = Math.min(...members.map((tile) => tile.x))
      const minY = Math.min(...members.map((tile) => tile.y))
      const maxX = Math.max(...members.map((tile) => tile.x + tile.width))
      const maxY = Math.max(...members.map((tile) => tile.y + tile.height))

      return [{
        group,
        members,
        bounds: {
          minX,
          minY,
          maxX,
          maxY,
          x: minX - GROUP_FRAME_PADDING,
          y: minY - GROUP_FRAME_PADDING,
          width: maxX - minX + GROUP_FRAME_PADDING * 2,
          height: maxY - minY + GROUP_FRAME_PADDING * 2,
        },
      }]
    })
  }, [groups, tiles])

  const selectedGroup = useMemo(() => {
    return findSelectedGroup(groups, selectedTileIds)
  }, [groups, selectedTileIds])

  const mergeTargetGroup = useMemo(() => {
    return findMergeTargetGroup(tiles, groups, selectedTileIds)
  }, [tiles, groups, selectedTileIds])

  const groupingBlockedReason = useMemo(() => {
    return getGroupingBlockedReason(tiles, groups, selectedTileIds, mergeTargetGroup?.id)
  }, [tiles, groups, selectedTileIds, mergeTargetGroup])

  const showSelectionBar = !isFullview && selectedTileIds.length >= 2 && selectedGroup === null
  const canCreateGroup = selectedTileIds.length >= 2 && selectedGroup === null && !groupingBlockedReason
  const selectionActionLabel = mergeTargetGroup ? `Merge into "${mergeTargetGroup.name}"` : 'Group'

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      if (isFullview) return
      if (e.target !== containerRef.current && e.target !== e.currentTarget) return
      setContextMenu({ x: e.clientX, y: e.clientY })
    },
    [isFullview],
  )

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

  const centerViewOnCanvas = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setViewport({ tx: rect.width / 2, ty: rect.height / 2, zoom: 1 })
  }, [setViewport])

  const centerViewOnBounds = useCallback(
    ({ minX, minY, maxX, maxY }: { minX: number; minY: number; maxX: number; maxY: number }) => {
      if (!containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const boundsWidth = Math.max(1, maxX - minX)
      const boundsHeight = Math.max(1, maxY - minY)
      const centerX = minX + boundsWidth / 2
      const centerY = minY + boundsHeight / 2

      setViewport({
        tx: rect.width / 2 - centerX * viewport.zoom,
        ty: rect.height / 2 - centerY * viewport.zoom,
        zoom: viewport.zoom,
      })
    },
    [viewport.zoom, setViewport],
  )

  const fitViewToBounds = useCallback(
    (
      { minX, minY, maxX, maxY }: { minX: number; minY: number; maxX: number; maxY: number },
      padding?: Partial<ViewPadding>,
    ) => {
      if (!containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const boundsWidth = Math.max(1, maxX - minX)
      const boundsHeight = Math.max(1, maxY - minY)
      const resolvedPadding = resolveViewPadding(padding)
      const availableWidth = Math.max(1, rect.width - resolvedPadding.left - resolvedPadding.right)
      const availableHeight = Math.max(1, rect.height - resolvedPadding.top - resolvedPadding.bottom)
      const nextZoom = Math.max(0.1, Math.min(5, Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight)))
      const targetLeft = resolvedPadding.left + (availableWidth - boundsWidth * nextZoom) / 2
      const targetTop = resolvedPadding.top + (availableHeight - boundsHeight * nextZoom) / 2

      setViewport({
        tx: targetLeft - minX * nextZoom,
        ty: targetTop - minY * nextZoom,
        zoom: nextZoom,
      })
    },
    [setViewport],
  )

  const fitViewToContent = useCallback(() => {
    if (!containerRef.current) return

    if (tiles.length === 0) {
      centerViewOnCanvas()
      return
    }

    const horizontalStarts = [
      ...tiles.map((tile) => tile.x),
      ...groupRenderData.map(({ bounds }) => bounds.x),
    ]
    const verticalStarts = [
      ...tiles.map((tile) => tile.y),
      ...groupRenderData.map(({ bounds }) => bounds.y),
    ]
    const horizontalEnds = [
      ...tiles.map((tile) => tile.x + tile.width),
      ...groupRenderData.map(({ bounds }) => bounds.x + bounds.width),
    ]
    const verticalEnds = [
      ...tiles.map((tile) => tile.y + tile.height),
      ...groupRenderData.map(({ bounds }) => bounds.y + bounds.height),
    ]
    const minX = Math.min(...horizontalStarts)
    const minY = Math.min(...verticalStarts)
    const maxX = Math.max(...horizontalEnds)
    const maxY = Math.max(...verticalEnds)

    fitViewToBounds(
      { minX, minY, maxX, maxY },
      groupRenderData.length > 0
        ? { top: FIT_PADDING + GROUP_TOOLBAR_GAP + GROUP_TOOLBAR_EXTRA_TOP_PADDING }
        : undefined,
    )
  }, [tiles, groupRenderData, centerViewOnCanvas, fitViewToBounds])

  canvasMethodsRef.current = {
    centerViewOnTile,
    centerViewOnCanvas,
    centerViewOnBounds,
    fitViewToBounds,
    fitViewToContent,
  }

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

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      if (isFullview) return
      const rect = containerRef.current!.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
      const newZoom = Math.max(0.1, Math.min(5, viewport.zoom * zoomFactor))
      const newTx = mx - (mx - viewport.tx) * (newZoom / viewport.zoom)
      const newTy = my - (my - viewport.ty) * (newZoom / viewport.zoom)

      setViewport({ tx: newTx, ty: newTy, zoom: newZoom })
    },
    [isFullview, viewport, setViewport],
  )

  const startGroupDrag = useCallback(
    (event: React.MouseEvent, groupState: GroupRenderState) => {
      event.preventDefault()
      event.stopPropagation()

      const memberIds = groupState.members.map((tile) => tile.id)
      selectTiles(memberIds)
      focusTile(null)

      if (groupState.group.locked) {
        dragRef.current = null
        return
      }

      const positions = groupState.members
        .filter((tile) => !tile.locked)
        .map((tile) => ({ id: tile.id, x: tile.x, y: tile.y }))

      if (positions.length === 0) {
        dragRef.current = null
        return
      }

      dragRef.current = {
        type: 'group',
        groupId: groupState.group.id,
        startX: event.clientX,
        startY: event.clientY,
        positions,
        anchorX: groupState.bounds.x,
        anchorY: groupState.bounds.y,
      }
    },
    [focusTile, selectTiles],
  )

  const handleRemoveTileFromGroup = useCallback(
    async (tile: TileState) => {
      if (!tile.groupId) return

      const groupState = groupRenderData.find((entry) => entry.group.id === tile.groupId)
      if (!groupState) return
      if (groupState.group.locked) return

      const confirmed = await onConfirmRemoveFromGroup(tile, groupState.group)
      if (!confirmed) return

      const nextX = snapToGrid
        ? Math.round((groupState.bounds.maxX + GROUP_FRAME_PADDING + 40) / gridSize) * gridSize
        : groupState.bounds.maxX + GROUP_FRAME_PADDING + 40
      const nextY = snapToGrid
        ? Math.round(tile.y / gridSize) * gridSize
        : tile.y

      updateTile(tile.id, { x: nextX, y: nextY })
      removeTileFromGroup(tile.id)
      focusTile(tile.id)
      selectTiles([tile.id])
      bringToFront(tile.id)
    },
    [bringToFront, focusTile, gridSize, groupRenderData, onConfirmRemoveFromGroup, removeTileFromGroup, selectTiles, snapToGrid, updateTile],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isFullview) return
      if (e.target !== containerRef.current && e.target !== e.currentTarget) return

      if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
        e.preventDefault()
        focusTile(null)
        dragRef.current = {
          type: 'pan',
          startX: e.clientX,
          startY: e.clientY,
          initTx: viewport.tx,
          initTy: viewport.ty,
        }
        setIsPanning(true)
        return
      }

      if (e.button !== 0) return

      focusTile(null)
      selectTiles([])
      setColorPicker(null)
      dragRef.current = {
        type: 'select',
        startX: e.clientX,
        startY: e.clientY,
      }
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect) {
        setMarqueeRect({
          left: e.clientX - rect.left,
          top: e.clientY - rect.top,
          width: 0,
          height: 0,
        })
      }
    },
    [isFullview, viewport, focusTile, selectTiles],
  )

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return

      if (drag.type === 'pan') {
        const dx = e.clientX - drag.startX
        const dy = e.clientY - drag.startY
        setViewport({
          tx: drag.initTx + dx,
          ty: drag.initTy + dy,
          zoom: viewport.zoom,
        })
        return
      }

      if (drag.type === 'group') {
        const dx = (e.clientX - drag.startX) / viewport.zoom
        const dy = (e.clientY - drag.startY) / viewport.zoom
        let deltaX = dx
        let deltaY = dy

        if (snapToGrid) {
          const snappedX = Math.round((drag.anchorX + dx) / gridSize) * gridSize
          const snappedY = Math.round((drag.anchorY + dy) / gridSize) * gridSize
          deltaX = snappedX - drag.anchorX
          deltaY = snappedY - drag.anchorY
        }

        updateTilePositions(
          drag.positions.map((position) => ({
            id: position.id,
            x: position.x + deltaX,
            y: position.y + deltaY,
          })),
        )
        return
      }

      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const startLocalX = drag.startX - rect.left
      const startLocalY = drag.startY - rect.top
      const currentLocalX = e.clientX - rect.left
      const currentLocalY = e.clientY - rect.top

      setMarqueeRect({
        left: Math.min(startLocalX, currentLocalX),
        top: Math.min(startLocalY, currentLocalY),
        width: Math.abs(currentLocalX - startLocalX),
        height: Math.abs(currentLocalY - startLocalY),
      })

      const startWorld = screenToWorld(drag.startX, drag.startY)
      const currentWorld = screenToWorld(e.clientX, e.clientY)
      const minX = Math.min(startWorld.x, currentWorld.x)
      const minY = Math.min(startWorld.y, currentWorld.y)
      const maxX = Math.max(startWorld.x, currentWorld.x)
      const maxY = Math.max(startWorld.y, currentWorld.y)

      selectTiles(
        tiles
          .filter((tile) => (
            tile.x < maxX &&
            tile.x + tile.width > minX &&
            tile.y < maxY &&
            tile.y + tile.height > minY
          ))
          .map((tile) => tile.id),
      )
    }

    const handleMouseUp = () => {
      if (dragRef.current?.type === 'select') setMarqueeRect(null)
      dragRef.current = null
      setIsPanning(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [gridSize, screenToWorld, selectTiles, setViewport, snapToGrid, tiles, updateTilePositions, viewport.zoom])

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
        {!isFullview && showGrid && <GridBackground tx={viewport.tx} ty={viewport.ty} zoom={viewport.zoom} gridSize={gridSize} />}

        {!isFullview && marqueeRect && (
          <div
            className="pointer-events-none absolute border"
            style={{
              left: marqueeRect.left,
              top: marqueeRect.top,
              width: marqueeRect.width,
              height: marqueeRect.height,
              background: 'rgba(255, 255, 255, 0.08)',
              borderColor: 'var(--text-display)',
              zIndex: 100,
            }}
          />
        )}

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
          {!isFullview && groupRenderData.map(({ group, bounds }) => {
            const palette = GROUP_COLORS[group.colorId]

            return (
              <div
                key={`frame-${group.id}`}
                className="pointer-events-none absolute"
                style={{
                  left: bounds.x,
                  top: bounds.y,
                  width: bounds.width,
                  height: bounds.height,
                  zIndex: 0,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    border: group.locked ? `2px solid ${palette.border}` : `2px dashed ${palette.border}`,
                    borderRadius: 16,
                    background: palette.background,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )
          })}

          {tiles.map((tile: TileState) => (
            <TileChrome
              key={tile.id}
              tile={tile}
              isFocused={tile.id === focusedTileId}
              isSelected={selectedTileIds.includes(tile.id)}
              mode={viewMode}
              fullviewTopInset={fullviewTopInset}
              isHiddenInFullview={isFullview && tile.id !== fullviewActiveTileId}
              onFocus={() => {
                focusTile(tile.id)
                if (!selectedTileIds.includes(tile.id)) selectTiles([tile.id])
                if (!isFullview) bringToFront(tile.id)
              }}
              onUpdate={(patch) => updateTile(tile.id, patch)}
              onUpdatePositions={updateTilePositions}
              onDelete={() => {
                void onDeleteTile(tile.id)
              }}
              onRemoveFromGroup={tile.groupId ? () => {
                void handleRemoveTileFromGroup(tile)
              } : undefined}
            >
              <TileContent
                key={`${tile.id}:${tileRefreshKeys[tile.id] ?? 0}`}
                tile={tile}
                isFocused={tile.id === focusedTileId}
                onFocus={() => {
                  focusTile(tile.id)
                  if (!selectedTileIds.includes(tile.id)) selectTiles([tile.id])
                  if (!isFullview) bringToFront(tile.id)
                }}
                onUpdate={(patch) => updateTile(tile.id, patch)}
              />
            </TileChrome>
          ))}

          {!isFullview && groupRenderData.map((groupState) => {
            const { group, bounds } = groupState
            const palette = GROUP_COLORS[group.colorId]
            const isSelected = selectedGroup?.id === group.id
            const toolbarScale = 1 / viewport.zoom
            const toolbarY = bounds.y - GROUP_TOOLBAR_GAP / viewport.zoom

            return (
              <div
                key={`toolbar-${group.id}`}
                className="absolute"
                style={{
                  left: bounds.x,
                  top: toolbarY,
                  zIndex: 9999,
                  transform: `scale(${toolbarScale})`,
                  transformOrigin: 'left top',
                }}
                onMouseDown={(event) => startGroupDrag(event, groupState)}
              >
                <div
                  className="flex items-center gap-2 rounded-full border px-3 py-2 shadow-sm"
                  style={{
                    background: 'var(--surface-raised)',
                    borderColor: isSelected ? palette.border : 'var(--border-visible)',
                    color: palette.text,
                    userSelect: 'none',
                    cursor: group.locked ? 'default' : 'grab',
                  }}
                >
                  <button
                    className="h-4 w-4 rounded-full border"
                    style={{
                      background: palette.swatch,
                      borderColor: 'rgba(255, 255, 255, 0.25)',
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      const containerRect = containerRef.current?.getBoundingClientRect()
                      const triggerRect = event.currentTarget.getBoundingClientRect()
                      if (!containerRect) return
                      setColorPicker({
                        groupId: group.id,
                        x: triggerRect.left - containerRect.left,
                        y: triggerRect.bottom - containerRect.top + 8,
                      })
                    }}
                    title="Group color"
                  />

                  <button
                    className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                      group.locked
                        ? 'border-transparent bg-text-primary text-bg-primary'
                        : 'border-border-visible text-text-secondary hover:bg-hover-bg hover:text-text-display'
                    }`}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      setGroupLocked(group.id, !group.locked)
                    }}
                    title={group.locked ? 'Unlock group' : 'Lock group'}
                  >
                    <Lock size={11} />
                  </button>

                  <span
                    style={{
                      minWidth: 48,
                      maxWidth: 220,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    className="nd-label"
                    title={group.name}
                  >
                    {group.name}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {showSelectionBar && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-[120] flex justify-center">
            <div
              className="pointer-events-auto flex items-center gap-2 rounded-full border px-2 py-2 shadow-sm"
              style={{
                background: 'var(--surface-raised)',
                borderColor: 'var(--border-visible)',
              }}
            >
              <span className="nd-caption px-2 text-text-secondary">
                {selectedTileIds.length} selected
              </span>
              {groupingBlockedReason && (
                <span className="nd-caption px-2 text-danger">
                  {groupingBlockedReason}
                </span>
              )}
              <button
                className="rounded-full border border-border-visible px-4 py-2 text-sm text-text-primary transition-colors hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  void onCreateGroupFromSelection()
                }}
                disabled={!canCreateGroup}
              >
                {selectionActionLabel}
              </button>
              <button
                className="rounded-full border border-border-visible px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
                onClick={() => selectTiles([])}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!isFullview && colorPicker && (
          <div
            className="absolute inset-0 z-[140]"
            onMouseDown={(event) => {
              event.stopPropagation()
              if (event.target === event.currentTarget) setColorPicker(null)
            }}
          >
            <div
              className="absolute flex items-center gap-2 rounded-2xl border p-2 shadow-sm"
              style={{
                left: colorPicker.x,
                top: colorPicker.y,
                background: 'var(--surface-raised)',
                borderColor: 'var(--border-visible)',
              }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {GROUP_COLOR_ORDER.map((colorId) => {
                const color = GROUP_COLORS[colorId]
                return (
                  <button
                    key={colorId}
                    className="h-6 w-6 rounded-full border transition-transform hover:scale-105"
                    style={{
                      background: color.swatch,
                      borderColor: colorPicker.groupId && groups.find((group) => group.id === colorPicker.groupId)?.colorId === colorId
                        ? 'rgba(255, 255, 255, 0.9)'
                        : 'rgba(255, 255, 255, 0.2)',
                    }}
                    onClick={() => {
                      setGroupColor(colorPicker.groupId, colorId as GroupColorId)
                      setColorPicker(null)
                    }}
                    title={colorId}
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            { label: selectionActionLabel, icon: LayoutGrid, action: () => { void onCreateGroupFromSelection() }, disabled: !canCreateGroup },
            { label: 'Clear Selection', action: () => selectTiles([]), disabled: selectedTileIds.length === 0 },
            { divider: true, label: '' },
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

function GridBackground({ tx, ty, zoom, gridSize }: { tx: number; ty: number; zoom: number; gridSize: number }): React.ReactElement {
  const gridSizeSmall = gridSize
  const gridSizeLarge = gridSize * 5
  const gridSmall = gridSizeSmall * zoom
  const gridLarge = gridSizeLarge * zoom

  const showSmall = gridSmall >= 4
  const showLarge = gridLarge >= 8

  if (!showSmall && !showLarge) return <div className="absolute inset-0" />

  const offsetX = tx % gridLarge
  const offsetY = ty % gridLarge

  return (
    <svg className="absolute inset-0 h-full w-full pointer-events-none" style={{ overflow: 'hidden' }}>
      <defs>
        {showSmall && (
          <pattern id="gridSmall" width={gridLarge} height={gridLarge} patternUnits="userSpaceOnUse" x={offsetX} y={offsetY}>
            <path
              d={`M ${gridSmall} 0 L 0 0 0 ${gridSmall}`}
              fill="none"
              stroke="var(--border-visible)"
              strokeWidth={0.5}
            />
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
