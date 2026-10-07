import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCanvasStore } from '@/store/canvasStore'
import { useSettingsStore } from '@/store/settingsStore'
import { TileChrome } from '@/components/TileChrome'
import { TileContent } from '@/components/TileContent'
import { ContextMenu } from '@/components/ContextMenu'
import { clampViewportToWorld } from '@/utils/canvasWorld'
import { calculateCanvasFitViewport, type CanvasFitBounds, type CanvasFitPadding } from '@/utils/canvasViewportFit'
import {
  type FileTileOpenOptions,
  type TileState,
  type ViewMode,
  type SplitViewState,
  type SplitPanelId,
  type SplitOrientation,
  type WorkspaceConfig,
} from '@shared/types'
import { getAttachedTiles } from '@shared/floatingTiles'
import { shouldAutoFocusTile } from '@/utils/focusView'
import { TileCreationSelector, type TileCreationSelectorProps } from './TileCreationSelector'
import { getCanvasCreationMenuItems, type CanvasCreationMenuInput } from './canvasCreationMenu'

export { getCanvasCreationMenuItems, type CanvasCreationMenuInput } from './canvasCreationMenu'

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

type DragState = PanDragState | SelectionDragState

// Module-level refs for exposing methods
const canvasMethodsRef = { current: null as CanvasMethods | null }

interface CanvasMethods {
  centerViewOnTile: (tileId: string) => void
  centerViewOnCanvas: () => void
  centerViewOnBounds: (bounds: CanvasFitBounds) => void
  fitViewToBounds: (
    bounds: CanvasFitBounds,
    padding?: Partial<CanvasFitPadding>,
  ) => void
  fitViewToContent: () => void
}

export function getCanvasMethods(): CanvasMethods | null {
  return canvasMethodsRef.current
}

interface CanvasProps extends CanvasCreationMenuInput {
  workspaceId: string
  workspaceConfig: WorkspaceConfig
  tileCreationSelectorProps: TileCreationSelectorProps
  onOpenBrowserTile: (url: string) => void
  onOpenFileTile: (relativePath: string, options?: FileTileOpenOptions) => void | Promise<void>
  onDeleteTile: (tileId: string) => Promise<boolean>
  onConfigureTile: (tile: TileState, x: number, y: number) => void
  onFocusTileInView: (tile: TileState) => void
  onDetachTile: (tile: TileState) => void
  tileRefreshKeys?: Record<string, number>
  viewMode?: ViewMode
  fullviewActiveTileId?: string | null
  splitViewState?: SplitViewState
  splitOrientation?: SplitOrientation
  onFocusSplitPanel?: (panel: SplitPanelId) => void
  workspaceRootPath: string
}

export function Canvas({
  workspaceId,
  workspaceConfig,
  tileCreationSelectorProps,
  onOpenBrowserTile,
  onOpenFileTile,
  onCreateTerminal,
  onCreateRichNote,
  onCreateMarkdownNote,
  onCreateBrowser,
  onCreateTimer,
  canCreateNote,
  canCreateBrowser,
  canCreateTimer,
  profiles,
  onDeleteTile,
  onConfigureTile,
  onFocusTileInView,
  onDetachTile,
  tileRefreshKeys = {},
  viewMode = 'canvas',
  fullviewActiveTileId = null,
  splitViewState,
  splitOrientation = 'vertical',
  onFocusSplitPanel,
  workspaceRootPath,
}: CanvasProps): React.ReactElement {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const spaceHeldRef = useRef(false)
  const [isPanning, setIsPanning] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  const storedTiles = useCanvasStore((s) => s.tiles)
  const tiles = useMemo(() => getAttachedTiles(storedTiles), [storedTiles])
  const viewport = useCanvasStore((s) => s.viewport)
  const selectedTileIds = useCanvasStore((s) => s.selectedTileIds)
  const setViewport = useCanvasStore((s) => s.setViewport)
  const focusedTileId = useCanvasStore((s) => s.focusedTileId)
  const selectTiles = useCanvasStore((s) => s.selectTiles)
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const updateTile = useCanvasStore((s) => s.updateTile)
  const updateTilePositions = useCanvasStore((s) => s.updateTilePositions)
  const focusTile = useCanvasStore((s) => s.focusTile)
  const isFullview = viewMode === 'fullview'
  const isSplitview = viewMode === 'splitview'
  const isFixedView = isFullview || isSplitview
  const showGrid = useSettingsStore((s) => s.showGrid)
  const gridSize = useSettingsStore((s) => s.gridSize)

  const setClampedViewport = useCallback(
    (nextViewport: { tx: number; ty: number; zoom: number }) => {
      const rect = containerRef.current?.getBoundingClientRect()
      const current = useCanvasStore.getState().viewport
      if (!rect) {
        if (current.tx !== nextViewport.tx || current.ty !== nextViewport.ty || current.zoom !== nextViewport.zoom) {
          setViewport(nextViewport)
        }
        return
      }

      const clamped = clampViewportToWorld({
        viewport: nextViewport,
        containerWidth: rect.width,
        containerHeight: rect.height,
      })
      if (current.tx !== clamped.tx || current.ty !== clamped.ty || current.zoom !== clamped.zoom) {
        setViewport(clamped)
      }
    },
    [setViewport],
  )

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      if (isFixedView) return
      if (e.target !== containerRef.current && e.target !== e.currentTarget) return
      setContextMenu({ x: e.clientX, y: e.clientY })
    },
    [isFixedView],
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
      setClampedViewport({ tx: newTx, ty: newTy, zoom: viewport.zoom })
    },
    [tiles, viewport.zoom, setClampedViewport],
  )

  const centerViewOnCanvas = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setClampedViewport({ tx: rect.width / 2, ty: rect.height / 2, zoom: 1 })
  }, [setClampedViewport])

  const centerViewOnBounds = useCallback(
    ({ minX, minY, maxX, maxY }: CanvasFitBounds) => {
      if (!containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const boundsWidth = Math.max(1, maxX - minX)
      const boundsHeight = Math.max(1, maxY - minY)
      const centerX = minX + boundsWidth / 2
      const centerY = minY + boundsHeight / 2

      setClampedViewport({
        tx: rect.width / 2 - centerX * viewport.zoom,
        ty: rect.height / 2 - centerY * viewport.zoom,
        zoom: viewport.zoom,
      })
    },
    [viewport.zoom, setClampedViewport],
  )

  const fitViewToBounds = useCallback(
    (
      bounds: CanvasFitBounds,
      padding?: Partial<CanvasFitPadding>,
    ) => {
      if (!containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      setClampedViewport(calculateCanvasFitViewport({
        bounds,
        container: { width: rect.width, height: rect.height },
        padding,
      }))
    },
    [setClampedViewport],
  )

  const fitViewToContent = useCallback(() => {
    if (!containerRef.current) return

    if (tiles.length === 0) {
      centerViewOnCanvas()
      return
    }

    const horizontalStarts = tiles.map((tile) => tile.x)
    const verticalStarts = tiles.map((tile) => tile.y)
    const horizontalEnds = tiles.map((tile) => tile.x + tile.width)
    const verticalEnds = tiles.map((tile) => tile.y + tile.height)
    const minX = Math.min(...horizontalStarts)
    const minY = Math.min(...verticalStarts)
    const maxX = Math.max(...horizontalEnds)
    const maxY = Math.max(...verticalEnds)

    fitViewToBounds({ minX, minY, maxX, maxY })
  }, [tiles, centerViewOnCanvas, fitViewToBounds])

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
      if (isFixedView) return
      const rect = containerRef.current!.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
      const newZoom = Math.max(0.1, Math.min(5, viewport.zoom * zoomFactor))
      const newTx = mx - (mx - viewport.tx) * (newZoom / viewport.zoom)
      const newTy = my - (my - viewport.ty) * (newZoom / viewport.zoom)

      setClampedViewport({ tx: newTx, ty: newTy, zoom: newZoom })
    },
    [isFixedView, viewport, setClampedViewport],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isFixedView) return
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
    [isFixedView, viewport, focusTile, selectTiles],
  )

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return

      if (drag.type === 'pan') {
        const dx = e.clientX - drag.startX
        const dy = e.clientY - drag.startY
        setClampedViewport({
          tx: drag.initTx + dx,
          ty: drag.initTy + dy,
          zoom: viewport.zoom,
        })
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
  }, [screenToWorld, selectTiles, setClampedViewport, tiles, viewport.zoom])

  useEffect(() => {
    if (isFixedView) return
    setClampedViewport(viewport)
  }, [isFixedView, setClampedViewport, viewport])

  useEffect(() => {
    if (isFixedView || !containerRef.current) return

    const observer = new ResizeObserver(() => {
      setClampedViewport(useCanvasStore.getState().viewport)
    })
    observer.observe(containerRef.current)

    return () => observer.disconnect()
  }, [isFixedView, setClampedViewport])

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
          background: isFixedView ? 'var(--bg-primary)' : 'var(--surface-panel)',
          cursor: isFixedView ? 'default' : isPanning ? 'grabbing' : spaceHeldRef.current ? 'grab' : 'default',
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onContextMenu={onContextMenu}
      >
        {tiles.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <div className="nd-panel-raised w-full max-w-xl rounded-[20px] px-5 py-8 text-center text-text-secondary">
              <div className="nd-label">{t('ui.empty')}</div>
              <div className="mt-3 text-sm text-text-disabled">{t('ui.createWorkspaceContent')}</div>
              <TileCreationSelector {...tileCreationSelectorProps} className="mt-5 text-left" />
            </div>
          </div>
        ) : (
          <>
            {!isFixedView && showGrid && <GridBackground tx={viewport.tx} ty={viewport.ty} zoom={viewport.zoom} gridSize={gridSize} />}

        {!isFixedView && marqueeRect && (
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
            inset: isFixedView ? 0 : undefined,
            transform: isFixedView ? 'none' : `translate(${viewport.tx}px, ${viewport.ty}px) scale(${viewport.zoom})`,
            transformOrigin: isFixedView ? undefined : '0 0',
            width: isFixedView ? '100%' : 0,
            height: isFixedView ? '100%' : 0,
          }}
        >
          {tiles.map((tile: TileState) => {
            const splitPanel: SplitPanelId | undefined = splitViewState?.activeLeftTileId === tile.id
              ? 'left'
              : splitViewState?.activeRightTileId === tile.id
                ? 'right'
                : undefined
            const hiddenInFixedView = isFullview
              ? tile.id !== fullviewActiveTileId
              : isSplitview
                ? splitPanel === undefined
                : false

            return (
              <TileChrome
                key={tile.id}
                tile={tile}
                isFocused={tile.id === focusedTileId}
                isSelected={selectedTileIds.includes(tile.id)}
                mode={viewMode}
                isHiddenInFullview={hiddenInFixedView}
                splitPanel={splitPanel}
                splitOrientation={splitOrientation}
                onFocus={() => {
                  if (isSplitview && splitPanel) onFocusSplitPanel?.(splitPanel)
                  focusTile(tile.id)
                  if (!selectedTileIds.includes(tile.id)) selectTiles([tile.id])
                  if (!isFixedView) bringToFront(tile.id)
                }}
                onUpdate={(patch) => updateTile(tile.id, patch)}
                onUpdatePositions={updateTilePositions}
                onConfigure={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  onConfigureTile(tile, rect.left, rect.bottom + 6)
                }}
                onFocusView={() => onFocusTileInView(tile)}
                onDetach={() => onDetachTile(tile)}
                onDelete={() => {
                  void onDeleteTile(tile.id)
                }}
              >
                <TileContent
                  key={`${tile.id}:${tileRefreshKeys[tile.id] ?? 0}`}
                  tile={tile}
                  workspaceId={workspaceId}
                  workspaceConfig={workspaceConfig}
                  isFocused={tile.id === focusedTileId}
                  edgeToEdge={isFixedView}
                  isVisible={!(isFixedView && hiddenInFixedView)}
                  autoFocus={shouldAutoFocusTile(viewMode, tile.id, fullviewActiveTileId, !hiddenInFixedView)}
                  onFocus={() => {
                    if (isSplitview && splitPanel) onFocusSplitPanel?.(splitPanel)
                    focusTile(tile.id)
                    if (!selectedTileIds.includes(tile.id)) selectTiles([tile.id])
                    if (!isFixedView) bringToFront(tile.id)
                  }}
                  onUpdate={(patch) => updateTile(tile.id, patch)}
                  onDelete={() => onDeleteTile(tile.id)}
                  onOpenBrowserTile={onOpenBrowserTile}
                  onOpenFileTile={onOpenFileTile}
                  workspaceRootPath={workspaceRootPath}
                />
              </TileChrome>
            )
          })}

        </div>

          </>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            { label: t('canvas.clearSelection'), action: () => selectTiles([]), disabled: selectedTileIds.length === 0 },
            { divider: true, label: '' },
            ...getCanvasCreationMenuItems({
              translate: (key) => t(key),
              onCreateTerminal,
              onCreateRichNote,
              onCreateMarkdownNote,
              onCreateBrowser,
              onCreateTimer,
              canCreateNote,
              canCreateBrowser,
              canCreateTimer,
              profiles,
            }),
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
