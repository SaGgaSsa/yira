import { create } from 'zustand'
import { GROUP_COLOR_ORDER, type TileState, type CanvasState, type Viewport, type ShellProfileId, type TileGroup, type GroupColorId } from '@shared/types'

const UNTITLED_GROUP_NAME = 'Untitled Group'
const DEFAULT_GROUP_COLOR: GroupColorId = GROUP_COLOR_ORDER[0]

function buildNormalizedGroupedState(
  tiles: TileState[],
  groups: TileGroup[],
): { tiles: TileState[]; groups: TileGroup[] } {
  const tileMap = new Map(tiles.map((tile) => [tile.id, tile]))
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

    normalizedGroups.push({
      id: group.id,
      name: group.name.trim() || UNTITLED_GROUP_NAME,
      colorId: GROUP_COLOR_ORDER.includes(group.colorId) ? group.colorId : DEFAULT_GROUP_COLOR,
      tileIds,
    })
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
      }
      normalizedGroups.push(created)
      groupsById.set(created.id, created)
    }
    tileToGroup.set(tile.id, tile.groupId)
  }

  const normalizedTiles = tiles.map((tile) => {
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
  viewMode: 'canvas' | 'fullview'
  fullviewActiveTileId: string | null
  selectedTileIds: string[]
  activeWorkspaceId: string
  activeWorkspaceName: string
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
  setViewMode: (mode: 'canvas' | 'fullview') => void
  setFullviewActiveTileId: (tileId: string | null) => void
  selectTiles: (tileIds: string[]) => void
  createGroup: (name: string, tileIds?: string[]) => TileGroup | null
  addTilesToGroup: (groupId: string, tileIds: string[]) => void
  renameGroup: (groupId: string, name: string) => void
  setGroupColor: (groupId: string, colorId: GroupColorId) => void
  ungroup: (groupId: string) => void
  removeTileFromGroup: (tileId: string) => void

  bringToFront: (tileId: string) => number

  setWorkspace: (id: string, name: string) => void
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
  selectedTileIds: [],
  activeWorkspaceId: '',
  activeWorkspaceName: '',
  availableProfiles: [],

  setViewport: (vp) => set({ viewport: vp }),
  setTiles: (tiles) => set({ tiles }),

  restoreState: (state) => set(() => {
    const normalized = buildNormalizedGroupedState(state.tiles, state.groups ?? [])

    return {
      tiles: normalized.tiles,
      groups: normalized.groups,
      viewport: state.viewport,
      nextZIndex: state.nextZIndex,
      focusedTileId: state.focusedTileId ?? null,
      viewMode: state.viewMode ?? 'fullview',
      fullviewActiveTileId:
        state.fullviewActiveTileId ??
        state.focusedTileId ??
        state.tiles[0]?.id ??
        null,
      selectedTileIds: [],
    }
  }),

  addTile: (tile) => set((s) => ({
    tiles: [...s.tiles, tile],
    nextZIndex: tile.zIndex + 1,
  })),

  removeTile: (tileId) => set((s) => ({
    tiles: s.tiles.filter(t => t.id !== tileId),
    groups: s.groups
      .map((group) => ({ ...group, tileIds: group.tileIds.filter(id => id !== tileId) }))
      .filter((group) => group.tileIds.length > 0),
    focusedTileId: s.focusedTileId === tileId ? null : s.focusedTileId,
    fullviewActiveTileId: s.fullviewActiveTileId === tileId ? null : s.fullviewActiveTileId,
    selectedTileIds: s.selectedTileIds.filter(id => id !== tileId),
  })),

  updateTile: (tileId, patch) => set((s) => ({
    tiles: s.tiles.map(t => t.id === tileId ? { ...t, ...patch } : t),
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

  selectTiles: (tileIds) => set({ selectedTileIds: tileIds }),

  createGroup: (name, tileIds) => {
    const nextIds = Array.from(new Set((tileIds ?? get().selectedTileIds).filter((tileId) => get().tiles.some((tile) => tile.id === tileId))))
    if (nextIds.length < 2) return null
    const nextColorIndex = get().groups.length % GROUP_COLOR_ORDER.length

    const group: TileGroup = {
      id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim() || UNTITLED_GROUP_NAME,
      colorId: GROUP_COLOR_ORDER[nextColorIndex] ?? DEFAULT_GROUP_COLOR,
      tileIds: nextIds,
    }

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

  renameGroup: (groupId, name) => set((s) => ({
    groups: s.groups.map((group) => (
      group.id === groupId
        ? { ...group, name: name.trim() || UNTITLED_GROUP_NAME }
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

  setWorkspace: (id, name) => set({ activeWorkspaceId: id, activeWorkspaceName: name }),
  setProfiles: (profiles) => set({ availableProfiles: profiles }),
}))
