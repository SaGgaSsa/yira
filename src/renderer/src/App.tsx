import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { Canvas, getCanvasMethods } from './components/Canvas'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { SettingsPanel } from './components/SettingsPanel'
import { RawJsonEditor } from './components/RawJsonEditor'
import { ContextMenu, type MenuItem } from './components/ContextMenu'
import { FullviewPanel } from './components/FullviewPanel'
import { AppDialog, type ConfirmDialogOptions, type PromptDialogOptions } from './components/AppDialog'
import { GroupEditorDialog, type GroupEditorRequest, type GroupEditorValue } from './components/GroupEditorDialog'
import { TileEditorDialog, type TileEditorRequest, type TileEditorValue } from './components/TileEditorDialog'
import { useCanvasStore } from './store/canvasStore'
import { useSettingsStore } from './store/settingsStore'
import { useCanvasActions } from './hooks/useCanvasActions'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useTheme } from './hooks/useTheme'
import { useFontSize } from './hooks/useFontSize'
import { useUpdateStore } from './store/updateStore'
import { findMergeTargetGroup, findSelectedGroup, getGroupingBlockedReason } from './utils/grouping'
import { GROUP_COLORS, GROUP_COLOR_ORDER, type TileState, type CanvasState, type Workspace, type TileGroup } from '@shared/types'
import { TILE_META } from './components/TileContent'
import { TileListItem } from './components/TileListItem'
import { Terminal, StickyNote, Globe, LayoutGrid, ChevronDown, FolderPlus, Trash2, Pencil, Lock, Columns, RefreshCw, Download, X } from 'lucide-react'

const GROUP_SHOW_MARGIN = 20
const GROUP_SHOW_TOP_PADDING = 118

function createEmptyCanvasState(): CanvasState {
  return {
    tiles: [],
    groups: [],
    viewport: { tx: 0, ty: 0, zoom: 1 },
    nextZIndex: 1,
    focusedTileId: null,
    viewMode: 'fullview',
    fullviewActiveTileId: null,
  }
}

type PromptDialogState = {
  request: { mode: 'prompt' } & PromptDialogOptions
  resolve: (value: string | null) => void
}

type ConfirmDialogState = {
  request: { mode: 'confirm' } & ConfirmDialogOptions
  resolve: (value: boolean) => void
}

type ActiveDialogState = PromptDialogState | ConfirmDialogState | null

type GroupEditorState =
  | {
      mode: 'create'
      tileIds: string[]
      request: GroupEditorRequest
    }
  | {
      mode: 'edit'
      groupId: string
      request: GroupEditorRequest
    }
  | null

type TileEditorState = {
  tileId: string
  request: TileEditorRequest
} | null

function isPromptDialog(dialog: PromptDialogState | ConfirmDialogState): dialog is PromptDialogState {
  return dialog.request.mode === 'prompt'
}

export default function App(): React.ReactElement {
  // Settings
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  useTheme()
  useFontSize()
  const initializeUpdates = useUpdateStore((s) => s.initialize)
  const updateStatus = useUpdateStore((s) => s.status)
  const updateAvailableVersion = useUpdateStore((s) => s.availableVersion)
  const updateProgressPercent = useUpdateStore((s) => s.progressPercent)
  const updateMessage = useUpdateStore((s) => s.message)
  const installUpdate = useUpdateStore((s) => s.installUpdate)

  // Canvas state
  const tiles = useCanvasStore((s) => s.tiles)
  const viewport = useCanvasStore((s) => s.viewport)
  const groups = useCanvasStore((s) => s.groups)
  const nextZIndex = useCanvasStore((s) => s.nextZIndex)
  const focusedTileId = useCanvasStore((s) => s.focusedTileId)
  const selectedTileIds = useCanvasStore((s) => s.selectedTileIds)
  const viewMode = useCanvasStore((s) => s.viewMode)
  const fullviewActiveTileId = useCanvasStore((s) => s.fullviewActiveTileId)
  const activeWorkspaceId = useCanvasStore((s) => s.activeWorkspaceId)
  const activeWorkspaceName = useCanvasStore((s) => s.activeWorkspaceName)
  const availableProfiles = useCanvasStore((s) => s.availableProfiles)
  const setViewport = useCanvasStore((s) => s.setViewport)
  const restoreState = useCanvasStore((s) => s.restoreState)
  const updateTile = useCanvasStore((s) => s.updateTile)
  const focusTile = useCanvasStore((s) => s.focusTile)
  const selectTiles = useCanvasStore((s) => s.selectTiles)
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const createGroup = useCanvasStore((s) => s.createGroup)
  const addTilesToGroup = useCanvasStore((s) => s.addTilesToGroup)
  const updateGroup = useCanvasStore((s) => s.updateGroup)
  const setGroupLocked = useCanvasStore((s) => s.setGroupLocked)
  const ungroup = useCanvasStore((s) => s.ungroup)
  const setWorkspace = useCanvasStore((s) => s.setWorkspace)
  const restoreWorkspaceState = useCanvasStore((s) => s.restoreWorkspaceState)
  const setProfiles = useCanvasStore((s) => s.setProfiles)
  const setViewMode = useCanvasStore((s) => s.setViewMode)
  const setFullviewActiveTileId = useCanvasStore((s) => s.setFullviewActiveTileId)

  // Canvas actions (extracted hook)
  const [activeDialog, setActiveDialog] = useState<ActiveDialogState>(null)

  const requestPrompt = useCallback((request: PromptDialogOptions): Promise<string | null> => {
    return new Promise((resolve) => {
      setActiveDialog({
        request: {
          mode: 'prompt',
          ...request,
        },
        resolve,
      })
    })
  }, [])

  const requestConfirm = useCallback((request: ConfirmDialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setActiveDialog({
        request: {
          mode: 'confirm',
          ...request,
        },
        resolve,
      })
    })
  }, [])

  const { addTerminal, addNote, addBrowser, addBoard, deleteTile, resetZoom } = useCanvasActions({ requestConfirm })

  // UI state
  const [showProfilePicker, setShowProfilePicker] = useState(false)
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [showJsonEditor, setShowJsonEditor] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [groupEditor, setGroupEditor] = useState<GroupEditorState>(null)
  const [tileEditor, setTileEditor] = useState<TileEditorState>(null)
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null)
  const [tileRefreshKeys, setTileRefreshKeys] = useState<Record<string, number>>({})
  const [tileMenu, setTileMenu] = useState<{ tileId: string; x: number; y: number } | null>(null)
  const [groupMenu, setGroupMenu] = useState<{ groupId: string; x: number; y: number } | null>(null)
  const [workspaceItemMenu, setWorkspaceItemMenu] = useState<{ workspaceId: string; x: number; y: number } | null>(null)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const workspaceTransitionRef = useRef(0)
  const skipNextAutosaveRef = useRef(false)
  const prevZoomRef = useRef(1)
  const footerRef = useRef<HTMLDivElement | null>(null)
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null)
  const fullviewPanelRef = useRef<HTMLDivElement | null>(null)
  const [fullviewTopInset, setFullviewTopInset] = useState(0)

  const closeActiveDialog = useCallback(() => {
    if (!activeDialog) return

    if (isPromptDialog(activeDialog)) {
      activeDialog.resolve(null)
    } else {
      activeDialog.resolve(false)
    }

    setActiveDialog(null)
  }, [activeDialog])

  const confirmActiveDialog = useCallback((value?: string) => {
    if (!activeDialog) return

    if (isPromptDialog(activeDialog)) {
      activeDialog.resolve(value ?? null)
    } else {
      activeDialog.resolve(true)
    }

    setActiveDialog(null)
  }, [activeDialog])

  // Load settings on mount
  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  useEffect(() => {
    void initializeUpdates()
  }, [initializeUpdates])

  useEffect(() => {
    if (viewMode !== 'fullview') {
      setFullviewTopInset(0)
      return
    }

    const panelEl = fullviewPanelRef.current
    if (!panelEl) return

    const updatePanelHeight = () => {
      setFullviewTopInset(Math.ceil(panelEl.getBoundingClientRect().height))
    }

    updatePanelHeight()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => {
      updatePanelHeight()
    })

    observer.observe(panelEl)

    return () => {
      observer.disconnect()
    }
  }, [viewMode])

  const refreshWorkspaces = useCallback(async (): Promise<Workspace[]> => {
    const list = await window.electron.workspace.list()
    setWorkspaces(list)
    return list
  }, [])

  const saveToDisk = useCallback(
    async (workspaceId: string) => {
      const state: CanvasState = {
        tiles: tiles.map((t) => ({ ...t })),
        groups: groups.map((group) => ({
          ...group,
          tileIds: [...group.tileIds],
          terminal: group.terminal ? { ...group.terminal } : undefined,
        })),
        viewport: { ...viewport },
        nextZIndex,
        focusedTileId,
        viewMode,
        fullviewActiveTileId,
      }

      await window.electron.canvas.save(workspaceId, state)
    },
    [tiles, groups, viewport, nextZIndex, focusedTileId, viewMode, fullviewActiveTileId],
  )

  const activateWorkspace = useCallback(async (
    workspace: Pick<Workspace, 'id' | 'name'> | null,
    options?: { persistCurrent?: boolean; updateMain?: boolean },
  ) => {
    if (!workspace) return

    const transitionId = ++workspaceTransitionRef.current

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }

    const currentWorkspaceId = useCanvasStore.getState().activeWorkspaceId
    if (options?.persistCurrent !== false && currentWorkspaceId && currentWorkspaceId !== workspace.id) {
      await saveToDisk(currentWorkspaceId)
    }

    const state = await window.electron.canvas.load(workspace.id)
    if (transitionId !== workspaceTransitionRef.current) return

    if (options?.updateMain !== false) {
      await window.electron.workspace.setActive(workspace.id)
      if (transitionId !== workspaceTransitionRef.current) return
    }

    skipNextAutosaveRef.current = true
    restoreWorkspaceState(workspace.id, workspace.name, state ?? createEmptyCanvasState())
    setShowWorkspacePicker(false)
  }, [restoreWorkspaceState, saveToDisk])

  // Load workspaces on mount
  useEffect(() => {
    console.log('[App] Loading workspaces and shell profiles...')
    Promise.all([
      refreshWorkspaces(),
      window.electron.workspace.getActive(),
    ]).then(([list, active]) => {
      console.log('[App] Workspaces:', list)

      if (active) {
        void activateWorkspace(active, { persistCurrent: false, updateMain: false })
        return
      }

      if (list[0]) {
        void activateWorkspace(list[0], { persistCurrent: false })
      }
    }).catch((err) => console.error('[App] Error loading workspaces:', err))
    window.electron.shellProfiles.list().then((profiles) => {
      console.log('[App] Shell profiles:', profiles)
      setProfiles(profiles.map((p) => ({ id: p.id, label: p.label, available: p.available })))
    }).catch((err) => console.error('[App] Error loading shell profiles:', err))
  }, [activateWorkspace, refreshWorkspaces, setProfiles])

  // Switch workspace
  const switchWorkspace = useCallback(
    (workspace: Workspace) => {
      if (workspace.id === activeWorkspaceId) {
        setShowWorkspacePicker(false)
        return
      }

      setWorkspaceItemMenu(null)
      void activateWorkspace(workspace)
    },
    [activeWorkspaceId, activateWorkspace],
  )

  // Auto-save (debounced)
  const scheduleSave = useCallback(() => {
    if (!activeWorkspaceId) return

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      if (activeWorkspaceId) {
        void saveToDisk(activeWorkspaceId)
      }
    }, 500)
  }, [activeWorkspaceId, saveToDisk])

  useEffect(() => {
    if (!activeWorkspaceId) return

    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false
      return
    }

    scheduleSave()
  }, [tiles, groups, viewport, nextZIndex, activeWorkspaceId, scheduleSave])

  useEffect(() => {
    if (!showProfilePicker) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!footerRef.current?.contains(event.target as Node)) {
        setShowProfilePicker(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [showProfilePicker])

  useEffect(() => {
    if (!showWorkspacePicker) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!workspaceMenuRef.current?.contains(event.target as Node)) {
        setShowWorkspacePicker(false)
        setWorkspaceItemMenu(null)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [showWorkspacePicker])

  useEffect(() => {
    if (!showWorkspacePicker && workspaceItemMenu) {
      setWorkspaceItemMenu(null)
    }
  }, [showWorkspacePicker, workspaceItemMenu])

  // Keyboard shortcuts (extracted hook)
  useKeyboardShortcuts({
    tiles,
    focusedTileId,
    selectedTileIds,
    viewMode,
    deleteTile,
    resetZoom,
    focusTile,
    selectTiles,
    setViewMode,
    onClosePicker: () => {
      setShowProfilePicker(false)
      setShowWorkspacePicker(false)
      setWorkspaceItemMenu(null)
      setShowSettings(false)
      setTileMenu(null)
      setGroupMenu(null)
      setGroupEditor(null)
      setTileEditor(null)
      closeActiveDialog()
    },
  })

  // Default profile
  const defaultProfile = availableProfiles.find((p) => p.id === 'bash') ??
    availableProfiles.find((p) => p.id === 'zsh') ??
    availableProfiles.find((p) => p.available)

  // Zoom toggle: switch between 100% and previous zoom
  const handleZoomToggle = useCallback(() => {
    if (viewport.zoom === 1) {
      // Go back to previous zoom
      setViewport({
        tx: viewport.tx,
        ty: viewport.ty,
        zoom: prevZoomRef.current,
      })
    } else {
      // Save current, go to 100%
      prevZoomRef.current = viewport.zoom
      setViewport({ tx: 0, ty: 0, zoom: 1 })
    }
  }, [viewport, setViewport])

  const handleSelectSingleTile = useCallback((tileId: string) => {
    focusTile(tileId)
    selectTiles([tileId])
    bringToFront(tileId)
    setFullviewActiveTileId(tileId)
  }, [focusTile, selectTiles, bringToFront, setFullviewActiveTileId])

  const handleCenterTileFromSidebar = useCallback((tileId: string) => {
    if (viewMode !== 'canvas') return
    getCanvasMethods()?.centerViewOnTile(tileId)
  }, [viewMode])

  const handleShowTileFromSidebar = useCallback((tileId: string) => {
    const tile = tiles.find((entry) => entry.id === tileId)
    if (!tile) return

    const paddedBounds = {
      minX: tile.x - GROUP_SHOW_MARGIN,
      minY: tile.y - GROUP_SHOW_MARGIN,
      maxX: tile.x + tile.width + GROUP_SHOW_MARGIN,
      maxY: tile.y + tile.height + GROUP_SHOW_MARGIN,
    }

    setTileMenu(null)
    selectTiles([tile.id])
    focusTile(tile.id)

    const fitTileBounds = () => {
      getCanvasMethods()?.fitViewToBounds(paddedBounds, { top: GROUP_SHOW_TOP_PADDING })
    }

    if (viewMode === 'canvas') {
      fitTileBounds()
      return
    }

    setViewMode('canvas')
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitTileBounds()
      })
    })
  }, [focusTile, selectTiles, setViewMode, tiles, viewMode])

  const handleSidebarTileClick = useCallback((tileId: string) => {
    if (viewMode === 'fullview') {
      focusTile(tileId)
      selectTiles([tileId])
      setFullviewActiveTileId(tileId)
      return
    }

    handleCenterTileFromSidebar(tileId)
  }, [focusTile, handleCenterTileFromSidebar, selectTiles, setFullviewActiveTileId, viewMode])

  const handleSetViewMode = useCallback((mode: 'canvas' | 'fullview') => {
    if (mode === 'fullview') {
      const nextActive =
        focusedTileId && tiles.some((tile) => tile.id === focusedTileId)
          ? focusedTileId
          : fullviewActiveTileId && tiles.some((tile) => tile.id === fullviewActiveTileId)
            ? fullviewActiveTileId
            :
            tiles.slice().sort((a, b) => b.zIndex - a.zIndex)[0]?.id ??
            null

      setFullviewActiveTileId(nextActive)
    }

    setViewMode(mode)
  }, [focusedTileId, fullviewActiveTileId, tiles, setFullviewActiveTileId, setViewMode])

  const selectedGroup = useMemo(
    () => findSelectedGroup(groups, selectedTileIds),
    [groups, selectedTileIds],
  )

  const mergeTargetGroup = useMemo(
    () => findMergeTargetGroup(tiles, groups, selectedTileIds),
    [tiles, groups, selectedTileIds],
  )

  const groupingBlockedReason = useMemo(
    () => getGroupingBlockedReason(tiles, groups, selectedTileIds, mergeTargetGroup?.id),
    [tiles, groups, selectedTileIds, mergeTargetGroup],
  )

  const handleCreateGroupFromSelection = useCallback(() => {
    if (groupingBlockedReason) return

    if (mergeTargetGroup) {
      addTilesToGroup(mergeTargetGroup.id, selectedTileIds)
      return
    }

    if (selectedTileIds.length < 2) return
    setGroupEditor({
      mode: 'create',
      tileIds: [...selectedTileIds],
      request: {
        title: 'Create group',
        confirmLabel: 'Create Group',
        value: {
          name: 'Untitled Group',
          colorId: GROUP_COLOR_ORDER[groups.length % GROUP_COLOR_ORDER.length] ?? GROUP_COLOR_ORDER[0],
          locked: false,
          wslStartupCommand: '',
        },
      },
    })
  }, [addTilesToGroup, groupingBlockedReason, groups.length, mergeTargetGroup, selectedTileIds])

  const openGroupEditor = useCallback((group: TileGroup) => {
    setGroupMenu(null)
    setGroupEditor({
      mode: 'edit',
      groupId: group.id,
      request: {
        title: 'Edit group',
        confirmLabel: 'Save Group',
        value: {
          name: group.name,
          colorId: group.colorId,
          locked: Boolean(group.locked),
          wslStartupCommand: group.terminal?.wslStartupCommand ?? '',
        },
      },
    })
  }, [])

  const handleConfirmGroupEditor = useCallback((value: GroupEditorValue) => {
    if (!groupEditor) return

    const nextGroup = {
      name: value.name,
      colorId: value.colorId,
      locked: value.locked,
      terminal: {
        wslStartupCommand: value.wslStartupCommand || undefined,
      },
    }

    if (groupEditor.mode === 'create') {
      createGroup(nextGroup, groupEditor.tileIds)
    } else {
      updateGroup(groupEditor.groupId, nextGroup)
    }

    setGroupEditor(null)
  }, [createGroup, groupEditor, updateGroup])

  const handleUngroup = useCallback(async (group: TileGroup) => {
    const confirmed = await requestConfirm({
      title: 'Ungroup tiles',
      message: `Ungroup "${group.name}" and keep its tiles separate on the canvas?`,
      confirmLabel: 'Ungroup',
      cancelLabel: 'Keep Group',
      danger: true,
    })
    if (!confirmed) return
    ungroup(group.id)
  }, [requestConfirm, ungroup])

  const handleToggleGroupLock = useCallback((group: TileGroup) => {
    setGroupLocked(group.id, !group.locked)
  }, [setGroupLocked])

  const getGroupBounds = useCallback((group: TileGroup) => {
    const groupTiles = tiles.filter((tile) => group.tileIds.includes(tile.id))
    if (groupTiles.length === 0) return null

    return {
      tileIds: groupTiles.map((tile) => tile.id),
      minX: Math.min(...groupTiles.map((tile) => tile.x)),
      minY: Math.min(...groupTiles.map((tile) => tile.y)),
      maxX: Math.max(...groupTiles.map((tile) => tile.x + tile.width)),
      maxY: Math.max(...groupTiles.map((tile) => tile.y + tile.height)),
    }
  }, [tiles])

  const handleSelectGroup = useCallback((group: TileGroup) => {
    const bounds = getGroupBounds(group)
    if (!bounds) return

    selectTiles(bounds.tileIds)
    focusTile(null)
    getCanvasMethods()?.centerViewOnBounds(bounds)
  }, [getGroupBounds, selectTiles, focusTile])

  const handleShowGroup = useCallback((group: TileGroup) => {
    const bounds = getGroupBounds(group)
    if (!bounds) return

    const paddedBounds = {
      minX: bounds.minX - GROUP_SHOW_MARGIN,
      minY: bounds.minY - GROUP_SHOW_MARGIN,
      maxX: bounds.maxX + GROUP_SHOW_MARGIN,
      maxY: bounds.maxY + GROUP_SHOW_MARGIN,
    }

    setGroupMenu(null)
    selectTiles(bounds.tileIds)
    focusTile(null)

    const fitGroupBounds = () => {
      getCanvasMethods()?.fitViewToBounds(paddedBounds, { top: GROUP_SHOW_TOP_PADDING })
    }

    if (viewMode === 'canvas') {
      fitGroupBounds()
      return
    }

    setViewMode('canvas')
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitGroupBounds()
      })
    })
  }, [focusTile, getGroupBounds, selectTiles, setViewMode, viewMode])

  const openTileEditor = useCallback((tile: TileState) => {
    setTileMenu(null)
    setTileEditor({
      tileId: tile.id,
      request: {
        title: `Edit ${TILE_META[tile.type].label}`,
        confirmLabel: `Save ${TILE_META[tile.type].label}`,
        tileType: tile.type,
        shellProfileId: tile.shellProfileId,
        value: {
          label: tile.label ?? '',
          startupCommand: tile.type === 'terminal' ? tile.startupCommand ?? '' : '',
        },
      },
    })
  }, [])

  const handleConfirmTileEditor = useCallback((value: TileEditorValue) => {
    if (!tileEditor) return

    const tile = tiles.find((entry) => entry.id === tileEditor.tileId)
    if (!tile) {
      setTileEditor(null)
      return
    }

    const patch: Partial<TileState> = {
      label: value.label.trim() || undefined,
    }

    if (tile.type === 'terminal') {
      patch.startupCommand = value.startupCommand.trim() || undefined
    }

    updateTile(tile.id, patch)
    setTileEditor(null)
  }, [tileEditor, tiles, updateTile])

  const focusTileInFullview = useCallback((tile: TileState) => {
    setTileMenu(null)
    focusTile(tile.id)
    selectTiles([tile.id])
    setFullviewActiveTileId(tile.id)
    setViewMode('fullview')
  }, [focusTile, selectTiles, setFullviewActiveTileId, setViewMode])

  const bumpTileRefreshKey = useCallback((tileId: string) => {
    setTileRefreshKeys((current) => ({
      ...current,
      [tileId]: (current[tileId] ?? 0) + 1,
    }))
  }, [])

  const requestRefreshTileConfirmation = useCallback((tile: TileState) => {
    const label = tile.label ?? TILE_META[tile.type].label

    if (tile.type === 'terminal') {
      return requestConfirm({
        title: 'Refresh terminal',
        message: `Refresh "${label}"? This restarts the terminal and stops any running process in that session.`,
        confirmLabel: 'Refresh',
        cancelLabel: 'Keep Running',
        danger: true,
      })
    }

    if (tile.type === 'browser') {
      return requestConfirm({
        title: 'Refresh browser tile',
        message: `Refresh "${label}"? This reloads the current web surface.`,
        confirmLabel: 'Refresh',
        cancelLabel: 'Keep Current',
      })
    }

    if (tile.type === 'note') {
      return requestConfirm({
        title: 'Refresh note tile',
        message: `Refresh "${label}"? This reloads the note from saved state and may discard recent unsaved changes.`,
        confirmLabel: 'Refresh',
        cancelLabel: 'Keep Editing',
        danger: true,
      })
    }

    return requestConfirm({
      title: 'Refresh board tile',
      message: `Refresh "${label}"? This reloads the board from saved state and may discard recent unsaved changes.`,
      confirmLabel: 'Refresh',
      cancelLabel: 'Keep Editing',
      danger: true,
    })
  }, [requestConfirm])

  const handleRefreshTile = useCallback(async (tile: TileState) => {
    setTileMenu(null)

    const confirmed = await requestRefreshTileConfirmation(tile)
    if (!confirmed) return

    if (tile.type === 'terminal') {
      await window.electron.terminal.destroy(tile.id)
    }

    bumpTileRefreshKey(tile.id)
  }, [bumpTileRefreshKey, requestRefreshTileConfirmation])

  const renameWorkspace = useCallback(async (workspace: Workspace) => {
    setWorkspaceItemMenu(null)

    const name = await requestPrompt({
      title: 'Rename workspace',
      message: 'Choose a new name for this workspace.',
      confirmLabel: 'Save',
      cancelLabel: 'Cancel',
      defaultValue: workspace.name,
      placeholder: 'Workspace name',
    })

    if (!name?.trim()) return

    const renamed = await window.electron.workspace.rename(workspace.id, name.trim())
    if (!renamed) return

    await refreshWorkspaces()

    if (workspace.id === activeWorkspaceId) {
      setWorkspace(renamed.id, renamed.name)
    }
  }, [activeWorkspaceId, refreshWorkspaces, requestPrompt, setWorkspace])

  const deleteWorkspace = useCallback(async (workspace: Workspace) => {
    setWorkspaceItemMenu(null)

    const confirmed = await requestConfirm({
      title: 'Delete workspace',
      message: `Delete workspace "${workspace.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Keep Workspace',
      danger: true,
    })
    if (!confirmed) return

    const isActiveWorkspace = workspace.id === useCanvasStore.getState().activeWorkspaceId
    if (isActiveWorkspace) {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }

      await saveToDisk(workspace.id)
    }

    await window.electron.workspace.delete(workspace.id)
    const list = await refreshWorkspaces()

    if (!isActiveWorkspace) return

    const nextActive = await window.electron.workspace.getActive()
    if (nextActive) {
      await activateWorkspace(nextActive, { persistCurrent: false, updateMain: false })
      return
    }

    if (list[0]) {
      await activateWorkspace(list[0], { persistCurrent: false })
    }
  }, [activateWorkspace, refreshWorkspaces, requestConfirm, saveToDisk])

  const createWorkspace = useCallback(async () => {
    const name = await requestPrompt({
      title: 'Create workspace',
      message: 'Choose a name for the new workspace.',
      confirmLabel: 'Create',
      cancelLabel: 'Cancel',
      placeholder: 'Workspace name',
    })
    if (!name?.trim()) return

    if (activeWorkspaceId) {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }

      await saveToDisk(activeWorkspaceId)
    }

    const created = await window.electron.workspace.create(name.trim())
    await refreshWorkspaces()
    await activateWorkspace(created, { persistCurrent: false, updateMain: false })
  }, [activeWorkspaceId, activateWorkspace, refreshWorkspaces, requestPrompt, saveToDisk])

  const createTerminalFromSidebar = useCallback(() => {
    if (availableProfiles.length <= 1 && defaultProfile) {
      addTerminal(defaultProfile.id)
      setShowProfilePicker(false)
      return
    }
    setShowProfilePicker((v) => !v)
  }, [availableProfiles.length, defaultProfile, addTerminal])

  const activeTileMenu = tileMenu ? tiles.find((tile) => tile.id === tileMenu.tileId) ?? null : null
  const activeGroupMenu = groupMenu ? groups.find((group) => group.id === groupMenu.groupId) ?? null : null
  const activeWorkspaceMenu = workspaceItemMenu
    ? workspaces.find((workspace) => workspace.id === workspaceItemMenu.workspaceId) ?? null
    : null
  const tileMenuItems: MenuItem[] = activeTileMenu ? [
    {
      label: activeTileMenu.type === 'terminal' ? 'Edit' : 'Rename',
      icon: Pencil,
      action: () => openTileEditor(activeTileMenu),
    },
    {
      label: 'Focus',
      action: () => focusTileInFullview(activeTileMenu),
    },
    {
      label: 'Refresh',
      icon: RefreshCw,
      action: () => {
        void handleRefreshTile(activeTileMenu)
      },
    },
    {
      label: activeTileMenu.hideTitlebar ? 'Show Titlebar' : 'Hide Titlebar',
      action: () => updateTile(activeTileMenu.id, { hideTitlebar: !activeTileMenu.hideTitlebar }),
    },
    {
      label: activeTileMenu.locked ? 'Unlock' : 'Lock',
      action: () => updateTile(activeTileMenu.id, { locked: !activeTileMenu.locked }),
    },
    {
      label: 'Close',
      icon: Trash2,
      danger: true,
      action: () => {
        void deleteTile(activeTileMenu.id)
      },
    },
  ] : []
  const groupMenuItems: MenuItem[] = activeGroupMenu ? [
    {
      label: 'Show',
      icon: Columns,
      action: () => handleShowGroup(activeGroupMenu),
    },
    {
      label: 'Edit Group',
      icon: Pencil,
      action: () => {
        openGroupEditor(activeGroupMenu)
      },
    },
    {
      label: activeGroupMenu.locked ? 'Unlock' : 'Lock',
      icon: Lock,
      action: () => handleToggleGroupLock(activeGroupMenu),
    },
    {
      label: 'Ungroup',
      icon: Trash2,
      danger: true,
      action: () => {
        void handleUngroup(activeGroupMenu)
      },
    },
  ] : []
  const workspaceMenuItems: MenuItem[] = activeWorkspaceMenu ? [
    {
      label: 'Rename Workspace',
      icon: Pencil,
      action: () => {
        void renameWorkspace(activeWorkspaceMenu)
      },
    },
    {
      label: 'Delete Workspace',
      icon: Trash2,
      danger: true,
      action: () => {
        void deleteWorkspace(activeWorkspaceMenu)
      },
    },
  ] : []

  const sortedTiles = useMemo(
    () => tiles.slice().sort((a, b) => b.zIndex - a.zIndex),
    [tiles],
  )

  useEffect(() => {
    if (tiles.length === 0) {
      setFullviewActiveTileId(null)
      return
    }

    if (!fullviewActiveTileId || !tiles.some((tile) => tile.id === fullviewActiveTileId)) {
      const fallback = focusedTileId && tiles.some((tile) => tile.id === focusedTileId)
        ? focusedTileId
        : sortedTiles[0]?.id ?? null
      setFullviewActiveTileId(fallback)
    }
  }, [tiles, sortedTiles, fullviewActiveTileId, focusedTileId, viewMode, setFullviewActiveTileId, setViewMode])

  const closeTileFromFullview = useCallback(async (tileId: string) => {
    const ordered = tiles.slice().sort((a, b) => b.zIndex - a.zIndex)
    const index = ordered.findIndex((tile) => tile.id === tileId)
    const fallback =
      ordered[index + 1]?.id ??
      ordered[index - 1]?.id ??
      null

    const deleted = await deleteTile(tileId)
    if (!deleted) return

    if (fullviewActiveTileId === tileId) {
      setFullviewActiveTileId(fallback)
      if (!fallback) setViewMode('canvas')
    }
  }, [tiles, fullviewActiveTileId, deleteTile, setFullviewActiveTileId, setViewMode])

  const confirmRemoveTileFromGroup = useCallback(async (tile: TileState, group: TileGroup) => {
    return requestConfirm({
      title: 'Remove tile from group',
      message: `Remove "${tile.label ?? 'this tile'}" from "${group.name}"? The tile will be moved outside the group frame.`,
      confirmLabel: 'Remove',
      cancelLabel: 'Keep In Group',
      danger: true,
    })
  }, [requestConfirm])

  const currentUpdateBannerKey = updateStatus === 'downloaded'
    ? `downloaded:${updateAvailableVersion ?? 'ready'}`
    : `progress:${updateAvailableVersion ?? updateStatus}`
  const showUpdateBanner =
    (updateStatus === 'available' || updateStatus === 'downloading' || updateStatus === 'downloaded') &&
    dismissedUpdateVersion !== currentUpdateBannerKey

  const updateBannerCopy = (() => {
    if (updateStatus === 'downloaded') {
      return {
        title: `Update ${updateAvailableVersion ?? ''} is ready`,
        message: 'Restart Yira to install the downloaded version.',
      }
    }

    if (updateStatus === 'downloading') {
      return {
        title: `Downloading update${updateAvailableVersion ? ` ${updateAvailableVersion}` : ''}`,
        message: updateProgressPercent !== null
          ? `${updateProgressPercent}% completed in the background.`
          : 'The update is downloading in the background.',
      }
    }

    return {
      title: `Update${updateAvailableVersion ? ` ${updateAvailableVersion}` : ''} found`,
      message: updateMessage ?? 'Yira is downloading the new version in the background.',
    }
  })()

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary text-text-primary">
      {/* Sidebar — goes to the very top */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(c => !c)}
        footer={
          <div ref={footerRef} className="relative border-t border-border bg-bg-secondary px-4 py-4">
            {showProfilePicker && (
              <div
                className="nd-panel-raised absolute bottom-full left-4 z-[9999] mb-3 w-[260px] overflow-hidden rounded-2xl"
                style={{
                  backdropFilter: 'none',
                }}
              >
                <div className="border-b border-border px-4 py-3">
                  <div className="nd-label text-text-secondary">Shell Profiles</div>
                </div>
                <div className="py-2">
                  {availableProfiles.map((p) => (
                    <button
                      key={p.id}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-hover-bg"
                      style={{
                        color: p.available ? 'var(--text-primary)' : 'var(--text-disabled)',
                        cursor: p.available ? 'pointer' : 'not-allowed',
                      }}
                      disabled={!p.available}
                      onClick={() => {
                        if (!p.available) return
                        addTerminal(p.id)
                        setShowProfilePicker(false)
                      }}
                    >
                      <Terminal size={15} />
                      <span className="flex-1 text-sm">{p.label}</span>
                      <span className="nd-caption text-text-secondary">
                        {p.available ? '[ READY ]' : '[ MISSING ]'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                className="nd-panel-raised flex h-14 items-center justify-center gap-2 rounded-full text-text-secondary transition-colors hover:text-text-display"
                onClick={createTerminalFromSidebar}
                title="New terminal"
              >
                <Terminal size={16} />
                <span className="nd-label">Terminal</span>
              </button>
              <button
                className="nd-panel-raised flex h-14 items-center justify-center gap-2 rounded-full text-text-secondary transition-colors hover:text-text-display"
                onClick={() => {
                  setShowProfilePicker(false)
                  addNote()
                }}
                title="New note"
              >
                <StickyNote size={16} />
                <span className="nd-label">Note</span>
              </button>
              <button
                className="nd-panel-raised flex h-14 items-center justify-center gap-2 rounded-full text-text-secondary transition-colors hover:text-text-display"
                onClick={() => {
                  setShowProfilePicker(false)
                  addBrowser()
                }}
                title="New browser"
              >
                <Globe size={16} />
                <span className="nd-label">Browser</span>
              </button>
              <button
                className="nd-panel-raised flex h-14 items-center justify-center gap-2 rounded-full text-text-secondary transition-colors hover:text-text-display"
                onClick={() => {
                  setShowProfilePicker(false)
                  addBoard()
                }}
                title="New board"
              >
                <LayoutGrid size={16} />
                <span className="nd-label">Board</span>
              </button>
            </div>
          </div>
        }
      >
        <div className="flex h-full flex-col bg-bg-secondary">
          <div ref={workspaceMenuRef} className="relative border-b border-border px-5 py-4">
            <button
              className="flex w-full items-center justify-between rounded-2xl border border-border-visible bg-bg-tertiary px-4 py-4 text-left transition-colors hover:border-text-secondary"
              onClick={() => setShowWorkspacePicker((v) => !v)}
              title="Workspace actions"
            >
              <span className="min-w-0">
                <span className="nd-label block text-text-secondary">Workspace</span>
                <span className="mt-1 block truncate text-lg text-text-display">
                  {activeWorkspaceName || 'None'}
                </span>
              </span>
              <ChevronDown size={16} className="shrink-0 text-text-secondary" />
            </button>

            {showWorkspacePicker && (
              <div
                className="nd-panel-raised absolute left-5 right-5 top-full z-[9998] mt-3 overflow-hidden rounded-2xl"
                style={{
                  backdropFilter: 'none',
                }}
              >
                <div className="max-h-56 overflow-y-auto py-2">
                  {workspaces.map((workspace) => (
                    <button
                      key={workspace.id}
                      className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-hover-bg"
                      style={{
                        color: workspace.id === activeWorkspaceId ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                      onClick={() => switchWorkspace(workspace)}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setWorkspaceItemMenu({
                          workspaceId: workspace.id,
                          x: event.clientX,
                          y: event.clientY,
                        })
                      }}
                    >
                      <span className="truncate text-sm">{workspace.name}</span>
                      {workspace.id === activeWorkspaceId && (
                        <span className="nd-caption ml-3 text-text-secondary">[ ACTIVE ]</span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="border-t border-border p-2">
                  <button
                    className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm text-text-primary transition-colors hover:bg-hover-bg"
                    onClick={() => void createWorkspace()}
                  >
                    <FolderPlus size={14} />
                    <span className="nd-label">New Workspace</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 px-3 py-4">
            <div className="mb-3 flex items-center justify-between px-2">
              <span className="nd-label text-text-secondary">Active Surfaces</span>
              <span className="nd-caption text-text-secondary">
                {selectedTileIds.length > 1 ? `${selectedTileIds.length} SELECTED` : `${sortedTiles.length} TRACKED`}
              </span>
            </div>
            {tiles.length === 0 ? (
              <div className="nd-panel-raised rounded-[20px] px-5 py-8 text-center text-text-secondary">
                <div className="nd-label">[ EMPTY ]</div>
                <div className="mt-3 text-sm text-text-disabled">Create a terminal, note, browser, or board.</div>
              </div>
            ) : (
              <div className="space-y-2">
                {tiles
                  .slice()
                  .sort((a, b) => b.zIndex - a.zIndex)
                  .map((tile) => {
                    const isActive = tile.id === focusedTileId
                    const isSelected = selectedTileIds.includes(tile.id)

                    return (
                      <TileListItem
                        key={tile.id}
                        tile={tile}
                        active={isActive || isSelected}
                        className="w-full transition-colors"
                        onClick={() => handleSidebarTileClick(tile.id)}
                        onDoubleClick={() => handleShowTileFromSidebar(tile.id)}
                        onContextMenu={(event) => {
                          event.preventDefault()
                          setGroupMenu(null)
                          setTileMenu({ tileId: tile.id, x: event.clientX, y: event.clientY })
                        }}
                      />
                    )
                  })}
              </div>
            )}

            <div className="mb-3 mt-6 flex items-center justify-between px-2">
              <span className="nd-label text-text-secondary">Groups</span>
              <span className="nd-caption text-text-secondary">{groups.length} SAVED</span>
            </div>
            {groups.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-border px-5 py-6 text-sm text-text-disabled">
                Create a selection on the canvas and use the bottom Group bar to save it as a permanent group.
              </div>
            ) : (
              <div className="space-y-2">
                {groups.map((group) => {
                  const isSelectedGroup = selectedGroup?.id === group.id
                  const groupColor = GROUP_COLORS[group.colorId]
                  const isLockedGroup = Boolean(group.locked)

                  return (
                    <button
                      key={group.id}
                      className="w-full rounded-[20px] border px-4 py-4 text-left transition-colors"
                      style={{
                        background: isSelectedGroup ? 'var(--surface-raised)' : 'var(--surface)',
                        borderColor: isSelectedGroup ? 'var(--text-display)' : 'var(--border)',
                      }}
                      onClick={() => handleSelectGroup(group)}
                      onDoubleClick={() => handleShowGroup(group)}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        setTileMenu(null)
                        setGroupMenu({ groupId: group.id, x: event.clientX, y: event.clientY })
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 gap-3">
                          <span
                            className="mt-1 h-3 w-3 shrink-0 rounded-full border"
                            style={{ background: groupColor.swatch, borderColor: 'rgba(255,255,255,0.25)' }}
                          />
                          <div className="min-w-0">
                            <div className="nd-label text-text-secondary">
                              {isLockedGroup
                                ? isSelectedGroup ? '[ ACTIVE LOCKED GROUP ]' : '[ LOCKED GROUP ]'
                                : isSelectedGroup ? '[ ACTIVE GROUP ]' : '[ GROUP ]'}
                            </div>
                            <div className="mt-2 truncate text-sm text-text-display">{group.name}</div>
                          </div>
                        </div>
                        <span className="nd-caption shrink-0 text-text-secondary">{group.tileIds.length} TILES</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </Sidebar>

      {/* Right side: content + bars */}
      <div className="flex min-w-0 flex-1 flex-col">
        {showUpdateBanner && (
          <div className="border-b border-border bg-bg-secondary px-6 py-3">
            <div className="flex items-center justify-between gap-4 rounded-[20px] border border-border-visible bg-bg-tertiary px-4 py-3">
              <div className="min-w-0">
                <div className="nd-label text-text-secondary">Updates</div>
                <div className="mt-1 text-sm text-text-display">{updateBannerCopy.title}</div>
                <div className="mt-1 text-sm text-text-secondary">{updateBannerCopy.message}</div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {updateStatus === 'downloaded' && (
                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-text-display px-4 py-2 text-sm text-text-display transition-colors hover:bg-bg-secondary"
                    onClick={() => {
                      void installUpdate()
                    }}
                  >
                    <Download size={14} />
                    <span>Restart to install</span>
                  </button>
                )}

                <button
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:text-text-display"
                  onClick={() => setDismissedUpdateVersion(currentUpdateBannerKey)}
                  title="Dismiss update banner"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        <TopBar
          zoom={viewport.zoom}
          viewMode={viewMode}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(c => !c)}
          onSetViewMode={handleSetViewMode}
          onFitToContent={() => getCanvasMethods()?.fitViewToContent()}
          onZoomToggle={handleZoomToggle}
          onOpenSettings={() => setShowSettings(true)}
        />

        <div className="relative flex-1 overflow-hidden">
          {viewMode === 'fullview' && (
            <div className="absolute inset-x-0 top-0 z-10">
              <FullviewPanel
                containerRef={fullviewPanelRef}
                tiles={sortedTiles}
                activeTileId={fullviewActiveTileId}
                onActivateTile={(tileId) => {
                  setFullviewActiveTileId(tileId)
                  handleSelectSingleTile(tileId)
                }}
                onCloseTile={(tileId) => {
                  void closeTileFromFullview(tileId)
                }}
                onEditTile={openTileEditor}
                onFocusTile={focusTileInFullview}
                onRefreshTile={handleRefreshTile}
                onToggleLock={(tileId) => {
                  const tile = tiles.find((entry) => entry.id === tileId)
                  if (!tile) return
                  updateTile(tileId, { locked: !tile.locked })
                }}
              />
            </div>
          )}

          <Canvas
            profiles={availableProfiles}
            onCreateTerminal={(profileId) => addTerminal(profileId)}
            onCreateNote={() => addNote()}
            onCreateBrowser={() => addBrowser()}
            onCreateBoard={() => addBoard()}
            onCreateGroupFromSelection={() => {
              void handleCreateGroupFromSelection()
            }}
            onDeleteTile={deleteTile}
            onConfirmRemoveFromGroup={confirmRemoveTileFromGroup}
            tileRefreshKeys={tileRefreshKeys}
            viewMode={viewMode}
            fullviewActiveTileId={fullviewActiveTileId}
            fullviewTopInset={viewMode === 'fullview' ? fullviewTopInset : 0}
          />
        </div>
      </div>

      {/* Settings panel */}
      <SettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onOpenJsonEditor={() => {
          setShowSettings(false)
          setShowJsonEditor(true)
        }}
      />
      <RawJsonEditor
        open={showJsonEditor}
        workspaceId={activeWorkspaceId}
        onClose={() => setShowJsonEditor(false)}
        onApply={(state) => {
          restoreState(state)
          if (activeWorkspaceId) {
            window.electron.canvas.save(activeWorkspaceId, state)
          }
        }}
      />
      {tileMenu && activeTileMenu && (
        <ContextMenu
          x={tileMenu.x}
          y={tileMenu.y}
          items={tileMenuItems}
          onClose={() => setTileMenu(null)}
        />
      )}
      {groupMenu && activeGroupMenu && (
        <ContextMenu
          x={groupMenu.x}
          y={groupMenu.y}
          items={groupMenuItems}
          onClose={() => setGroupMenu(null)}
        />
      )}
      {workspaceItemMenu && activeWorkspaceMenu && (
        <ContextMenu
          x={workspaceItemMenu.x}
          y={workspaceItemMenu.y}
          items={workspaceMenuItems}
          onClose={() => setWorkspaceItemMenu(null)}
        />
      )}
      <AppDialog
        request={activeDialog?.request ?? null}
        onCancel={closeActiveDialog}
        onConfirm={confirmActiveDialog}
      />
      <GroupEditorDialog
        request={groupEditor?.request ?? null}
        onCancel={() => setGroupEditor(null)}
        onConfirm={handleConfirmGroupEditor}
      />
      <TileEditorDialog
        request={tileEditor?.request ?? null}
        onCancel={() => setTileEditor(null)}
        onConfirm={handleConfirmTileEditor}
      />
    </div>
  )
}
