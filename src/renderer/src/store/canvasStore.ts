import { create } from 'zustand'
import { GROUP_COLOR_ORDER, NOTE_TILE_MIN_HEIGHT, NOTE_TILE_MIN_WIDTH, type TileState, type CanvasState, type Viewport, type ShellProfileId, type TileGroup, type GroupColorId, type ViewMode, type SplitViewState, type SplitPanelId, type WorkspaceConfig } from '@shared/types'
import { getGroupingBlockedReason } from '@/utils/grouping'

const UNTITLED_GROUP_NAME = 'Untitled Group'
const DEFAULT_GROUP_COLOR: GroupColorId = GROUP_COLOR_ORDER[0]
const EMPTY_SPLIT_VIEW_STATE: SplitViewState = {
  leftTileIds: [],
  rightTileIds: [],
  activeLeftTileId: null,
  activeRightTileId: null,
  focusedPanel: 'left',
}

function moveTileIdToFront(tileIds: string[], tileId: string | null): string[] {
  if (!tileId) return tileIds
  if (!tileIds.includes(tileId)) return tileIds
  return [tileId, ...tileIds.filter((id) => id !== tileId)]
}

function normalizeViewMode(mode: CanvasState['viewMode'] | undefined): ViewMode {
  return mode === 'canvas' || mode === 'fullview' || mode === 'splitview'
    ? mode
    : 'fullview'
}

function normalizeSplitViewState(
  splitViewState: SplitViewState | undefined,
  tiles: TileState[],
  focusedTileId: string | null,
  fullviewActiveTileId: string | null,
): SplitViewState {
  const tileIds = tiles.map((tile) => tile.id)
  const existingIds = new Set(tileIds)
  const seen = new Set<string>()
  const cleanPanelIds = (ids?: string[]) => (ids ?? []).filter((tileId) => {
    if (!existingIds.has(tileId) || seen.has(tileId)) return false
    seen.add(tileId)
    return true
  })

  const leftTileIds = cleanPanelIds(splitViewState?.leftTileIds)
  const rightTileIds = cleanPanelIds(splitViewState?.rightTileIds)
  const activeLeftTileId = splitViewState?.activeLeftTileId && leftTileIds.includes(splitViewState.activeLeftTileId)
    ? splitViewState.activeLeftTileId
    : leftTileIds[0] ?? null
  const activeRightTileId = splitViewState?.activeRightTileId && rightTileIds.includes(splitViewState.activeRightTileId)
    ? splitViewState.activeRightTileId
    : rightTileIds[0] ?? null

  if (leftTileIds.length > 0 && rightTileIds.length > 0) {
    return {
      leftTileIds,
      rightTileIds,
      activeLeftTileId,
      activeRightTileId,
      focusedPanel: splitViewState?.focusedPanel === 'right' ? 'right' : 'left',
    }
  }

  if (tiles.length < 2) return { ...EMPTY_SPLIT_VIEW_STATE }

  const preferredActiveId =
    (focusedTileId && existingIds.has(focusedTileId) ? focusedTileId : null) ??
    (fullviewActiveTileId && existingIds.has(fullviewActiveTileId) ? fullviewActiveTileId : null) ??
    tileIds[0]
  const rebuiltLeftIds = preferredActiveId ? [preferredActiveId] : []
  const rebuiltRightIds = tileIds.filter((tileId) => tileId !== preferredActiveId)

  return {
    leftTileIds: rebuiltLeftIds,
    rightTileIds: rebuiltRightIds,
    activeLeftTileId: rebuiltLeftIds[0] ?? null,
    activeRightTileId: rebuiltRightIds[0] ?? null,
    focusedPanel: 'left',
  }
}

function isTileInSplitState(splitViewState: SplitViewState, tileId: string): boolean {
  return splitViewState.leftTileIds.includes(tileId) || splitViewState.rightTileIds.includes(tileId)
}

function normalizeGroup(group: TileGroup): TileGroup {
  return {
    id: group.id,
    name: group.name.trim() || UNTITLED_GROUP_NAME,
    colorId: GROUP_COLOR_ORDER.includes(group.colorId) ? group.colorId : DEFAULT_GROUP_COLOR,
    tileIds: [...group.tileIds],
    locked: Boolean(group.locked),
  }
}

function normalizeTile(tile: TileState): TileState {
  if (tile.type !== 'note') return tile

  const width = Math.max(NOTE_TILE_MIN_WIDTH, tile.width)
  const height = Math.max(NOTE_TILE_MIN_HEIGHT, tile.height)
  if (width === tile.width && height === tile.height) return tile

  return {
    ...tile,
    width,
    height,
  }
}

function buildNormalizedGroupedState(
  tiles: TileState[],
  groups: TileGroup[],
): { tiles: TileState[]; groups: TileGroup[] } {
  const dimensionedTiles = tiles.map(normalizeTile)
  const tileMap = new Map(dimensionedTiles.map((tile) => [tile.id, tile]))
  const tileToGroup = new Map<string, string>()
  const normalizedGroups: TileGroup[] = []

  for (const group of groups) {
    if (!group.id) continue

    const seen = new Set<string>()
    const tileIds = group.tileIds.filter((tileId) => {
      if (!tileMap.has(tileId) || seen.has(tileId) || tileToGroup.has(tileId)) return false
      seen.add(tileId)
      tileToGroup.set(tileId, group.id)
      return true
    })

    if (tileIds.length === 0) continue

    normalizedGroups.push(normalizeGroup({
      ...group,
      tileIds,
    }))
  }

  const groupsById = new Map(normalizedGroups.map((group) => [group.id, group]))

  for (const tile of tiles) {
    if (!tile.groupId || tileToGroup.has(tile.id)) continue

    const existing = groupsById.get(tile.groupId)
    if (existing) {
      existing.tileIds.push(tile.id)
    } else {
      const created: TileGroup = {
        id: tile.groupId,
        name: UNTITLED_GROUP_NAME,
        colorId: DEFAULT_GROUP_COLOR,
        tileIds: [tile.id],
        locked: false,
      }
      normalizedGroups.push(created)
      groupsById.set(created.id, created)
    }
    tileToGroup.set(tile.id, tile.groupId)
  }

  const normalizedTiles = dimensionedTiles.map((tile) => {
    const nextGroupId = tileToGroup.get(tile.id)
    if (!nextGroupId) {
      return {
        ...tile,
        groupId: undefined,
      }
    }

    return tile.groupId === nextGroupId
      ? tile
      : {
          ...tile,
          groupId: nextGroupId,
        }
  })

  return {
    tiles: normalizedTiles,
    groups: normalizedGroups,
  }
}

interface CanvasStore {
  // State
  tiles: TileState[]
  groups: TileGroup[]
  viewport: Viewport
  nextZIndex: number
  focusedTileId: string | null
  viewMode: ViewMode
  fullviewActiveTileId: string | null
  splitViewState: SplitViewState
  selectedTileIds: string[]
  terminalTitles: Record<string, string>
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
  updateTilePositions: (positions: Array<{ id: string; x: number; y: number }>) => void
  focusTile: (tileId: string | null) => void
  setViewMode: (mode: ViewMode) => void
  setFullviewActiveTileId: (tileId: string | null) => void
  setSplitViewState: (state: SplitViewState) => void
  setSplitPanelActiveTile: (panel: SplitPanelId, tileId: string | null) => void
  setSplitFocusedPanel: (panel: SplitPanelId) => void
  setTerminalTitle: (tileId: string, title: string | null) => void
  clearTerminalTitle: (tileId: string) => void
  selectTiles: (tileIds: string[]) => void
  createGroup: (
    group: Pick<TileGroup, 'name' | 'colorId' | 'locked'>,
    tileIds?: string[],
  ) => TileGroup | null
  addTilesToGroup: (groupId: string, tileIds: string[]) => void
  updateGroup: (
    groupId: string,
    patch: Partial<Pick<TileGroup, 'name' | 'colorId' | 'locked'>>,
  ) => void
  setGroupColor: (groupId: string, colorId: GroupColorId) => void
  setGroupLocked: (groupId: string, locked: boolean) => void
  ungroup: (groupId: string) => void
  removeTileFromGroup: (tileId: string) => void

  bringToFront: (tileId: string) => number

  setWorkspace: (id: string, name: string, config?: WorkspaceConfig) => void
  restoreWorkspaceState: (id: string, name: string, config: WorkspaceConfig | undefined, state: CanvasState) => void
  setProfiles: (profiles: Array<{ id: ShellProfileId; label: string; available: boolean }>) => void
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  tiles: [],
  groups: [],
  viewport: { tx: 0, ty: 0, zoom: 1 },
  nextZIndex: 1,
  focusedTileId: null,
  viewMode: 'fullview',
  fullviewActiveTileId: null,
  splitViewState: { ...EMPTY_SPLIT_VIEW_STATE },
  selectedTileIds: [],
  terminalTitles: {},
  activeWorkspaceId: '',
  activeWorkspaceName: '',
  activeWorkspaceConfig: {},
  availableProfiles: [],

  setViewport: (vp) => set({ viewport: vp }),
  setTiles: (tiles) => set((s) => {
    const normalizedTiles = tiles.map(normalizeTile)
    const nextIds = new Set(tiles.map((tile) => tile.id))
    const nextTerminalTitles = Object.fromEntries(
      Object.entries(s.terminalTitles).filter(([tileId]) => nextIds.has(tileId)),
    )

    return {
      tiles: normalizedTiles,
      terminalTitles: nextTerminalTitles,
    }
  }),

  restoreState: (state) => set(() => {
    const normalized = buildNormalizedGroupedState(state.tiles, state.groups ?? [])
    const fullviewActiveTileId =
      state.fullviewActiveTileId ??
      state.focusedTileId ??
      state.tiles[0]?.id ??
      null

    return {
      tiles: normalized.tiles,
      groups: normalized.groups,
      viewport: state.viewport,
      nextZIndex: state.nextZIndex,
      focusedTileId: state.focusedTileId ?? null,
      viewMode: normalizeViewMode(state.viewMode),
      fullviewActiveTileId,
      splitViewState: normalizeSplitViewState(state.splitViewState, normalized.tiles, state.focusedTileId ?? null, fullviewActiveTileId),
      selectedTileIds: [],
      terminalTitles: {},
    }
  }),

  addTile: (tile) => set((s) => {
    if (s.viewMode !== 'splitview' || isTileInSplitState(s.splitViewState, tile.id)) {
      return {
        tiles: [...s.tiles, normalizeTile(tile)],
        nextZIndex: tile.zIndex + 1,
      }
    }

    const targetPanel = s.splitViewState.focusedPanel

    return {
      tiles: [...s.tiles, normalizeTile(tile)],
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
      groups: s.groups
        .map((group) => ({ ...group, tileIds: group.tileIds.filter(id => id !== tileId) }))
        .filter((group) => group.tileIds.length > 0),
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
      selectedTileIds: s.selectedTileIds.filter(id => id !== tileId),
      terminalTitles: Object.fromEntries(
        Object.entries(s.terminalTitles).filter(([id]) => id !== tileId),
      ),
    }
  }),

  updateTile: (tileId, patch) => set((s) => ({
    tiles: s.tiles.map(t => t.id === tileId ? normalizeTile({ ...t, ...patch }) : t),
  })),

  updateTilePositions: (positions) => set((s) => {
    const positionsById = new Map(positions.map((entry) => [entry.id, entry]))

    return {
      tiles: s.tiles.map((tile) => {
        const next = positionsById.get(tile.id)
        return next ? { ...tile, x: next.x, y: next.y } : tile
      }),
    }
  }),

  focusTile: (tileId) => set({ focusedTileId: tileId }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setFullviewActiveTileId: (tileId) => set({ fullviewActiveTileId: tileId }),
  setSplitViewState: (splitViewState) => set({ splitViewState }),
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

  selectTiles: (tileIds) => set({ selectedTileIds: tileIds }),

  createGroup: (groupInput, tileIds) => {
    const state = get()
    const nextIds = Array.from(new Set((tileIds ?? state.selectedTileIds).filter((tileId) => state.tiles.some((tile) => tile.id === tileId))))
    if (nextIds.length < 2) return null
    if (getGroupingBlockedReason(state.tiles, state.groups, nextIds)) return null
    const nextColorIndex = get().groups.length % GROUP_COLOR_ORDER.length

    const group = normalizeGroup({
      id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: groupInput.name,
      colorId: groupInput.colorId ?? GROUP_COLOR_ORDER[nextColorIndex] ?? DEFAULT_GROUP_COLOR,
      tileIds: nextIds,
      locked: groupInput.locked,
    })

    set((s) => {
      const selected = new Set(nextIds)
      const nextTiles = s.tiles.map((tile) => (
        selected.has(tile.id)
          ? { ...tile, groupId: group.id }
          : tile
      ))
      const remainingGroups = s.groups
        .map((entry) => ({ ...entry, tileIds: entry.tileIds.filter((tileId) => !selected.has(tileId)) }))
        .filter((entry) => entry.tileIds.length > 0)
      const normalized = buildNormalizedGroupedState(nextTiles, [...remainingGroups, group])

      return {
        tiles: normalized.tiles,
        groups: normalized.groups,
        selectedTileIds: nextIds,
      }
    })

    return group
  },

  addTilesToGroup: (groupId, tileIds) => set((s) => {
    const targetGroup = s.groups.find((group) => group.id === groupId)
    if (!targetGroup) return {}

    const nextIds = Array.from(new Set(tileIds.filter((tileId) => s.tiles.some((tile) => tile.id === tileId))))
    if (nextIds.length === 0) return {}
    if (getGroupingBlockedReason(s.tiles, s.groups, nextIds, groupId)) return {}

    const selected = new Set(nextIds)
    const nextTiles = s.tiles.map((tile) => (
      selected.has(tile.id)
        ? { ...tile, groupId }
        : tile
    ))
    const nextGroups = s.groups
      .map((group) => (
        group.id === groupId
          ? { ...group, tileIds: [...group.tileIds, ...nextIds] }
          : { ...group, tileIds: group.tileIds.filter((tileId) => !selected.has(tileId)) }
      ))
      .filter((group) => group.tileIds.length > 0)
    const normalized = buildNormalizedGroupedState(nextTiles, nextGroups)
    const updatedGroup = normalized.groups.find((group) => group.id === groupId)

    return {
      tiles: normalized.tiles,
      groups: normalized.groups,
      selectedTileIds: updatedGroup?.tileIds ?? s.selectedTileIds,
    }
  }),

  updateGroup: (groupId, patch) => set((s) => ({
    groups: s.groups.map((group) => (
      group.id === groupId
        ? normalizeGroup({
            ...group,
            ...patch,
            tileIds: group.tileIds,
          })
        : group
    )),
  })),

  setGroupColor: (groupId, colorId) => set((s) => ({
    groups: s.groups.map((group) => (
      group.id === groupId
        ? { ...group, colorId }
        : group
    )),
  })),

  setGroupLocked: (groupId, locked) => set((s) => ({
    groups: s.groups.map((group) => (
      group.id === groupId
        ? { ...group, locked }
        : group
    )),
  })),

  ungroup: (groupId) => set((s) => ({
    groups: s.groups.filter((group) => group.id !== groupId),
    tiles: s.tiles.map((tile) => (
      tile.groupId === groupId
        ? { ...tile, groupId: undefined }
        : tile
    )),
    selectedTileIds: s.selectedTileIds,
  })),

  removeTileFromGroup: (tileId) => set((s) => {
    const tile = s.tiles.find((entry) => entry.id === tileId)
    if (!tile?.groupId) return {}

    const nextTiles = s.tiles.map((entry) => (
      entry.id === tileId
        ? { ...entry, groupId: undefined }
        : entry
    ))
    const nextGroups = s.groups
      .map((group) => (
        group.id === tile.groupId
          ? { ...group, tileIds: group.tileIds.filter((groupTileId) => groupTileId !== tileId) }
          : group
      ))
      .filter((group) => group.tileIds.length > 0)
    const normalized = buildNormalizedGroupedState(nextTiles, nextGroups)

    return {
      tiles: normalized.tiles,
      groups: normalized.groups,
    }
  }),

  bringToFront: (tileId) => {
    const { nextZIndex } = get()
    set((s) => ({
      tiles: s.tiles.map(t => t.id === tileId ? { ...t, zIndex: nextZIndex } : t),
      nextZIndex: nextZIndex + 1,
    }))
    return nextZIndex
  },

  setWorkspace: (id, name, config = {}) => set({ activeWorkspaceId: id, activeWorkspaceName: name, activeWorkspaceConfig: { ...config } }),
  restoreWorkspaceState: (id, name, config = {}, state) => set(() => {
    const normalized = buildNormalizedGroupedState(state.tiles, state.groups ?? [])
    const fullviewActiveTileId =
      state.fullviewActiveTileId ??
      state.focusedTileId ??
      state.tiles[0]?.id ??
      null

    return {
      activeWorkspaceId: id,
      activeWorkspaceName: name,
      activeWorkspaceConfig: { ...config },
      tiles: normalized.tiles,
      groups: normalized.groups,
      viewport: state.viewport,
      nextZIndex: state.nextZIndex,
      focusedTileId: state.focusedTileId ?? null,
      viewMode: normalizeViewMode(state.viewMode),
      fullviewActiveTileId,
      splitViewState: normalizeSplitViewState(state.splitViewState, normalized.tiles, state.focusedTileId ?? null, fullviewActiveTileId),
      selectedTileIds: [],
      terminalTitles: {},
    }
  }),
  setProfiles: (profiles) => set({ availableProfiles: profiles }),
}))
