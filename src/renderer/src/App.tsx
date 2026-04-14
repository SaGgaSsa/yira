import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { Canvas, getCanvasMethods } from './components/Canvas'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { SettingsPanel } from './components/SettingsPanel'
import { RawJsonEditor } from './components/RawJsonEditor'
import { ContextMenu, type MenuItem } from './components/ContextMenu'
import { FullviewPanel } from './components/FullviewPanel'
import { useCanvasStore } from './store/canvasStore'
import { useSettingsStore } from './store/settingsStore'
import { useCanvasActions } from './hooks/useCanvasActions'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useTheme } from './hooks/useTheme'
import { useFontSize } from './hooks/useFontSize'
import { KANBAN_BOARD_FIXED_WIDTH } from '@shared/types'
import type { TileState, CanvasState, Workspace } from '@shared/types'
import { TILE_META } from './components/TileContent'
import { Terminal, StickyNote, Globe, LayoutGrid, ChevronDown, FolderPlus, Trash2, Pencil } from 'lucide-react'

export default function App(): React.ReactElement {
  // Settings
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  useTheme()
  useFontSize()

  // Canvas state
  const tiles = useCanvasStore((s) => s.tiles)
  const viewport = useCanvasStore((s) => s.viewport)
  const nextZIndex = useCanvasStore((s) => s.nextZIndex)
  const focusedTileId = useCanvasStore((s) => s.focusedTileId)
  const viewMode = useCanvasStore((s) => s.viewMode)
  const fullviewActiveTileId = useCanvasStore((s) => s.fullviewActiveTileId)
  const activeWorkspaceId = useCanvasStore((s) => s.activeWorkspaceId)
  const activeWorkspaceName = useCanvasStore((s) => s.activeWorkspaceName)
  const availableProfiles = useCanvasStore((s) => s.availableProfiles)
  const setViewport = useCanvasStore((s) => s.setViewport)
  const setTiles = useCanvasStore((s) => s.setTiles)
  const restoreState = useCanvasStore((s) => s.restoreState)
  const updateTile = useCanvasStore((s) => s.updateTile)
  const focusTile = useCanvasStore((s) => s.focusTile)
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const setWorkspace = useCanvasStore((s) => s.setWorkspace)
  const setProfiles = useCanvasStore((s) => s.setProfiles)
  const setViewMode = useCanvasStore((s) => s.setViewMode)
  const setFullviewActiveTileId = useCanvasStore((s) => s.setFullviewActiveTileId)

  // Canvas actions (extracted hook)
  const { addTerminal, addNote, addBrowser, addBoard, deleteTile, resetZoom } = useCanvasActions()

  // UI state
  const [showProfilePicker, setShowProfilePicker] = useState(false)
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false)
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string }>>([])
  const [showSettings, setShowSettings] = useState(false)
  const [showJsonEditor, setShowJsonEditor] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [renamingTileId, setRenamingTileId] = useState<string | null>(null)
  const [renamingValue, setRenamingValue] = useState('')
  const [tileMenu, setTileMenu] = useState<{ tileId: string; x: number; y: number } | null>(null)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevZoomRef = useRef(1)
  const footerRef = useRef<HTMLDivElement | null>(null)
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null)

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
        viewport: { ...viewport },
        nextZIndex,
        focusedTileId,
        viewMode,
        fullviewActiveTileId,
      }
      window.electron.canvas.save(workspaceId, state)
    },
    [tiles, viewport, nextZIndex, focusedTileId, viewMode, fullviewActiveTileId],
  )

  const scheduleSave = useCallback(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      if (activeWorkspaceId) saveToDisk(activeWorkspaceId)
    }, 500)
  }, [activeWorkspaceId, saveToDisk])

  useEffect(() => {
    if (activeWorkspaceId) scheduleSave()
  }, [tiles, viewport, nextZIndex, activeWorkspaceId, scheduleSave])

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
    viewMode,
    deleteTile,
    resetZoom,
    focusTile,
    setViewMode,
    onClosePicker: () => {
      setShowProfilePicker(false)
      setShowWorkspacePicker(false)
      setShowSettings(false)
      setTileMenu(null)
      setRenamingTileId(null)
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

  const handleFocusTile = useCallback((tileId: string) => {
    focusTile(tileId)
    bringToFront(tileId)
    setFullviewActiveTileId(tileId)
    getCanvasMethods()?.centerViewOnTile(tileId)
  }, [focusTile, bringToFront, setFullviewActiveTileId])

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
    const name = window.prompt('Workspace name')
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
  }, [activeWorkspaceId, saveToDisk, refreshWorkspaces, setWorkspace, loadWorkspace])

  const deleteCurrentWorkspace = useCallback(async () => {
    if (!activeWorkspaceId) return
    if (!window.confirm(`Delete workspace "${activeWorkspaceName}"?`)) return

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
  }, [activeWorkspaceId, activeWorkspaceName, saveToDisk, refreshWorkspaces, setWorkspace, loadWorkspace])

  const createTerminalFromSidebar = useCallback(() => {
    if (availableProfiles.length <= 1 && defaultProfile) {
      addTerminal(defaultProfile.id)
      setShowProfilePicker(false)
      return
    }
    setShowProfilePicker((v) => !v)
  }, [availableProfiles.length, defaultProfile, addTerminal])

  const activeTileMenu = tileMenu ? tiles.find((tile) => tile.id === tileMenu.tileId) ?? null : null
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
      label: 'Cycle Radius',
      action: () => updateTile(activeTileMenu.id, { radiusIndex: ((activeTileMenu.radiusIndex ?? 0) + 1) % 4 }),
    },
    {
      label: 'Close',
      icon: Trash2,
      danger: true,
      action: () => deleteTile(activeTileMenu.id),
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

  const closeTileFromFullview = useCallback((tileId: string) => {
    const ordered = tiles.slice().sort((a, b) => b.zIndex - a.zIndex)
    const index = ordered.findIndex((tile) => tile.id === tileId)
    const fallback =
      ordered[index + 1]?.id ??
      ordered[index - 1]?.id ??
      null

    if (fullviewActiveTileId === tileId) {
      setFullviewActiveTileId(fallback)
      if (!fallback) setViewMode('canvas')
    }

    deleteTile(tileId)
  }, [tiles, fullviewActiveTileId, deleteTile, setFullviewActiveTileId, setViewMode])

  const centerViewportForTiles = useCallback((nextTiles: TileState[]) => {
    if (nextTiles.length === 0) {
      setViewport({ tx: 0, ty: 0, zoom: 1 })
      return
    }

    const minX = Math.min(...nextTiles.map((tile) => tile.x))
    const minY = Math.min(...nextTiles.map((tile) => tile.y))
    const maxX = Math.max(...nextTiles.map((tile) => tile.x + tile.width))
    const maxY = Math.max(...nextTiles.map((tile) => tile.y + tile.height))
    const boundsWidth = maxX - minX
    const boundsHeight = maxY - minY
    const container = document.querySelector('.canvas-root') as HTMLDivElement | null
    const width = container?.clientWidth ?? window.innerWidth
    const height = container?.clientHeight ?? window.innerHeight
    setViewport({
      tx: width / 2 - (minX + boundsWidth / 2),
      ty: height / 2 - (minY + boundsHeight / 2),
      zoom: 1,
    })
  }, [setViewport])

  const arrangeTiles = useCallback((mode: 'grid' | 'columns' | 'rows') => {
    if (tiles.length === 0) return

    const gap = 40
    let cursorX = 0
    let cursorY = 0
    let rowHeight = 0
    const cols = mode === 'grid' ? Math.max(1, Math.ceil(Math.sqrt(tiles.length))) : 1

    const nextTiles = sortedTiles.map((tile, index) => {
      let nextX = cursorX
      let nextY = cursorY

      if (mode === 'grid') {
        if (index > 0 && index % cols === 0) {
          cursorX = 0
          cursorY += rowHeight + gap
          rowHeight = 0
        }
        nextX = cursorX
        nextY = cursorY
        cursorX += tile.width + gap
        rowHeight = Math.max(rowHeight, tile.height)
      } else if (mode === 'columns') {
        nextX = 0
        nextY = cursorY
        cursorY += tile.height + gap
      } else {
        nextX = cursorX
        nextY = 0
        cursorX += tile.width + gap
      }

      return {
        ...tile,
        x: Math.round(nextX / 20) * 20,
        y: Math.round(nextY / 20) * 20,
        width: tile.type === 'kanban' ? KANBAN_BOARD_FIXED_WIDTH : tile.width,
      }
    })

    setTiles(nextTiles)
    centerViewportForTiles(nextTiles)
  }, [tiles.length, sortedTiles, setTiles, centerViewportForTiles])

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
          </div>

          <div className="flex-1 px-3 py-4">
            <div className="mb-3 flex items-center justify-between px-2">
              <span className="nd-label text-text-secondary">Active Surfaces</span>
              <span className="nd-caption text-text-secondary">{sortedTiles.length} TRACKED</span>
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

                    return (
                      <button
                        key={tile.id}
                        className="w-full rounded-[20px] border px-4 py-4 text-left transition-colors"
                        style={{
                          background: isActive ? 'var(--surface-raised)' : 'var(--surface)',
                          borderColor: isActive ? 'var(--text-display)' : 'var(--border)',
                          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                        onClick={() => handleFocusTile(tile.id)}
                        onContextMenu={(event) => {
                          event.preventDefault()
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
                              {tile.id === fullviewActiveTileId ? '[ PRIMARY ]' : '[ OPEN ]'}
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
          onArrangeGrid={() => arrangeTiles('grid')}
          onArrangeColumns={() => arrangeTiles('columns')}
          onArrangeRows={() => arrangeTiles('rows')}
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
                  focusTile(tileId)
                }}
                onCloseTile={closeTileFromFullview}
                onRenameTile={renameTile}
              />
            </div>
          )}

          <Canvas
            profiles={availableProfiles}
            onCreateTerminal={(profileId) => addTerminal(profileId)}
            onCreateNote={() => addNote()}
            onCreateBrowser={() => addBrowser()}
            onCreateBoard={() => addBoard()}
            viewMode={viewMode}
            fullviewActiveTileId={fullviewActiveTileId}
            fullviewTopInset={viewMode === 'fullview' ? 128 : 0}
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
    </div>
  )
}
