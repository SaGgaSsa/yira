import { create } from 'zustand'
import {
  normalizeFileMarkdownViewMode,
  normalizeMarkdownViewMode,
  normalizeNoteKind,
  normalizeTileSize,
  type TileState,
  type CanvasState,
  type Viewport,
  type ShellProfileId,
  type ViewMode,
  type SplitViewState,
  type SplitPanelId,
  type WorkspaceConfig,
  type WorkspaceType,
  type GridViewState,
  type GridWorkspaceState,
  type WindowBounds,
} from '@shared/types'
import { normalizeWorkspaceConfig } from '@shared/workspaceConfig'
import { createEmptyGridWorkspaceState, insertTileIntoGridLayout, normalizeGridLayout, normalizeGridWorkspaceState, removeTileFromGridLayout } from '@shared/gridWorkspaceState'
import {
  attachFloatingTile as attachFloatingTileState,
  detachTileForFloating,
  getAttachedTiles,
  normalizeFloatingTileState,
} from '@shared/floatingTiles'
import { DEFAULT_SPLIT_ORIENTATION, normalizeSplitOrientation } from '@/utils/splitViewState'
import { clampTileToWorld, normalizeFiniteViewport } from '@/utils/canvasWorld'
import {
  getNextTerminalAttentionEntry,
  TERMINAL_ATTENTION_GRACE_MS,
  type TerminalAttentionEntry,
} from '@/utils/terminalAttention'
import {
  pinFileTileForDetach,
  pinFileTileForDraft,
  pinFileTileForRename,
} from '@/utils/fileTileLifecycle'

const EMPTY_SPLIT_VIEW_STATE: SplitViewState = {
  leftTileIds: [],
  rightTileIds: [],
  activeLeftTileId: null,
  activeRightTileId: null,
  focusedPanel: 'left',
  orientation: DEFAULT_SPLIT_ORIENTATION,
}
const EMPTY_GRID_VIEW_STATE: GridViewState = {
  rootNode: null,
}

function moveTileIdToFront(tileIds: string[], tileId: string | null): string[] {
  if (!tileId) return tileIds
  if (!tileIds.includes(tileId)) return tileIds
  return [tileId, ...tileIds.filter((id) => id !== tileId)]
}

function normalizeViewMode(mode: CanvasState['viewMode'] | undefined): ViewMode {
  return mode === 'canvas' || mode === 'fullview' || mode === 'splitview' || mode === 'board'
    ? mode
    : 'fullview'
}

function normalizeWorkspaceViewMode(mode: ViewMode | undefined, type: WorkspaceType): ViewMode {
  if (type === 'grid') return mode === 'board' || mode === 'fullview' || mode === 'splitview' ? mode : 'gridview'
  return mode === 'canvas' || mode === 'splitview' || mode === 'fullview' || mode === 'board' ? mode : 'fullview'
}

function normalizeSplitViewState(
  splitViewState: SplitViewState | undefined,
  tiles: TileState[],
  focusedTileId: string | null,
  fullviewActiveTileId: string | null,
): SplitViewState {
  const tileIds = getAttachedTiles(tiles).map((tile) => tile.id)
  const existingIds = new Set(tileIds)
  const seen = new Set<string>()
  const cleanPanelIds = (ids?: string[]) => (ids ?? []).filter((tileId) => {
    if (!existingIds.has(tileId) || seen.has(tileId)) return false
    seen.add(tileId)
    return true
  })

  const leftTileIds = cleanPanelIds(splitViewState?.leftTileIds)
  const rightTileIds = cleanPanelIds(splitViewState?.rightTileIds)
  const preferredActiveId =
    (focusedTileId && existingIds.has(focusedTileId) ? focusedTileId : null) ??
    (fullviewActiveTileId && existingIds.has(fullviewActiveTileId) ? fullviewActiveTileId : null) ??
    tileIds[0]
  const missingTileIds = tileIds.filter((tileId) => !seen.has(tileId))
  const missingActiveId = preferredActiveId && missingTileIds.includes(preferredActiveId)
    ? preferredActiveId
    : null
  const missingInactiveIds = missingTileIds.filter((tileId) => tileId !== missingActiveId)
  const nextLeftTileIds = missingActiveId
    ? [missingActiveId, ...leftTileIds]
    : leftTileIds
  const nextRightTileIds = [...rightTileIds, ...missingInactiveIds]
  const activeLeftTileId = missingActiveId ?? (splitViewState?.activeLeftTileId && nextLeftTileIds.includes(splitViewState.activeLeftTileId)
    ? splitViewState.activeLeftTileId
    : nextLeftTileIds[0] ?? null)
  const activeRightTileId = splitViewState?.activeRightTileId && nextRightTileIds.includes(splitViewState.activeRightTileId)
    ? splitViewState.activeRightTileId
    : nextRightTileIds[0] ?? null

  if (nextLeftTileIds.length > 0 && nextRightTileIds.length > 0) {
    return {
      leftTileIds: nextLeftTileIds,
      rightTileIds: nextRightTileIds,
      activeLeftTileId,
      activeRightTileId,
      focusedPanel: splitViewState?.focusedPanel === 'right' ? 'right' : 'left',
      orientation: normalizeSplitOrientation(splitViewState?.orientation),
    }
  }

  if (tiles.length < 2) return { ...EMPTY_SPLIT_VIEW_STATE }

  const rebuiltLeftIds = preferredActiveId ? [preferredActiveId] : []
  const rebuiltRightIds = tileIds.filter((tileId) => tileId !== preferredActiveId)

  return {
    leftTileIds: rebuiltLeftIds,
    rightTileIds: rebuiltRightIds,
    activeLeftTileId: rebuiltLeftIds[0] ?? null,
    activeRightTileId: rebuiltRightIds[0] ?? null,
    focusedPanel: 'left',
    orientation: normalizeSplitOrientation(splitViewState?.orientation),
  }
}

function isTileInSplitState(splitViewState: SplitViewState, tileId: string): boolean {
  return splitViewState.leftTileIds.includes(tileId) || splitViewState.rightTileIds.includes(tileId)
}

function normalizeTile(tile: TileState): TileState {
  const { width, height } = normalizeTileSize(tile.type, tile)
  const { hideTitlebar: _hideTitlebar, ...tileWithoutTitlebar } = tile as TileState & { hideTitlebar?: unknown }
  const normalizedTile = tileWithoutTitlebar.notificationsMuted === false
    ? { ...tileWithoutTitlebar, notificationsMuted: undefined }
    : tileWithoutTitlebar
  const normalizedNote = normalizedTile.type !== 'note'
    ? normalizedTile
    : normalizeNoteKind(normalizedTile.noteKind) === 'markdown'
      ? {
          ...normalizedTile,
          noteKind: 'markdown' as const,
          markdown: typeof normalizedTile.markdown === 'string' ? normalizedTile.markdown : '',
          markdownView: normalizeMarkdownViewMode(normalizedTile.markdownView),
        }
      : normalizedTile.noteKind === undefined
        ? normalizedTile
        : { ...normalizedTile, noteKind: 'rich' as const }
  const normalizedFile = normalizedNote.type === 'files'
    ? { ...normalizedNote, fileMarkdownView: normalizeFileMarkdownViewMode(normalizedNote.fileMarkdownView) }
    : normalizedNote
  const floatingNormalizedTile = normalizeFloatingTileState(normalizedFile)

  if (width === floatingNormalizedTile.width && height === floatingNormalizedTile.height) return clampTileToWorld(floatingNormalizedTile)

  return clampTileToWorld({
    ...floatingNormalizedTile,
    width,
    height,
  })
}

function isSupportedTile(tile: TileState): boolean {
  return tile.type === 'terminal' ||
    tile.type === 'note' ||
    tile.type === 'browser' ||
    tile.type === 'timer' ||
    (tile.type === 'files' && typeof tile.filePath === 'string' && tile.filePath.trim().length > 0)
}

function hasPatchProperty(patch: Partial<TileState>, property: keyof TileState): boolean {
  return Object.prototype.hasOwnProperty.call(patch, property)
}

function pinFilesTileForPatch(tile: TileState, patch: Partial<TileState>): TileState {
  if (tile.type !== 'files') return { ...tile, ...patch }
  const nextTile = { ...tile, ...patch }
  if (hasPatchProperty(patch, 'fileDraft') && typeof patch.fileDraft === 'string') {
    return pinFileTileForDraft(nextTile, patch.fileDraft)
  }
  if (hasPatchProperty(patch, 'label') && typeof patch.label === 'string') {
    return pinFileTileForRename(nextTile, patch.label)
  }
  return nextTile
}

function isTerminalNotificationMuted(tile: TileState): boolean {
  return tile.type === 'terminal' && tile.notificationsMuted === true
}

function warnCanvasWorldNormalization(scope: string, state: CanvasState, tiles: TileState[], viewport: Viewport): void {
  const isDevelopment = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
  if (!isDevelopment) return

  const tileChanged = state.tiles.some((tile, index) => {
    const next = tiles[index]
    return !next ||
      tile.x !== next.x ||
      tile.y !== next.y ||
      tile.width !== next.width ||
      tile.height !== next.height
  })
  const viewportChanged =
    state.viewport.tx !== viewport.tx ||
    state.viewport.ty !== viewport.ty ||
    state.viewport.zoom !== viewport.zoom

  if (!tileChanged && !viewportChanged) return

  console.warn(`[canvas] normalized ${scope} world state`, {
    tiles: tileChanged,
    viewport: viewportChanged,
  })
}

interface CanvasStore {
  // State
  tiles: TileState[]
  viewport: Viewport
  nextZIndex: number
  focusedTileId: string | null
  viewMode: ViewMode
  fullviewActiveTileId: string | null
  boardVisible: boolean
  splitViewState: SplitViewState
  gridViewState: GridViewState
  selectedTileIds: string[]
  terminalTitles: Record<string, string>
  terminalAttention: Record<string, TerminalAttentionEntry>
  terminalAttentionGraceUntil: Record<string, number>
  activeWorkspaceId: string
  activeWorkspaceName: string
  activeWorkspaceConfig: WorkspaceConfig
  availableProfiles: Array<{ id: ShellProfileId; label: string; available: boolean }>

  // Actions
  setViewport: (vp: Viewport) => void
  setTiles: (tiles: TileState[]) => void
  restoreState: (state: CanvasState) => void

  addTile: (tile: TileState) => void
  removeTile: (tileId: string) => void
  updateTile: (tileId: string, patch: Partial<TileState>) => void
  detachTileToFloating: (tileId: string, bounds?: WindowBounds) => void
  attachFloatingTile: (tileId: string) => void
  updateTilePositions: (positions: Array<{ id: string; x: number; y: number }>) => void
  focusTile: (tileId: string | null) => void
  setViewMode: (mode: ViewMode) => void
  setBoardVisible: (visible: boolean) => void
  setFullviewActiveTileId: (tileId: string | null) => void
  setSplitViewState: (state: SplitViewState) => void
  setGridViewState: (state: GridViewState) => void
  setSplitPanelActiveTile: (panel: SplitPanelId, tileId: string | null) => void
  setSplitFocusedPanel: (panel: SplitPanelId) => void
  setTerminalTitle: (tileId: string, title: string | null) => void
  clearTerminalTitle: (tileId: string) => void
  registerTerminalCreated: (tileId: string, now?: number) => void
  markTerminalOutput: (tileId: string, now?: number) => boolean
  clearTerminalAttention: (tileId: string) => void
  clearAllTerminalAttention: () => void
  selectTiles: (tileIds: string[]) => void

  bringToFront: (tileId: string) => number

  setWorkspace: (id: string, name: string, config?: WorkspaceConfig) => void
  restoreWorkspaceState: (id: string, name: string, config: WorkspaceConfig | undefined, state: CanvasState) => void
  restoreGridWorkspaceState: (id: string, name: string, config: WorkspaceConfig | undefined, state: GridWorkspaceState | null) => void
  setProfiles: (profiles: Array<{ id: ShellProfileId; label: string; available: boolean }>) => void
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  tiles: [],
  viewport: { tx: 0, ty: 0, zoom: 1 },
  nextZIndex: 1,
  focusedTileId: null,
  viewMode: 'fullview',
  fullviewActiveTileId: null,
  boardVisible: true,
  splitViewState: { ...EMPTY_SPLIT_VIEW_STATE },
  gridViewState: { ...EMPTY_GRID_VIEW_STATE },
  selectedTileIds: [],
  terminalTitles: {},
  terminalAttention: {},
  terminalAttentionGraceUntil: {},
  activeWorkspaceId: '',
  activeWorkspaceName: '',
  activeWorkspaceConfig: normalizeWorkspaceConfig({}),
  availableProfiles: [],

  setViewport: (vp) => set({ viewport: normalizeFiniteViewport(vp) }),
  setTiles: (tiles) => set((s) => {
    const normalizedTiles = tiles.filter(isSupportedTile).map(normalizeTile)
    const nextIds = new Set(normalizedTiles.map((tile) => tile.id))
    const unmutedTerminalIds = new Set(
      normalizedTiles
        .filter((tile) => tile.type === 'terminal' && tile.notificationsMuted !== true)
        .map((tile) => tile.id),
    )
    const nextTerminalTitles = Object.fromEntries(
      Object.entries(s.terminalTitles).filter(([tileId]) => nextIds.has(tileId)),
    )
    const nextTerminalAttention = Object.fromEntries(
      Object.entries(s.terminalAttention).filter(([tileId]) => unmutedTerminalIds.has(tileId)),
    )
    const nextTerminalAttentionGraceUntil = Object.fromEntries(
      Object.entries(s.terminalAttentionGraceUntil).filter(([tileId]) => nextIds.has(tileId)),
    )

    return {
      tiles: normalizedTiles,
      terminalTitles: nextTerminalTitles,
      terminalAttention: nextTerminalAttention,
      terminalAttentionGraceUntil: nextTerminalAttentionGraceUntil,
    }
  }),

  restoreState: (state) => set(() => {
    const inputTiles = state.tiles.filter(isSupportedTile)
    const normalizedTiles = inputTiles.map(normalizeTile)
    const viewport = normalizeFiniteViewport(state.viewport)
    const fullviewActiveTileId =
      state.fullviewActiveTileId ??
      state.focusedTileId ??
      normalizedTiles[0]?.id ??
      null
    warnCanvasWorldNormalization('restore', state, normalizedTiles, viewport)

    return {
      tiles: normalizedTiles,
      viewport,
      nextZIndex: state.nextZIndex,
      focusedTileId: state.focusedTileId ?? null,
      viewMode: normalizeViewMode(state.viewMode),
      boardVisible: state.boardVisible !== false,
      fullviewActiveTileId,
      splitViewState: normalizeSplitViewState(state.splitViewState, normalizedTiles, state.focusedTileId ?? null, fullviewActiveTileId),
      gridViewState: { ...EMPTY_GRID_VIEW_STATE },
      selectedTileIds: [],
      terminalTitles: {},
      terminalAttention: {},
      terminalAttentionGraceUntil: {},
    }
  }),

  addTile: (tile) => set((s) => {
    const normalizedTile = normalizeTile(tile)
    const gridState = s.activeWorkspaceConfig.type === 'grid'
      ? { gridViewState: { rootNode: insertTileIntoGridLayout(s.gridViewState.rootNode, tile.id) } }
      : {}

    if (s.viewMode !== 'splitview' || isTileInSplitState(s.splitViewState, tile.id)) {
      return {
        ...gridState,
        tiles: [...s.tiles, normalizedTile],
        nextZIndex: tile.zIndex + 1,
      }
    }

    const targetPanel = s.splitViewState.focusedPanel

    return {
      ...gridState,
      tiles: [...s.tiles, normalizedTile],
      nextZIndex: tile.zIndex + 1,
      splitViewState: targetPanel === 'left'
        ? {
            ...s.splitViewState,
            leftTileIds: [...s.splitViewState.leftTileIds, tile.id],
            activeLeftTileId: tile.id,
          }
        : {
            ...s.splitViewState,
            rightTileIds: [...s.splitViewState.rightTileIds, tile.id],
            activeRightTileId: tile.id,
          },
    }
  }),

  removeTile: (tileId) => set((s) => {
    const nextSplitViewState = {
      ...s.splitViewState,
      leftTileIds: s.splitViewState.leftTileIds.filter((id) => id !== tileId),
      rightTileIds: s.splitViewState.rightTileIds.filter((id) => id !== tileId),
    }

    return {
      tiles: s.tiles.filter(t => t.id !== tileId),
      focusedTileId: s.focusedTileId === tileId ? null : s.focusedTileId,
      fullviewActiveTileId: s.fullviewActiveTileId === tileId ? null : s.fullviewActiveTileId,
      splitViewState: {
        ...nextSplitViewState,
        activeLeftTileId: nextSplitViewState.activeLeftTileId === tileId
          ? nextSplitViewState.leftTileIds[0] ?? null
          : nextSplitViewState.activeLeftTileId,
        activeRightTileId: nextSplitViewState.activeRightTileId === tileId
          ? nextSplitViewState.rightTileIds[0] ?? null
          : nextSplitViewState.activeRightTileId,
      },
      gridViewState: {
        rootNode: removeTileFromGridLayout(s.gridViewState.rootNode, tileId),
      },
      selectedTileIds: s.selectedTileIds.filter(id => id !== tileId),
      terminalTitles: Object.fromEntries(
        Object.entries(s.terminalTitles).filter(([id]) => id !== tileId),
      ),
      terminalAttention: Object.fromEntries(
        Object.entries(s.terminalAttention).filter(([id]) => id !== tileId),
      ),
      terminalAttentionGraceUntil: Object.fromEntries(
        Object.entries(s.terminalAttentionGraceUntil).filter(([id]) => id !== tileId),
      ),
    }
  }),

  updateTile: (tileId, patch) => set((s) => {
    const nextTiles = s.tiles.map((tile) => (
      tile.id === tileId
        ? normalizeTile(pinFilesTileForPatch(tile, patch))
        : tile
    ))
    if (patch.notificationsMuted !== true) return { tiles: nextTiles }

    return {
      tiles: nextTiles,
      terminalAttention: Object.fromEntries(
        Object.entries(s.terminalAttention).filter(([id]) => id !== tileId),
      ),
    }
  }),

  detachTileToFloating: (tileId, bounds) => set((s) => {
    const detached = detachTileForFloating({
      tiles: s.tiles.map((tile) => tile.id === tileId ? pinFileTileForDetach(tile) : tile),
      tileId,
      gridRootNode: s.activeWorkspaceConfig.type === 'grid' ? s.gridViewState.rootNode : undefined,
      bounds,
    })
    const nextTiles = detached.tiles.map(normalizeTile)
    const nextAttachedTiles = getAttachedTiles(nextTiles)
    const nextAttachedIds = new Set(nextAttachedTiles.map((tile) => tile.id))
    const nextFullviewActiveTileId = s.fullviewActiveTileId && nextAttachedIds.has(s.fullviewActiveTileId)
      ? s.fullviewActiveTileId
      : nextAttachedTiles[0]?.id ?? null
    const nextFocusedTileId = s.focusedTileId && nextAttachedIds.has(s.focusedTileId)
      ? s.focusedTileId
      : null
    const nextSplitViewState = normalizeSplitViewState(
      s.splitViewState,
      nextTiles,
      nextFocusedTileId,
      nextFullviewActiveTileId,
    )

    return {
      tiles: nextTiles,
      focusedTileId: nextFocusedTileId,
      fullviewActiveTileId: nextFullviewActiveTileId,
      splitViewState: nextSplitViewState,
      gridViewState: detached.gridRootNode === undefined
        ? s.gridViewState
        : { rootNode: detached.gridRootNode },
      selectedTileIds: s.selectedTileIds.filter((id) => id !== tileId),
    }
  }),

  attachFloatingTile: (tileId) => set((s) => {
    if (!s.tiles.some((tile) => tile.id === tileId)) return {}

    const attached = attachFloatingTileState({
      tiles: s.tiles,
      tileId,
      gridRootNode: s.activeWorkspaceConfig.type === 'grid' ? s.gridViewState.rootNode : undefined,
    })
    const nextTiles = attached.tiles.map(normalizeTile)

    return {
      tiles: nextTiles,
      focusedTileId: tileId,
      fullviewActiveTileId: tileId,
      gridViewState: attached.gridRootNode === undefined
        ? s.gridViewState
        : { rootNode: attached.gridRootNode },
      selectedTileIds: [tileId],
    }
  }),

  updateTilePositions: (positions) => set((s) => {
    const positionsById = new Map(positions.map((entry) => [entry.id, entry]))

    return {
      tiles: s.tiles.map((tile) => {
        const next = positionsById.get(tile.id)
        return next ? normalizeTile({ ...tile, x: next.x, y: next.y }) : tile
      }),
    }
  }),

  focusTile: (tileId) => set({ focusedTileId: tileId }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setBoardVisible: (boardVisible) => set({ boardVisible }),
  setFullviewActiveTileId: (tileId) => set({ fullviewActiveTileId: tileId }),
  setSplitViewState: (splitViewState) => set({ splitViewState }),
  setGridViewState: (gridViewState) => set((s) => ({
    gridViewState: {
      rootNode: normalizeGridLayout(gridViewState.rootNode, s.tiles),
    },
  })),
  setSplitPanelActiveTile: (panel, tileId) => set((s) => ({
    splitViewState: panel === 'left'
      ? {
          ...s.splitViewState,
          leftTileIds: moveTileIdToFront(s.splitViewState.leftTileIds, tileId),
          activeLeftTileId: tileId,
          focusedPanel: 'left',
        }
      : {
          ...s.splitViewState,
          rightTileIds: moveTileIdToFront(s.splitViewState.rightTileIds, tileId),
          activeRightTileId: tileId,
          focusedPanel: 'right',
        },
  })),
  setSplitFocusedPanel: (focusedPanel) => set((s) => ({
    splitViewState: { ...s.splitViewState, focusedPanel },
  })),
  setTerminalTitle: (tileId, title) => set((s) => {
    const normalized = title?.trim()
    const existing = s.terminalTitles[tileId]

    if (!normalized) {
      if (existing === undefined) return {}

      const { [tileId]: _removed, ...terminalTitles } = s.terminalTitles
      return { terminalTitles }
    }

    if (existing === normalized) return {}

    return {
      terminalTitles: {
        ...s.terminalTitles,
        [tileId]: normalized,
      },
    }
  }),
  clearTerminalTitle: (tileId) => set((s) => {
    if (s.terminalTitles[tileId] === undefined) return {}

    const { [tileId]: _removed, ...terminalTitles } = s.terminalTitles
    return { terminalTitles }
  }),
  registerTerminalCreated: (tileId, now = Date.now()) => set((s) => ({
    terminalAttentionGraceUntil: {
      ...s.terminalAttentionGraceUntil,
      [tileId]: now + TERMINAL_ATTENTION_GRACE_MS,
    },
  })),
  markTerminalOutput: (tileId, now = Date.now()) => {
    const state = get()
    const graceUntil = state.terminalAttentionGraceUntil[tileId] ?? 0
    if (now < graceUntil) return false
    const tile = state.tiles.find((entry) => entry.id === tileId)
    if (!tile || tile.type !== 'terminal' || isTerminalNotificationMuted(tile)) return false

    const current = state.terminalAttention[tileId]
    const next = getNextTerminalAttentionEntry(current, now)
    const countChanged = next.count !== (current?.count ?? 0)

    set((s) => ({
      terminalAttention: {
        ...s.terminalAttention,
        [tileId]: next,
      },
    }))

    return countChanged
  },
  clearTerminalAttention: (tileId) => set((s) => {
    if (s.terminalAttention[tileId] === undefined) return {}

    const { [tileId]: _removed, ...terminalAttention } = s.terminalAttention
    return { terminalAttention }
  }),
  clearAllTerminalAttention: () => set({ terminalAttention: {} }),

  selectTiles: (tileIds) => set({ selectedTileIds: tileIds }),

  bringToFront: (tileId) => {
    const { nextZIndex } = get()
    set((s) => ({
      tiles: s.tiles.map(t => t.id === tileId ? { ...t, zIndex: nextZIndex } : t),
      nextZIndex: nextZIndex + 1,
    }))
    return nextZIndex
  },

  setWorkspace: (id, name, config = normalizeWorkspaceConfig({})) => set((s) => {
    const normalizedConfig = normalizeWorkspaceConfig(config)
    return {
      activeWorkspaceId: id,
      activeWorkspaceName: name,
      activeWorkspaceConfig: normalizedConfig,
      viewMode: normalizeWorkspaceViewMode(s.viewMode, normalizedConfig.type),
    }
  }),
  restoreWorkspaceState: (id, name, config = normalizeWorkspaceConfig({}), state) => set(() => {
    const normalizedConfig = normalizeWorkspaceConfig(config)
    const normalizedTiles = state.tiles.map(normalizeTile)
    const viewport = normalizeFiniteViewport(state.viewport)
    const fullviewActiveTileId =
      state.fullviewActiveTileId ??
      state.focusedTileId ??
      normalizedTiles[0]?.id ??
      null
    warnCanvasWorldNormalization('workspace restore', state, normalizedTiles, viewport)

    return {
      activeWorkspaceId: id,
      activeWorkspaceName: name,
      activeWorkspaceConfig: normalizedConfig,
      tiles: normalizedTiles,
      viewport,
      nextZIndex: state.nextZIndex,
      focusedTileId: state.focusedTileId ?? null,
      viewMode: normalizeViewMode(state.viewMode),
      boardVisible: state.boardVisible !== false,
      fullviewActiveTileId,
      splitViewState: normalizeSplitViewState(state.splitViewState, normalizedTiles, state.focusedTileId ?? null, fullviewActiveTileId),
      gridViewState: { ...EMPTY_GRID_VIEW_STATE },
      selectedTileIds: [],
      terminalTitles: {},
      terminalAttention: {},
      terminalAttentionGraceUntil: {},
    }
  }),
  restoreGridWorkspaceState: (id, name, config = normalizeWorkspaceConfig({ type: 'grid' }), state) => set(() => {
    const normalizedConfig = normalizeWorkspaceConfig({ ...config, type: 'grid' })
    const normalized = normalizeGridWorkspaceState(state ?? createEmptyGridWorkspaceState())

    return {
      activeWorkspaceId: id,
      activeWorkspaceName: name,
      activeWorkspaceConfig: normalizedConfig,
      tiles: normalized.tiles,
      viewport: { tx: 0, ty: 0, zoom: 1 },
      nextZIndex: normalized.nextZIndex,
      focusedTileId: normalized.focusedTileId,
      viewMode: normalized.viewMode,
      boardVisible: normalized.boardVisible !== false,
      fullviewActiveTileId: normalized.fullviewActiveTileId,
      splitViewState: normalizeSplitViewState(normalized.splitViewState, normalized.tiles, normalized.focusedTileId, normalized.fullviewActiveTileId),
      gridViewState: normalized.gridViewState,
      selectedTileIds: [],
      terminalTitles: {},
      terminalAttention: {},
      terminalAttentionGraceUntil: {},
    }
  }),
  setProfiles: (profiles) => set({ availableProfiles: profiles }),
}))
