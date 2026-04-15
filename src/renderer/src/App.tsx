import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { Canvas, getCanvasMethods } from './components/Canvas'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { SettingsPanel } from './components/SettingsPanel'
import { RawJsonEditor } from './components/RawJsonEditor'
import { ContextMenu, type MenuItem } from './components/ContextMenu'
import { FullviewPanel } from './components/FullviewPanel'
import { AppDialog, type ConfirmDialogOptions, type PromptDialogOptions } from './components/AppDialog'
import { GroupEditorDialog, type GroupEditorValue } from './components/GroupEditorDialog'
import { useCanvasStore } from './store/canvasStore'
import { useSettingsStore } from './store/settingsStore'
import { useCanvasActions } from './hooks/useCanvasActions'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useTheme } from './hooks/useTheme'
import { useFontSize } from './hooks/useFontSize'
import { findMergeTargetGroup, findSelectedGroup } from './utils/grouping'
import { GROUP_COLORS, GROUP_COLOR_ORDER, type TileState, type CanvasState, type Workspace, type TileGroup } from '@shared/types'
import { TILE_META } from './components/TileContent'
import { Terminal, StickyNote, Globe, LayoutGrid, ChevronDown, FolderPlus, Trash2, Pencil, Lock, Columns } from 'lucide-react'

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
      value: GroupEditorValue
    }
  | {
      mode: 'edit'
      groupId: string
      value: GroupEditorValue
    }
  | null

function isPromptDialog(dialog: PromptDialogState | ConfirmDialogState): dialog is PromptDialogState {
  return dialog.request.mode === 'prompt'
}

export default function App(): React.ReactElement {
  // Settings
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  useTheme()
  useFontSize()

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
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string }>>([])
  const [showSettings, setShowSettings] = useState(false)
  const [showJsonEditor, setShowJsonEditor] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [groupEditor, setGroupEditor] = useState<GroupEditorState>(null)
  const [renamingTileId, setRenamingTileId] = useState<string | null>(null)
  const [renamingValue, setRenamingValue] = useState('')
  const [tileMenu, setTileMenu] = useState<{ tileId: string; x: number; y: number } | null>(null)
  const [groupMenu, setGroupMenu] = useState<{ groupId: string; x: number; y: number } | null>(null)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevZoomRef = useRef(1)
  const footerRef = useRef<HTMLDivElement | null>(null)
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null)

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

  const loadWorkspace = useCallback(
    (workspaceId: string) => {
      window.electron.canvas.load(workspaceId).then((state: CanvasState | null) => {
        if (state) {
          restoreState(state)
        } else {
          restoreState({
            tiles: [],
            groups: [],
            viewport: { tx: 0, ty: 0, zoom: 1 },
            nextZIndex: 1,
            focusedTileId: null,
            viewMode: 'fullview',
            fullviewActiveTileId: null,
          })
        }
      })
    },
    [restoreState],
  )

  const refreshWorkspaces = useCallback(async (): Promise<Workspace[]> => {
    const list = await window.electron.workspace.list()
    setWorkspaces(list)
    return list
  }, [])

  // Load workspaces on mount
  useEffect(() => {
    console.log('[App] Loading workspaces and shell profiles...')
    refreshWorkspaces().then((list) => {
      console.log('[App] Workspaces:', list)
      const active = list.find((w) => w.id === (activeWorkspaceId || list[0]?.id))
      if (active) {
        setWorkspace(active.id, active.name)
        loadWorkspace(active.id)
      }
    }).catch((err) => console.error('[App] Error loading workspaces:', err))
    window.electron.shellProfiles.list().then((profiles) => {
      console.log('[App] Shell profiles:', profiles)
      setProfiles(profiles.map((p) => ({ id: p.id, label: p.label, available: p.available })))
    }).catch((err) => console.error('[App] Error loading shell profiles:', err))
  }, [])

  // Switch workspace
  const switchWorkspace = useCallback(
    (id: string) => {
      if (activeWorkspaceId) saveToDisk(activeWorkspaceId)
      window.electron.workspace.setActive(id)
      const ws = workspaces.find((w) => w.id === id)
      if (ws) {
        setWorkspace(ws.id, ws.name)
        loadWorkspace(ws.id)
      }
      setShowWorkspacePicker(false)
    },
    [activeWorkspaceId, workspaces, loadWorkspace],
  )

  // Auto-save (debounced)
  const saveToDisk = useCallback(
    (workspaceId: string) => {
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
      window.electron.canvas.save(workspaceId, state)
    },
    [tiles, groups, viewport, nextZIndex, focusedTileId, viewMode, fullviewActiveTileId],
  )

  const scheduleSave = useCallback(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      if (activeWorkspaceId) saveToDisk(activeWorkspaceId)
    }, 500)
  }, [activeWorkspaceId, saveToDisk])

  useEffect(() => {
    if (activeWorkspaceId) scheduleSave()
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
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [showWorkspacePicker])

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
      setShowSettings(false)
      setTileMenu(null)
      setGroupMenu(null)
      setGroupEditor(null)
      setRenamingTileId(null)
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

  const handleFocusTile = useCallback((tileId: string) => {
    handleSelectSingleTile(tileId)
    getCanvasMethods()?.centerViewOnTile(tileId)
  }, [handleSelectSingleTile])

  const handleSetViewMode = useCallback((mode: 'canvas' | 'fullview') => {
    if (mode === 'fullview') {
      const nextActive =
        fullviewActiveTileId && tiles.some((tile) => tile.id === fullviewActiveTileId)
          ? fullviewActiveTileId
          : focusedTileId ??
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

  const handleCreateGroupFromSelection = useCallback(() => {
    if (mergeTargetGroup) {
      addTilesToGroup(mergeTargetGroup.id, selectedTileIds)
      return
    }

    if (selectedTileIds.length < 2) return
    setGroupEditor({
      mode: 'create',
      tileIds: [...selectedTileIds],
      value: {
        name: 'Untitled Group',
        colorId: GROUP_COLOR_ORDER[groups.length % GROUP_COLOR_ORDER.length] ?? GROUP_COLOR_ORDER[0],
        locked: false,
        wslStartupCommand: '',
      },
    })
  }, [addTilesToGroup, groups.length, mergeTargetGroup, selectedTileIds])

  const openGroupEditor = useCallback((group: TileGroup) => {
    setGroupMenu(null)
    setGroupEditor({
      mode: 'edit',
      groupId: group.id,
      value: {
        name: group.name,
        colorId: group.colorId,
        locked: Boolean(group.locked),
        wslStartupCommand: group.terminal?.wslStartupCommand ?? '',
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

    setViewMode('canvas')
    requestAnimationFrame(() => {
      getCanvasMethods()?.fitViewToBounds(bounds)
    })
  }, [getGroupBounds, setViewMode])

  const beginRenameTile = useCallback((tile: TileState) => {
    setTileMenu(null)
    setRenamingTileId(tile.id)
    setRenamingValue(tile.label ?? '')
  }, [])

  const commitRenameTile = useCallback((tileId: string) => {
    updateTile(tileId, { label: renamingValue.trim() || undefined })
    setRenamingTileId(null)
    setRenamingValue('')
  }, [renamingValue, updateTile])

  const cancelRenameTile = useCallback(() => {
    setRenamingTileId(null)
    setRenamingValue('')
  }, [])

  const renameTile = useCallback((tileId: string, label?: string) => {
    updateTile(tileId, { label })
  }, [updateTile])

  const createWorkspace = useCallback(async () => {
    const name = await requestPrompt({
      title: 'Create workspace',
      message: 'Choose a name for the new workspace.',
      confirmLabel: 'Create',
      cancelLabel: 'Cancel',
      placeholder: 'Workspace name',
    })
    if (!name?.trim()) return

    if (activeWorkspaceId) saveToDisk(activeWorkspaceId)
    const created = await window.electron.workspace.create(name.trim())
    const list = await refreshWorkspaces()
    setWorkspace(created.id, created.name)
    setShowWorkspacePicker(false)
    loadWorkspace(created.id)
    if (!list.some((w) => w.id === created.id)) {
      setWorkspaces((prev) => [...prev, created])
    }
  }, [activeWorkspaceId, loadWorkspace, refreshWorkspaces, requestPrompt, saveToDisk, setWorkspace])

  const deleteCurrentWorkspace = useCallback(async () => {
    if (!activeWorkspaceId) return
    const confirmed = await requestConfirm({
      title: 'Delete workspace',
      message: `Delete workspace "${activeWorkspaceName}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Keep Workspace',
      danger: true,
    })
    if (!confirmed) return

    if (activeWorkspaceId) saveToDisk(activeWorkspaceId)
    await window.electron.workspace.delete(activeWorkspaceId)
    const list = await refreshWorkspaces()
    const nextActive = await window.electron.workspace.getActive()

    if (nextActive) {
      setWorkspace(nextActive.id, nextActive.name)
      loadWorkspace(nextActive.id)
    } else if (list[0]) {
      setWorkspace(list[0].id, list[0].name)
      loadWorkspace(list[0].id)
    }

    setShowWorkspacePicker(false)
  }, [activeWorkspaceId, activeWorkspaceName, loadWorkspace, refreshWorkspaces, requestConfirm, saveToDisk, setWorkspace])

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
  const tileMenuItems: MenuItem[] = activeTileMenu ? [
    {
      label: 'Rename',
      icon: Pencil,
      action: () => beginRenameTile(activeTileMenu),
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
          <div className="border-b border-border px-5 py-6">
            <div className="nd-label text-text-secondary">Workspace Console</div>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <div className="nd-display text-[44px] text-text-display">
                  {tiles.length.toString().padStart(2, '0')}
                </div>
                <div className="nd-caption mt-1 text-text-secondary">OPEN SURFACES</div>
              </div>
              <div className="nd-caption text-right text-text-secondary">
                {viewMode === 'fullview' ? '[ FOCUS MODE ]' : '[ CANVAS MODE ]'}
              </div>
            </div>
          </div>

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
                      onClick={() => switchWorkspace(workspace.id)}
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
                  <button
                    className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm text-danger transition-colors hover:bg-hover-bg"
                    onClick={() => void deleteCurrentWorkspace()}
                  >
                    <Trash2 size={14} />
                    <span className="nd-label">Delete Workspace</span>
                  </button>
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between">
              <span className="nd-caption text-text-secondary">FOCUSED APP</span>
              <span className="font-mono text-sm text-text-display">{focusedTileId ? focusedTileId.slice(-4) : '--'}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="nd-caption text-text-secondary">SELECTION</span>
              <span className="font-mono text-sm text-text-display">{selectedTileIds.length.toString().padStart(2, '0')}</span>
            </div>
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
                    const meta = TILE_META[tile.type]
                    const Icon = meta.icon
                    const isActive = tile.id === focusedTileId
                    const isSelected = selectedTileIds.includes(tile.id)

                    return (
                      <button
                        key={tile.id}
                        className="w-full rounded-[20px] border px-4 py-4 text-left transition-colors"
                        style={{
                          background: isActive || isSelected ? 'var(--surface-raised)' : 'var(--surface)',
                          borderColor: isActive ? 'var(--text-display)' : isSelected ? 'var(--border-visible)' : 'var(--border)',
                          color: isActive || isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                        onClick={() => handleFocusTile(tile.id)}
                        onContextMenu={(event) => {
                          event.preventDefault()
                          setGroupMenu(null)
                          setTileMenu({ tileId: tile.id, x: event.clientX, y: event.clientY })
                        }}
                        title={meta.label}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-visible">
                            <Icon size={15} className="shrink-0" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="nd-label text-text-secondary">
                              {isSelected ? '[ SELECTED ]' : tile.id === fullviewActiveTileId ? '[ PRIMARY ]' : '[ OPEN ]'}
                            </div>
                            {renamingTileId === tile.id ? (
                              <input
                                autoFocus
                                className="mt-2 min-w-0 w-full border-b border-border-visible bg-transparent px-0 py-1 text-sm text-text-primary outline-none"
                                value={renamingValue}
                                onChange={(event) => setRenamingValue(event.target.value)}
                                onBlur={() => commitRenameTile(tile.id)}
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault()
                                    commitRenameTile(tile.id)
                                  }
                                  if (event.key === 'Escape') {
                                    event.preventDefault()
                                    cancelRenameTile()
                                  }
                                }}
                              />
                            ) : (
                              <div className="mt-2 truncate text-sm text-text-display">
                                {tile.label ?? `${meta.label} ${tile.id.slice(-4)}`}
                              </div>
                            )}
                            <div className="nd-caption mt-2 text-text-secondary">{meta.label.toUpperCase()}</div>
                          </div>
                        </div>
                      </button>
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
                tiles={sortedTiles}
                activeTileId={fullviewActiveTileId}
                focusedTileId={focusedTileId}
                onActivateTile={(tileId) => {
                  setFullviewActiveTileId(tileId)
                  handleSelectSingleTile(tileId)
                }}
                onCloseTile={(tileId) => {
                  void closeTileFromFullview(tileId)
                }}
                onRenameTile={renameTile}
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
            viewMode={viewMode}
            fullviewActiveTileId={fullviewActiveTileId}
            fullviewTopInset={viewMode === 'fullview' ? 118 : 0}
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
      <AppDialog
        request={activeDialog?.request ?? null}
        onCancel={closeActiveDialog}
        onConfirm={confirmActiveDialog}
      />
      <GroupEditorDialog
        request={groupEditor ? {
          title: groupEditor.mode === 'create' ? 'Create group' : 'Edit group',
          confirmLabel: groupEditor.mode === 'create' ? 'Create Group' : 'Save Group',
          value: groupEditor.value,
        } : null}
        onCancel={() => setGroupEditor(null)}
        onConfirm={handleConfirmGroupEditor}
      />
    </div>
  )
}
