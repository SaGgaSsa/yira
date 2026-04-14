import { create } from 'zustand'
import type { TileState, CanvasState, Viewport, ShellProfileId } from '@shared/types'

interface CanvasStore {
  // State
  tiles: TileState[]
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
  focusTile: (tileId: string | null) => void
  setViewMode: (mode: 'canvas' | 'fullview') => void
  setFullviewActiveTileId: (tileId: string | null) => void
  selectTiles: (tileIds: string[]) => void

  bringToFront: (tileId: string) => number

  setWorkspace: (id: string, name: string) => void
  setProfiles: (profiles: Array<{ id: ShellProfileId; label: string; available: boolean }>) => void
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  tiles: [],
  viewport: { tx: 0, ty: 0, zoom: 1 },
  nextZIndex: 1,
  focusedTileId: null,
  viewMode: 'canvas',
  fullviewActiveTileId: null,
  selectedTileIds: [],
  activeWorkspaceId: '',
  activeWorkspaceName: '',
  availableProfiles: [],

  setViewport: (vp) => set({ viewport: vp }),
  setTiles: (tiles) => set({ tiles }),

  restoreState: (state) => set({
    tiles: state.tiles,
    viewport: state.viewport,
    nextZIndex: state.nextZIndex,
    focusedTileId: state.focusedTileId ?? null,
    viewMode: state.viewMode ?? 'canvas',
    fullviewActiveTileId:
      state.fullviewActiveTileId ??
      state.focusedTileId ??
      state.tiles[0]?.id ??
      null,
  }),

  addTile: (tile) => set((s) => ({
    tiles: [...s.tiles, tile],
    nextZIndex: tile.zIndex + 1,
  })),

  removeTile: (tileId) => set((s) => ({
    tiles: s.tiles.filter(t => t.id !== tileId),
    focusedTileId: s.focusedTileId === tileId ? null : s.focusedTileId,
    fullviewActiveTileId: s.fullviewActiveTileId === tileId ? null : s.fullviewActiveTileId,
    selectedTileIds: s.selectedTileIds.filter(id => id !== tileId),
  })),

  updateTile: (tileId, patch) => set((s) => ({
    tiles: s.tiles.map(t => t.id === tileId ? { ...t, ...patch } : t),
  })),

  focusTile: (tileId) => set({ focusedTileId: tileId }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setFullviewActiveTileId: (tileId) => set({ fullviewActiveTileId: tileId }),

  selectTiles: (tileIds) => set({ selectedTileIds: tileIds }),

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
