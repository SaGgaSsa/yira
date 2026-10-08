import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Canvas, getCanvasMethods } from './components/Canvas'
import { TileCreationSelector, type TileCreationSelectorProps } from './components/TileCreationSelector'
import { TileCreationMenu } from './components/TileCreationMenu'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { WorkspacePanel } from './components/WorkspacePanel'
import { SettingsPanel, type SettingsSectionId } from './components/SettingsPanel'
import { RawJsonEditor } from './components/RawJsonEditor'
import { ContextMenu, type MenuItem } from './components/ContextMenu'
import { SplitviewPanel } from './components/SplitviewPanel'
import { GridView } from './components/GridView'
import { BoardView } from './components/BoardView'
import { FloatingTileWindow } from './components/FloatingTileWindow'
import { TerminalRuntimeProvider, useTerminalRuntimeContext } from './components/TerminalRuntimeProvider'
import { AppDialog, type ConfirmDialogOptions, type PromptDialogOptions } from './components/AppDialog'
import { WorkspaceDialog, type WorkspaceDialogRequest, type WorkspaceDialogValue } from './components/WorkspaceDialog'
import { WorkspaceManagementDialog } from './components/WorkspaceManagementDialog'
import { ActiveWorkspaceEntry } from './components/ActiveWorkspaceEntry'
import { InactiveWorkspaceRow } from './components/InactiveWorkspaceRow'
import { WorkspaceSidebarSection } from './components/WorkspaceSidebarSection'
import { WorkspaceHome } from './components/WorkspaceHome'
import { WorkspaceActivityView } from './components/WorkspaceActivityView'
import { AgentsView } from './components/AgentsView'
import { ActivityPalette } from './components/ActivityPalette'
import { useWorkspaceTerminalCounts } from './hooks/useWorkspaceTerminalCounts'
import { useTerminalProcessActivity } from './hooks/useTerminalProcessActivity'
import { buildWorkspaceActivityCards, resolveActivationFocusTarget } from './utils/workspaceActivity'
import { TileEditorDialog, type TileEditorRequest, type TileEditorValue } from './components/TileEditorDialog'
import { useCanvasStore } from './store/canvasStore'
import { useSettingsStore } from './store/settingsStore'
import { useCanvasActions } from './hooks/useCanvasActions'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useAgentsView } from './hooks/useAgentsView'
import { useTheme } from './hooks/useTheme'
import { useFontSize } from './hooks/useFontSize'
import { resolveSidebarCollapsedForActivity } from './utils/emptyWorkspaceView'
import { useUpdateStore } from './store/updateStore'
import {
  GRID_MAX_TILES,
  getDefaultTileSize,
  type AgentActiveSession,
  type AgentSessionCreateResult,
  type AgentSessionHistoryItem,
  type AgentUsageSnapshot,
  type BoardState,
  type BoardTask,
  type FileTileOpenOptions,
  type TileState,
  type CanvasState,
  type GridWorkspaceState,
  type Workspace,
  type WorkspaceMetadata,
  type ViewMode,
  type SplitPanelId,
  type SplitViewState,
  type WorkspaceManagementEntry,
  type WorkspaceType,
} from '@shared/types'
import { createDefaultAgentProvidersConfig } from '@shared/workspaceConfig'
import { createEmptyGridWorkspaceState, normalizeGridWorkspaceState } from '@shared/gridWorkspaceState'
import {
  reconcileCanvasStateWithSharedTiles,
  reconcileGridStateWithSharedTiles,
} from '@shared/workspaceTypeSwitch'
import { getBoardReviewCount } from '@shared/board'
import { countAgentsViewAttention } from './utils/agentsViewSessions'
import { getAgentSessionSurface } from './utils/activityPalette'
import { sanitizeAgentCwd } from './utils/agentPanel'
import { getAttachedTiles, isTileDetached, selectFloatingTileWindowOpenRequests } from '@shared/floatingTiles'
import { refreshGridTileContent } from './utils/gridTileRefresh'
import { DEFAULT_SPLIT_ORIENTATION, toggleSplitOrientation } from './utils/splitViewState'
import { getActiveWindowTitle, getVisibleActiveTileId } from './utils/windowTitle'
import { getAgentSessionTitles } from './utils/terminalDisplayTitle'
import {
  buildAgentAlertNotificationText,
  decideAgentAlertNotification,
} from './utils/agentAlertNotifications'
import { playAgentAlertSound } from './utils/agentAlertSound'
import { resolveViewModeTransition } from './utils/viewModeTransition'
import {
  resolveSidebarCollapsedAfterWorkspaceViewChange,
  shouldKeepSidebarOpenForWorkspace,
} from './utils/emptyWorkspaceView'
import { normalizeCanvasStateForJson } from './utils/canvasStateNormalization'
import {
  sumTerminalAttentionCounts,
} from './utils/workspaceAttention'
import { getTileTypeLabel } from './components/TileContent'
import { resolveWorkspaceFocusTarget } from './utils/workspaceFocus'
import { mergeWorkspaceSelectionResult } from './utils/workspaceSelectionActions'
import { getWorkspaceSidebarOrder } from './utils/workspaceOrdering'
import {
  getActiveSidebarWorkspaces,
  getInactiveSidebarWorkspaces,
} from './utils/workspaceSidebarSections'
import { getInitialWorkspaceDialogCopy, getWorkspaceDialogCopy } from './utils/workspaceDialogCopy'
import { buildTileConfigurationMenuItems } from './components/tileConfigurationMenu'
import { createFileTileOpenRequestTracker, deriveFileTileTitle, planFileTileOpen } from './utils/fileTileLifecycle'
import { isImageFilePath } from './utils/fileImage'
import { windowBufferRegistry } from './utils/windowBufferRegistry'
import {
  destroyRemovedWorkspaceRuntimes,
  destroyTerminalRuntime,
  pruneWorkspaceTerminalRuntimes,
} from './utils/terminalRuntimeCleanup'
import type { TerminalSessionTarget } from '@shared/terminalSessionIdentity'
import { Terminal, StickyNote, SlidersHorizontal, Download, X, Plus, House } from 'lucide-react'

const EMPTY_BOARD_STATE: BoardState = {
  enabled: false,
  tasks: [],
}

function createEmptyCanvasState(): CanvasState {
  return {
    tiles: [],
    viewport: { tx: 0, ty: 0, zoom: 1 },
    nextZIndex: 1,
    focusedTileId: null,
    viewMode: 'fullview',
    fullviewActiveTileId: null,
    boardVisible: true,
    splitViewState: {
      leftTileIds: [],
      rightTileIds: [],
      activeLeftTileId: null,
      activeRightTileId: null,
      focusedPanel: 'left',
      orientation: DEFAULT_SPLIT_ORIENTATION,
    },
  }
}

type CanvasSnapshotSource = Pick<
  ReturnType<typeof useCanvasStore.getState>,
  'tiles' | 'viewport' | 'nextZIndex' | 'focusedTileId' | 'viewMode' | 'fullviewActiveTileId' | 'boardVisible' | 'splitViewState'
>
type GridSnapshotSource = Pick<ReturnType<typeof useCanvasStore.getState>, 'tiles' | 'nextZIndex' | 'focusedTileId' | 'viewMode' | 'fullviewActiveTileId' | 'boardVisible' | 'gridViewState' | 'splitViewState'>

function createCanvasSnapshot(source: CanvasSnapshotSource): CanvasState {
  return {
    tiles: source.tiles.map((tile) => ({ ...tile })),
    viewport: { ...source.viewport },
    nextZIndex: source.nextZIndex,
    focusedTileId: source.focusedTileId,
    viewMode: source.viewMode,
    fullviewActiveTileId: source.fullviewActiveTileId,
    boardVisible: source.boardVisible,
    splitViewState: {
      ...source.splitViewState,
      leftTileIds: [...source.splitViewState.leftTileIds],
      rightTileIds: [...source.splitViewState.rightTileIds],
    },
  }
}

function createGridSnapshot(source: GridSnapshotSource): GridWorkspaceState {
  return {
    tiles: source.tiles.map((tile) => ({ ...tile })),
    nextZIndex: source.nextZIndex,
    focusedTileId: source.focusedTileId,
    viewMode: source.viewMode === 'fullview' || source.viewMode === 'splitview' ? source.viewMode : 'gridview',
    splitViewState: {
      ...source.splitViewState,
      leftTileIds: [...source.splitViewState.leftTileIds],
      rightTileIds: [...source.splitViewState.rightTileIds],
    },
    fullviewActiveTileId: source.fullviewActiveTileId,
    boardVisible: source.boardVisible,
    gridViewState: {
      rootNode: source.gridViewState.rootNode ? JSON.parse(JSON.stringify(source.gridViewState.rootNode)) as GridWorkspaceState['gridViewState']['rootNode'] : null,
    },
  }
}

function buildInitialSplitViewState(tiles: TileState[], activeTileId: string | null): SplitViewState {
  if (tiles.length < 2) {
    return {
      leftTileIds: [],
      rightTileIds: [],
      activeLeftTileId: null,
      activeRightTileId: null,
      focusedPanel: 'left',
      orientation: DEFAULT_SPLIT_ORIENTATION,
    }
  }

  const ordered = tiles.slice().sort((a, b) => b.zIndex - a.zIndex)
  const existingIds = new Set(ordered.map((tile) => tile.id))
  const leftActiveId = activeTileId && existingIds.has(activeTileId)
    ? activeTileId
    : ordered[0]?.id ?? null
  const rightTileIds = ordered.map((tile) => tile.id).filter((tileId) => tileId !== leftActiveId)

  return {
    leftTileIds: leftActiveId ? [leftActiveId] : [],
    rightTileIds,
    activeLeftTileId: leftActiveId,
    activeRightTileId: rightTileIds[0] ?? null,
    focusedPanel: 'left',
    orientation: DEFAULT_SPLIT_ORIENTATION,
  }
}

function normalizeSplitViewForTiles(
  splitViewState: SplitViewState,
  tiles: TileState[],
  activeTileId: string | null,
): SplitViewState {
  const existingIds = new Set(tiles.map((tile) => tile.id))
  const seen = new Set<string>()
  const cleanIds = (ids: string[]) => ids.filter((tileId) => {
    if (!existingIds.has(tileId) || seen.has(tileId)) return false
    seen.add(tileId)
    return true
  })
  const leftTileIds = cleanIds(splitViewState.leftTileIds)
  const rightTileIds = cleanIds(splitViewState.rightTileIds)
  const missingTileIds = tiles.map((tile) => tile.id).filter((tileId) => !seen.has(tileId))
  const missingActiveId = activeTileId && missingTileIds.includes(activeTileId)
    ? activeTileId
    : null
  const missingInactiveIds = missingTileIds.filter((tileId) => tileId !== missingActiveId)

  if (leftTileIds.length === 0 || rightTileIds.length === 0) {
    return {
      ...buildInitialSplitViewState(tiles, activeTileId),
      orientation: splitViewState.orientation,
    }
  }

  const nextLeftTileIds = missingActiveId
    ? [missingActiveId, ...leftTileIds]
    : leftTileIds
  const nextRightTileIds = [...rightTileIds, ...missingInactiveIds]

  return {
    leftTileIds: nextLeftTileIds,
    rightTileIds: nextRightTileIds,
    activeLeftTileId: missingActiveId ?? (splitViewState.activeLeftTileId && nextLeftTileIds.includes(splitViewState.activeLeftTileId)
      ? splitViewState.activeLeftTileId
      : nextLeftTileIds[0] ?? null),
    activeRightTileId: splitViewState.activeRightTileId && nextRightTileIds.includes(splitViewState.activeRightTileId)
      ? splitViewState.activeRightTileId
      : nextRightTileIds[0] ?? null,
    focusedPanel: splitViewState.focusedPanel === 'right' ? 'right' : 'left',
    orientation: splitViewState.orientation,
  }
}

function areSplitViewStatesEqual(a: SplitViewState, b: SplitViewState): boolean {
  return a.focusedPanel === b.focusedPanel &&
    a.orientation === b.orientation &&
    a.activeLeftTileId === b.activeLeftTileId &&
    a.activeRightTileId === b.activeRightTileId &&
    a.leftTileIds.length === b.leftTileIds.length &&
    a.rightTileIds.length === b.rightTileIds.length &&
    a.leftTileIds.every((tileId, index) => tileId === b.leftTileIds[index]) &&
    a.rightTileIds.every((tileId, index) => tileId === b.rightTileIds[index])
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

type TileEditorState = {
  tileId: string
  request: TileEditorRequest
} | null

type WorkspaceEditorState =
  | {
      mode: 'create'
      request: WorkspaceDialogRequest
    }
  | {
      mode: 'edit'
      workspaceId: string
      request: WorkspaceDialogRequest
    }
  | null

type WorkspaceActivationOptions = {
  persistCurrent?: boolean
  updateMain?: boolean
  activationMode?: 'focus-last'
}

function isPromptDialog(dialog: PromptDialogState | ConfirmDialogState): dialog is PromptDialogState {
  return dialog.request.mode === 'prompt'
}

function AppContent(): React.ReactElement {
  const terminalProcessActivity = useTerminalProcessActivity()
  const {
    registry,
    workspaceAttentionCounts,
    recentOutputCounts,
    updateWorkspaceAttentionCount,
    clearWorkspaceAttentionCount,
    pruneWorkspaceAttentionCounts,
    clearAllWorkspaceAttentionCounts,
  } = useTerminalRuntimeContext()
  const { t } = useTranslation()
  const [agentUsage, setAgentUsage] = useState<AgentUsageSnapshot | null>(null)
  // Keep startup copy stable: this effect must stay mount-only to avoid reloading persisted workspace state on language changes.
  const startupFirstWorkspaceDialogCopyRef = useRef(getInitialWorkspaceDialogCopy(t))

  // Settings
  useTheme()
  useFontSize()
  const initializeUpdates = useUpdateStore((s) => s.initialize)
  const updateStatus = useUpdateStore((s) => s.status)
  const updateAvailableVersion = useUpdateStore((s) => s.availableVersion)
  const updateProgressPercent = useUpdateStore((s) => s.progressPercent)
  const updateMessage = useUpdateStore((s) => s.message)
  const installUpdate = useUpdateStore((s) => s.installUpdate)
  const agentSettings = useSettingsStore((s) => s.agents)
  const newAgentSessionShortcut = useSettingsStore((s) => s.shortcuts.newAgentSession)
  const terminalAttentionEnabled = useSettingsStore((s) => s.terminal.attentionEnabled)
  const tileCreationAvailability = useSettingsStore((s) => s.tiles.creationAvailability)

  // Canvas state
  const tiles = useCanvasStore((s) => s.tiles)
  const viewport = useCanvasStore((s) => s.viewport)
  const nextZIndex = useCanvasStore((s) => s.nextZIndex)
  const focusedTileId = useCanvasStore((s) => s.focusedTileId)
  const selectedTileIds = useCanvasStore((s) => s.selectedTileIds)
  const viewMode = useCanvasStore((s) => s.viewMode)
  const fullviewActiveTileId = useCanvasStore((s) => s.fullviewActiveTileId)
  const boardVisible = useCanvasStore((s) => s.boardVisible)
  const splitViewState = useCanvasStore((s) => s.splitViewState)
  const gridViewState = useCanvasStore((s) => s.gridViewState)
  const terminalTitles = useCanvasStore((s) => s.terminalTitles)
  const terminalAttention = useCanvasStore((s) => s.terminalAttention)
  const activeWorkspaceId = useCanvasStore((s) => s.activeWorkspaceId)
  const activeWorkspaceName = useCanvasStore((s) => s.activeWorkspaceName)
  const activeWorkspaceConfig = useCanvasStore((s) => s.activeWorkspaceConfig)
  const availableProfiles = useCanvasStore((s) => s.availableProfiles)
  const setViewport = useCanvasStore((s) => s.setViewport)
  const restoreState = useCanvasStore((s) => s.restoreState)
  const updateTile = useCanvasStore((s) => s.updateTile)
  const focusTile = useCanvasStore((s) => s.focusTile)
  const selectTiles = useCanvasStore((s) => s.selectTiles)
  const setWorkspace = useCanvasStore((s) => s.setWorkspace)
  const restoreWorkspaceState = useCanvasStore((s) => s.restoreWorkspaceState)
  const restoreGridWorkspaceState = useCanvasStore((s) => s.restoreGridWorkspaceState)
  const setProfiles = useCanvasStore((s) => s.setProfiles)
  const detachTileToFloating = useCanvasStore((s) => s.detachTileToFloating)
  const attachFloatingTile = useCanvasStore((s) => s.attachFloatingTile)
  const setViewMode = useCanvasStore((s) => s.setViewMode)
  const setFullviewActiveTileId = useCanvasStore((s) => s.setFullviewActiveTileId)
  const setBoardVisible = useCanvasStore((s) => s.setBoardVisible)
  const setSplitViewState = useCanvasStore((s) => s.setSplitViewState)
  const setGridViewState = useCanvasStore((s) => s.setGridViewState)
  const setSplitPanelActiveTile = useCanvasStore((s) => s.setSplitPanelActiveTile)
  const setSplitFocusedPanel = useCanvasStore((s) => s.setSplitFocusedPanel)
  const clearTerminalTitle = useCanvasStore((s) => s.clearTerminalTitle)
  const clearAllTerminalAttention = useCanvasStore((s) => s.clearAllTerminalAttention)
  const activeWorkspaceType: WorkspaceType = activeWorkspaceConfig.type
  const [sessionActiveWorkspaceIds, setSessionActiveWorkspaceIds] = useState<Set<string>>(new Set())
  const agentsView = useAgentsView({
    workspaceId: activeWorkspaceId,
    workspaceConfig: activeWorkspaceConfig,
    agents: agentSettings,
    newSessionShortcut: newAgentSessionShortcut,
    // With no active workspace only the home screen exists, so the shortcut does nothing.
    newSessionShortcutEnabled: sessionActiveWorkspaceIds.size > 0,
  })
  // Read through a ref so activateWorkspace stays stable while sessions change;
  // a new identity would rerun the startup load and drop unsaved tiles.
  const agentSessionSnapshotRef = useRef(agentsView.snapshot)
  agentSessionSnapshotRef.current = agentsView.snapshot

  useEffect(() => {
    let active = true
    void window.electron.agents.usageSnapshot().then((snapshot) => {
      if (active) setAgentUsage(snapshot)
    }).catch(() => {
      if (active) setAgentUsage(null)
    })
    return window.electron.agents.onUsageChanged((snapshot) => {
      if (active) setAgentUsage(snapshot)
    })
  }, [activeWorkspaceConfig.agentProvider])
  const attachedTiles = useMemo(() => getAttachedTiles(tiles), [tiles])
  const shouldKeepSidebarOpen = shouldKeepSidebarOpenForWorkspace(attachedTiles)
  const sortedAttachedTiles = useMemo(
    () => attachedTiles.slice().sort((a, b) => b.zIndex - a.zIndex),
    [attachedTiles],
  )

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

  const closeAgentsSession = useCallback(async (session: AgentActiveSession): Promise<void> => {
    // Closing kills the agent process, so ask first unless it already finished.
    if (session.status === 'working' || session.status === 'needs-input') {
      const confirmed = await requestConfirm({
        title: t('agentsView.closeActiveSessionTitle'),
        message: session.status === 'working'
          ? t('agentsView.closeWorkingSessionMessage')
          : t('agentsView.closeNeedsInputSessionMessage'),
        confirmLabel: t('agentsView.closeSession'),
        cancelLabel: t('ui.keepOpen'),
        danger: true,
      })
      if (!confirmed) return
    }
    try {
      const result = await window.electron.agents.closeSession({
        workspaceId: session.workspaceId,
        tileId: session.tileId,
      })
      // The IPC close already stopped the daemon PTY; dispose the renderer runtime without issuing a second PTY destroy.
      await registry.destroy({ workspaceId: session.workspaceId, tileId: session.tileId }, false)
      if (result.worktree === 'kept') {
        void requestConfirm({
          title: t('agentsView.worktreeKeptTitle'),
          message: t('agentsView.worktreeKeptMessage', {
            path: result.worktreeRoot ?? t('agentsView.worktreePathUnavailable'),
          }),
          confirmLabel: t('common.close'),
          hideCancel: true,
        })
      }
    } catch (error) {
      void requestConfirm({
        title: t('agentsView.closeSessionErrorTitle'),
        message: error instanceof Error ? error.message : String(error),
        confirmLabel: t('common.close'),
        hideCancel: true,
      })
    }
  }, [registry, requestConfirm, t])

  const destroyTerminalRuntimeForTile = useCallback(async (target: TerminalSessionTarget): Promise<void> => {
    await destroyTerminalRuntime(registry, target, true, window.electron.terminal.destroyCurrent)
  }, [registry])

  const { addTerminal, addRemoteTerminal, duplicateTerminalTile, addNote, addBrowser, addTimer, deleteTile: deleteCanvasTile, resetZoom } = useCanvasActions({
    requestConfirm,
    destroyTerminalRuntime: destroyTerminalRuntimeForTile,
  })

  // UI state
  const [showProfilePicker, setShowProfilePicker] = useState(false)
  const [showNotePicker, setShowNotePicker] = useState(false)
  const [remoteSshAvailable, setRemoteSshAvailable] = useState(false)
  const [showWorkspaceManager, setShowWorkspaceManager] = useState(false)
  const [workspaceMetadata, setWorkspaceMetadata] = useState<WorkspaceMetadata[]>([])
  const [pendingWorkspaceDeactivationIds, setPendingWorkspaceDeactivationIds] = useState<Set<string>>(new Set())
  const [boardState, setBoardState] = useState<BoardState>(EMPTY_BOARD_STATE)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>('appearance')
  const [showJsonEditor, setShowJsonEditor] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [homeOpen, setHomeOpen] = useState(true)
  const [activeSectionExpanded, setActiveSectionExpanded] = useState(true)
  const [inactiveSectionExpanded, setInactiveSectionExpanded] = useState(true)
  const [expandedActiveWorkspaceIds, setExpandedActiveWorkspaceIds] = useState<Set<string>>(new Set())
  const [agentsMaximizedSessionId, setAgentsMaximizedSessionId] = useState<string | null>(null)
  // A maximized agent session hides the sidebar without changing its saved state.
  const agentSessionMaximized = agentsMaximizedSessionId !== null && agentsView.isOpen && !activityOpen
  const sidebarHidden = sidebarCollapsed || agentSessionMaximized
  const toggleSidebar = useCallback(() => {
    if (agentSessionMaximized) {
      setAgentsMaximizedSessionId(null)
      setSidebarCollapsed(false)
      return
    }
    setSidebarCollapsed((collapsed) => !collapsed)
  }, [agentSessionMaximized])
  const [pendingAgentSession, setPendingAgentSession] = useState<{ workspaceId: string; tileId: string } | null>(null)
  const pendingAgentSessionSourceRef = useRef('')
  useEffect(() => {
    if (agentsView.sessionDialogOpen) setActivityOpen(false)
    if (activityOpen || agentsView.isOpen || agentsView.sessionDialogOpen) setHomeOpen(false)
  }, [activityOpen, agentsView.isOpen, agentsView.sessionDialogOpen])
  useEffect(() => {
    if (!pendingAgentSession) return
    if (activeWorkspaceId === pendingAgentSession.workspaceId) {
      if (agentsView.effectiveProvider) agentsView.openForSession(pendingAgentSession.tileId)
      pendingAgentSessionSourceRef.current = ''
      setPendingAgentSession(null)
      return
    }
    if (activeWorkspaceId !== pendingAgentSessionSourceRef.current) {
      pendingAgentSessionSourceRef.current = ''
      setPendingAgentSession(null)
    }
  }, [activeWorkspaceId, agentsView.effectiveProvider, agentsView.openForSession, pendingAgentSession])
  const sidebarBeforeActivityRef = useRef(false)
  const previousActivityOpenRef = useRef(false)
  const [workspaceEditor, setWorkspaceEditor] = useState<WorkspaceEditorState>(null)
  const [tileEditor, setTileEditor] = useState<TileEditorState>(null)
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null)
  const [tileRefreshKeys, setTileRefreshKeys] = useState<Record<string, number>>({})
  const [tileMenu, setTileMenu] = useState<{ tileId: string; x: number; y: number } | null>(null)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const workspaceTransitionRef = useRef(0)
  const previousSidebarWorkspaceIdRef = useRef(activeWorkspaceId)
  const floatingRestoreRef = useRef<{ workspaceId: string | null; detachedTileIds: Set<string> }>({
    workspaceId: null,
    detachedTileIds: new Set(),
  })
  const skipNextAutosaveRef = useRef(false)
  const prevZoomRef = useRef(1)
  const footerRef = useRef<HTMLDivElement | null>(null)
  const fileTileOpenRequestsRef = useRef(createFileTileOpenRequestTracker())

  useEffect(() => {
    const wasOpen = previousActivityOpenRef.current
    if (activityOpen && !wasOpen) sidebarBeforeActivityRef.current = sidebarCollapsed
    const resolved = resolveSidebarCollapsedForActivity(wasOpen, activityOpen, sidebarCollapsed, sidebarBeforeActivityRef.current)
    previousActivityOpenRef.current = activityOpen
    if (resolved.collapsed !== sidebarCollapsed) setSidebarCollapsed(resolved.collapsed)
  }, [activityOpen])

  const deleteTile = useCallback(async (tileId: string): Promise<boolean> => {
    const isGridWorkspace = useCanvasStore.getState().activeWorkspaceConfig.type === 'grid'
    const deleted = await deleteCanvasTile(tileId)
    if (!deleted || !isGridWorkspace) return deleted

    setTileRefreshKeys((current) => refreshGridTileContent(current, useCanvasStore.getState().tiles))
    return true
  }, [deleteCanvasTile])

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

  useEffect(() => {
    if (terminalAttentionEnabled) return
    clearAllTerminalAttention()
  }, [clearAllTerminalAttention, terminalAttentionEnabled])

  useEffect(() => {
    const previousWorkspaceId = previousSidebarWorkspaceIdRef.current
    previousSidebarWorkspaceIdRef.current = activeWorkspaceId
    setSidebarCollapsed((currentCollapsed) => resolveSidebarCollapsedAfterWorkspaceViewChange(
      currentCollapsed,
      previousWorkspaceId,
      activeWorkspaceId,
      viewMode,
      shouldKeepSidebarOpen,
    ))
  }, [activeWorkspaceId, shouldKeepSidebarOpen, viewMode])

  useEffect(() => {
    void initializeUpdates()
  }, [initializeUpdates])

  const agentTitles = useMemo(
    () => getAgentSessionTitles(agentsView.snapshot.sessions, activeWorkspaceId),
    [activeWorkspaceId, agentsView.snapshot.sessions],
  )
  const agentsViewTitleSession = useMemo(() => {
    if (activityOpen || !agentsView.isOpen) return undefined
    const sessions = agentsView.sessions
    const session = sessions.find((candidate) => candidate.tileId === agentsView.focusedSessionId)
      ?? (sessions.length === 1 ? sessions[0] : undefined)
    return session ? { tileId: session.tileId, title: session.title } : null
  }, [activityOpen, agentsView.focusedSessionId, agentsView.isOpen, agentsView.sessions])

  const focusedAgentTileId = useMemo(() => {
    if (activityOpen) return null
    if (agentsViewTitleSession !== undefined) return agentsViewTitleSession?.tileId ?? null
    return getVisibleActiveTileId({ tiles, viewMode, focusedTileId, fullviewActiveTileId, splitViewState })
  }, [activityOpen, agentsViewTitleSession, focusedTileId, fullviewActiveTileId, splitViewState, tiles, viewMode])

  const windowTitle = useMemo(() => getActiveWindowTitle({
    tiles,
    terminalTitles,
    activeWorkspaceName,
    viewMode,
    focusedTileId,
    fullviewActiveTileId,
    splitViewState,
    agentsViewSession: agentsViewTitleSession,
  }), [activeWorkspaceName, agentsViewTitleSession, focusedTileId, fullviewActiveTileId, splitViewState, terminalTitles, tiles, viewMode])

  useEffect(() => {
    void window.electron.window.setTitle(windowTitle)
  }, [windowTitle])

  const currentCanvasState = useMemo(
    () => createCanvasSnapshot({
      tiles,
      viewport,
      nextZIndex,
      focusedTileId,
      viewMode,
      fullviewActiveTileId,
      boardVisible,
      splitViewState,
    }),
    [tiles, viewport, nextZIndex, focusedTileId, viewMode, fullviewActiveTileId, boardVisible, splitViewState],
  )
  const currentGridState = useMemo(
    () => createGridSnapshot({
      tiles,
      nextZIndex,
      focusedTileId,
      viewMode,
      fullviewActiveTileId,
      boardVisible,
      gridViewState,
      splitViewState,
    }),
    [tiles, nextZIndex, focusedTileId, viewMode, fullviewActiveTileId, boardVisible, gridViewState, splitViewState],
  )

  const refreshWorkspaceMetadata = useCallback(async (): Promise<WorkspaceMetadata[]> => {
    const list = await window.electron.workspace.list()
    setWorkspaceMetadata(list)
    return list
  }, [])

  const saveToDisk = useCallback(
    async (workspaceId: string, workspaceType: WorkspaceType = useCanvasStore.getState().activeWorkspaceConfig.type) => {
      const stateSnapshot = useCanvasStore.getState()
      const state = workspaceType === 'grid'
        ? createGridSnapshot(stateSnapshot)
        : createCanvasSnapshot(stateSnapshot)

      await window.electron.canvas.save(workspaceId, state, workspaceType)
    },
    [],
  )

  const markWorkspaceSessionActive = useCallback((workspaceId: string) => {
    setSessionActiveWorkspaceIds((current) => {
      if (current.has(workspaceId)) return current

      const next = new Set(current)
      next.add(workspaceId)
      return next
    })
  }, [])

  const unmarkWorkspaceSessionActive = useCallback((workspaceId: string) => {
    setSessionActiveWorkspaceIds((current) => {
      if (!current.has(workspaceId)) return current

      const next = new Set(current)
      next.delete(workspaceId)
      return next
    })
  }, [])

  const pruneSessionActiveWorkspaceIds = useCallback((workspaceIds: readonly string[]) => {
    const remainingWorkspaceIds = new Set(workspaceIds)
    setSessionActiveWorkspaceIds((current) => {
      let changed = false
      const next = new Set<string>()

      for (const workspaceId of current) {
        if (remainingWorkspaceIds.has(workspaceId)) {
          next.add(workspaceId)
        } else {
          changed = true
        }
      }

      return changed ? next : current
    })
  }, [])

  useEffect(() => window.electron.window.onClosePreparationRequest(async ({ phase }) => {
    if (phase === 'flush') {
      await windowBufferRegistry.flush()
      return
    }

    await windowBufferRegistry.flush()
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    const state = useCanvasStore.getState()
    if (state.activeWorkspaceId) {
      await saveToDisk(state.activeWorkspaceId, state.activeWorkspaceConfig.type)
    }
  }), [saveToDisk])

  const activateWorkspace = useCallback(async (
    workspace: Pick<Workspace, 'id' | 'name' | 'config'> | null,
    options?: WorkspaceActivationOptions,
  ) => {
    if (!workspace) return

    setHomeOpen(false)

    const transitionId = ++workspaceTransitionRef.current

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }

    const currentState = useCanvasStore.getState()
    const currentWorkspaceId = currentState.activeWorkspaceId
    if (options?.persistCurrent !== false && currentWorkspaceId && currentWorkspaceId !== workspace.id) {
      await saveToDisk(currentWorkspaceId)
    }
    if (currentWorkspaceId && currentWorkspaceId !== workspace.id) {
      const outgoingAttentionCount = sumTerminalAttentionCounts(currentState.terminalAttention)
      updateWorkspaceAttentionCount(currentWorkspaceId, outgoingAttentionCount)
      await window.electron.floating.closeWorkspace(currentWorkspaceId)
    }

    // Canvas/Grid and Board state are active-workspace-only data. Workspace list/getActive stay metadata-only.
    const workspaceType = workspace.config.type
    const [state, board] = await Promise.all([
      window.electron.canvas.load(workspace.id, workspaceType),
      window.electron.board.load(workspace.id),
    ])
    if (transitionId !== workspaceTransitionRef.current) return

    const rememberedTileId = state
      ? (state as CanvasState | GridWorkspaceState).fullviewActiveTileId
      : null

    if (options?.updateMain !== false) {
      await window.electron.workspace.setActive(workspace.id)
      if (transitionId !== workspaceTransitionRef.current) return
    }

    const restoredState = workspaceType === 'grid'
      ? normalizeGridWorkspaceState((state as GridWorkspaceState | null) ?? createEmptyGridWorkspaceState())
      : normalizeCanvasStateForJson((state as CanvasState | null) ?? createEmptyCanvasState())
    if (state && JSON.stringify(state) !== JSON.stringify(restoredState)) {
      await window.electron.canvas.save(workspace.id, restoredState, workspaceType)
      if (transitionId !== workspaceTransitionRef.current) return
    }

    skipNextAutosaveRef.current = true
    setBoardState(board)
    if (workspaceType === 'grid') {
      restoreGridWorkspaceState(workspace.id, workspace.name, workspace.config, restoredState as GridWorkspaceState)
    } else {
      restoreWorkspaceState(workspace.id, workspace.name, workspace.config, restoredState as CanvasState)
    }

    markWorkspaceSessionActive(workspace.id)
    setExpandedActiveWorkspaceIds((current) => {
      if (current.has(workspace.id)) return current

      const next = new Set(current)
      next.add(workspace.id)
      return next
    })
    const retainedAgentSessionTiles = agentSessionSnapshotRef.current.sessions
      .filter((session) => session.workspaceId === workspace.id && session.surface === 'agents-view')
      .map((session) => ({ id: session.tileId, type: 'terminal' as const }))
    // Keep non-tile sessions attached to the registry when pruning workspace tile runtimes.
    const pendingWorkspaceSessionTiles = registry.listTargets()
      .filter((target) => target.workspaceId === workspace.id
        && (target.tileId.startsWith('agent-') || target.tileId.startsWith('script-')))
      .map((target) => ({ id: target.tileId, type: 'terminal' as const }))
    await pruneWorkspaceTerminalRuntimes(registry, workspace.id, [
      ...restoredState.tiles,
      ...retainedAgentSessionTiles,
      ...pendingWorkspaceSessionTiles,
    ])
    if (transitionId !== workspaceTransitionRef.current) return

    if (options?.activationMode === 'focus-last') {
      const focusTarget = resolveWorkspaceFocusTarget(restoredState.tiles, rememberedTileId)
      if (focusTarget) {
        focusTile(focusTarget)
        selectTiles([focusTarget])
        setFullviewActiveTileId(focusTarget)
        setViewMode('fullview')
      }
    }

    clearWorkspaceAttentionCount(workspace.id)
  }, [clearWorkspaceAttentionCount, focusTile, markWorkspaceSessionActive, registry, restoreGridWorkspaceState, restoreWorkspaceState, saveToDisk, selectTiles, setFullviewActiveTileId, setViewMode, updateWorkspaceAttentionCount])

  const recordWorkspaceSelection = useCallback((workspaceId: string) => {
    void window.electron.workspace.recordSelection(workspaceId)
      .then((updatedWorkspace) => {
        if (!updatedWorkspace || updatedWorkspace.id !== workspaceId) return
        setWorkspaceMetadata((current) => mergeWorkspaceSelectionResult(current, updatedWorkspace, 'lastSelectedAt'))
      })
      .catch((error) => {
        console.error('[App] Failed to record workspace selection:', error)
      })
  }, [])

  useEffect(() => {
    return window.electron.floating.onSnapshotRequest(({ workspaceId, tileId }) => {
      const state = useCanvasStore.getState()
      if (workspaceId !== state.activeWorkspaceId) return null
      const tile = state.tiles.find((entry) => entry.id === tileId)
      if (!tile) return null

      return {
        workspaceId: state.activeWorkspaceId,
        workspaceName: state.activeWorkspaceName,
        workspaceConfig: state.activeWorkspaceConfig,
        tile,
        terminalTitle: state.terminalTitles[tileId],
      }
    })
  }, [])

  useEffect(() => {
    return window.electron.floating.onUpdateTile(({ workspaceId, tileId, patch }) => {
      if (workspaceId !== useCanvasStore.getState().activeWorkspaceId) return
      if (!patch || typeof patch !== 'object') return
      updateTile(tileId, patch as Partial<TileState>)
    })
  }, [updateTile])

  useEffect(() => {
    return window.electron.floating.onBoundsChanged(({ workspaceId, tileId, bounds }) => {
      if (workspaceId !== useCanvasStore.getState().activeWorkspaceId) return
      const tile = useCanvasStore.getState().tiles.find((entry) => entry.id === tileId)
      if (!tile || !isTileDetached(tile)) return
      updateTile(tileId, {
        floating: {
          detached: true,
          bounds,
          gridPlacement: tile.floating?.gridPlacement,
        },
      })
    })
  }, [updateTile])

  useEffect(() => {
    return window.electron.floating.onAttachRequested(({ workspaceId, tileId }) => {
      if (workspaceId !== useCanvasStore.getState().activeWorkspaceId) return
      attachFloatingTile(tileId)
    })
  }, [attachFloatingTile])

  useEffect(() => {
    if (!activeWorkspaceId) return
    const previous = floatingRestoreRef.current
    const openRequests = selectFloatingTileWindowOpenRequests({
      previousWorkspaceId: previous.workspaceId,
      previousDetachedTileIds: previous.detachedTileIds,
      workspaceId: activeWorkspaceId,
      tiles,
    })
    floatingRestoreRef.current = {
      workspaceId: activeWorkspaceId,
      detachedTileIds: new Set(tiles.filter(isTileDetached).map((tile) => tile.id)),
    }

    for (const request of openRequests) {
      void window.electron.floating.open(activeWorkspaceId, request.tileId, request.bounds)
    }
  }, [activeWorkspaceId, tiles])

  // Load workspaces on mount
  useEffect(() => {
    console.log('[App] Loading workspaces and shell profiles...')
    refreshWorkspaceMetadata().then((list) => {
      console.log('[App] Workspaces:', list)

      skipNextAutosaveRef.current = true
      setWorkspace('', '', {
        type: 'canvas',
        workspacePanelOpen: true,
        sourceControlViewMode: 'list',
        sourceControlRepositoryPaths: [],
        agentProviders: createDefaultAgentProvidersConfig(),
      })
      restoreState(createEmptyCanvasState())
      setBoardState(EMPTY_BOARD_STATE)
      setHomeOpen(true)

      if (list.length > 0) return

      const dialogCopy = startupFirstWorkspaceDialogCopyRef.current
      setWorkspaceEditor({
        mode: 'create',
        request: {
          title: dialogCopy.title,
          eyebrow: dialogCopy.eyebrow,
          confirmLabel: dialogCopy.confirmLabel,
          canCancel: false,
          typeEditable: true,
          value: {
            name: '',
            type: 'canvas',
            rootFolderPath: '',
            initialCommand: '',
            customScripts: [],
            terminalHistoryEnabled: true,
            remoteTerminal: { host: '', user: '' },
            agentProvider: undefined,
            agentProviders: createDefaultAgentProvidersConfig(),
            sourceControlRepositoryPaths: [],
          },
        },
      })
    }).catch((err) => console.error('[App] Error loading workspaces:', err))
    window.electron.shellProfiles.list().then((profiles) => {
      console.log('[App] Shell profiles:', profiles)
      setProfiles(profiles.map((p) => ({ id: p.id, label: p.label, available: p.available })))
    }).catch((err) => console.error('[App] Error loading shell profiles:', err))
    window.electron.terminal.sshAvailable().then(setRemoteSshAvailable)
      .catch((err) => console.error('[App] Error checking SSH client:', err))
  }, [refreshWorkspaceMetadata, restoreState, setProfiles, setWorkspace])

  const switchWorkspace = useCallback(
    (workspace: WorkspaceMetadata) => {
      setHomeOpen(false)
      recordWorkspaceSelection(workspace.id)
      if (workspace.id === activeWorkspaceId) return

      void activateWorkspace(workspace)
    },
    [activeWorkspaceId, activateWorkspace, recordWorkspaceSelection],
  )

  const switchWorkspaceType = useCallback(async (nextType: WorkspaceType, nextViewMode?: ViewMode) => {
    const state = useCanvasStore.getState()
    const workspaceId = state.activeWorkspaceId
    const currentType = state.activeWorkspaceConfig.type
    if (!workspaceId || currentType === nextType) return

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }

    const sharedTiles = state.tiles.map((tile) => ({ ...tile }))
    await saveToDisk(workspaceId, currentType)
    const targetRawState = await window.electron.canvas.load(workspaceId, nextType)
    const updatedWorkspace = await window.electron.workspace.setType(workspaceId, nextType)
    if (!updatedWorkspace) return

    const restoredConfig = updatedWorkspace.config
    setWorkspaceMetadata((current) => current.map((workspace) => (
      workspace.id === updatedWorkspace.id
        ? { ...workspace, name: updatedWorkspace.name, config: updatedWorkspace.config }
        : workspace
    )))
    skipNextAutosaveRef.current = true

    if (nextType === 'grid') {
      const nextState = reconcileGridStateWithSharedTiles(targetRawState as GridWorkspaceState | null, sharedTiles, state.boardVisible)
      const restoredState: GridWorkspaceState = {
        ...nextState,
        viewMode: nextViewMode === 'fullview' ? 'fullview' : 'gridview',
      }
      restoreGridWorkspaceState(workspaceId, updatedWorkspace.name, restoredConfig, restoredState)
      await window.electron.canvas.save(workspaceId, restoredState, nextType)
      return
    }

    const nextState = reconcileCanvasStateWithSharedTiles(targetRawState as CanvasState | null, sharedTiles, state.boardVisible)
    const restoredState: CanvasState = {
      ...nextState,
      viewMode: nextViewMode === 'fullview' || nextViewMode === 'splitview' || nextViewMode === 'board'
        ? nextViewMode
        : 'canvas',
    }
    restoreWorkspaceState(workspaceId, updatedWorkspace.name, restoredConfig, restoredState)
    await window.electron.canvas.save(workspaceId, restoredState, nextType)
  }, [restoreGridWorkspaceState, restoreWorkspaceState, saveToDisk])

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
  }, [tiles, viewport, nextZIndex, viewMode, fullviewActiveTileId, splitViewState, gridViewState, activeWorkspaceId, scheduleSave])

  useEffect(() => {
    if (!showProfilePicker && !showNotePicker) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!footerRef.current?.contains(event.target as Node)) {
        setShowProfilePicker(false)
        setShowNotePicker(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [showNotePicker, showProfilePicker])

  // Keyboard shortcuts (extracted hook)
  useKeyboardShortcuts({
    tiles: attachedTiles,
    focusedTileId,
    selectedTileIds,
    viewMode,
    fullviewActiveTileId,
    splitViewState,
    focusTile,
    selectTiles,
    setFullviewActiveTileId,
    setSplitViewState,
    activityOpen: activityOpen || homeOpen,
    agentsViewOpen: agentsView.isOpen,
    onCloseAgentsView: agentsView.close,
    onClosePicker: () => {
      setShowProfilePicker(false)
      setShowWorkspaceManager(false)
      setShowSettings(false)
      setTileMenu(null)
      setTileEditor(null)
      setHomeOpen(false)
      closeActiveDialog()
    },
  })

  // Default profile
  const defaultProfile = availableProfiles.find((p) => p.id === 'bash') ??
    availableProfiles.find((p) => p.id === 'zsh') ??
    availableProfiles.find((p) => p.available)
  const sidebarWorkspaces = useMemo(
    () => getWorkspaceSidebarOrder(workspaceMetadata),
    [workspaceMetadata],
  )
  const activeSidebarWorkspaces = useMemo(
    () => getActiveSidebarWorkspaces(workspaceMetadata, sessionActiveWorkspaceIds),
    [sessionActiveWorkspaceIds, workspaceMetadata],
  )
  const inactiveSidebarWorkspaces = useMemo(
    () => getInactiveSidebarWorkspaces(workspaceMetadata, sessionActiveWorkspaceIds),
    [sessionActiveWorkspaceIds, workspaceMetadata],
  )
  const toggleActiveWorkspaceExpanded = useCallback((workspaceId: string) => {
    setExpandedActiveWorkspaceIds((current) => {
      const next = new Set(current)
      if (next.has(workspaceId)) next.delete(workspaceId)
      else next.add(workspaceId)
      return next
    })
  }, [])
  const previousActiveWorkspaceCountRef = useRef(activeSidebarWorkspaces.length)
  useEffect(() => {
    const hadActiveWorkspace = previousActiveWorkspaceCountRef.current > 0
    const hasActiveWorkspace = activeSidebarWorkspaces.length > 0
    if (!hasActiveWorkspace) {
      setInactiveSectionExpanded(true)
    } else if (!hadActiveWorkspace) {
      setInactiveSectionExpanded(false)
    }
    previousActiveWorkspaceCountRef.current = activeSidebarWorkspaces.length
  }, [activeSidebarWorkspaces.length])

  const agentSessionWorkspaces = useMemo(
    () => sidebarWorkspaces.filter((workspace) => (
      workspace.id === activeWorkspaceId || sessionActiveWorkspaceIds.has(workspace.id)
    )),
    [activeWorkspaceId, sessionActiveWorkspaceIds, sidebarWorkspaces],
  )

  const unloadActiveWorkspace = useCallback(async (workspaceId: string): Promise<boolean> => {
    const state = useCanvasStore.getState()
    if (state.activeWorkspaceId !== workspaceId) return false

    const transitionId = ++workspaceTransitionRef.current
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }

    await saveToDisk(workspaceId, state.activeWorkspaceConfig.type)
    if (transitionId !== workspaceTransitionRef.current
      || useCanvasStore.getState().activeWorkspaceId !== workspaceId) return false

    await window.electron.floating.closeWorkspace(workspaceId)
    if (transitionId !== workspaceTransitionRef.current
      || useCanvasStore.getState().activeWorkspaceId !== workspaceId) return false

    floatingRestoreRef.current = { workspaceId: null, detachedTileIds: new Set() }
    skipNextAutosaveRef.current = true
    setBoardState(EMPTY_BOARD_STATE)
    setWorkspace('', '', {
      type: 'canvas',
      workspacePanelOpen: true,
      sourceControlViewMode: 'list',
      sourceControlRepositoryPaths: [],
      agentProviders: createDefaultAgentProvidersConfig(),
    })
    restoreState(createEmptyCanvasState())
    agentsView.close()
    agentsView.closeSessionDialog()
    setActivityOpen(false)
    setShowProfilePicker(false)
    setShowNotePicker(false)
    setAgentsMaximizedSessionId(null)
    setHomeOpen(true)
    return true
  }, [agentsView.close, agentsView.closeSessionDialog, restoreState, saveToDisk, setWorkspace])

  const deactivateWorkspace = useCallback(async (workspace: WorkspaceMetadata) => {
    if (pendingWorkspaceDeactivationIds.has(workspace.id)) return

    try {
      const confirmed = await requestConfirm({
        title: t('workspace.deactivateConfirmTitle', { name: workspace.name }),
        message: t('workspace.deactivateConfirmMessage'),
        confirmLabel: t('workspace.deactivateConfirm'),
        warning: t('workspace.deactivateWarning'),
        danger: true,
      })
      if (!confirmed) return

      setPendingWorkspaceDeactivationIds((current) => new Set(current).add(workspace.id))

      if (useCanvasStore.getState().activeWorkspaceId === workspace.id) {
        const nextWorkspace = activeSidebarWorkspaces
          .filter((entry) => entry.id !== workspace.id)
          .slice(-1)[0]

        if (nextWorkspace) {
          recordWorkspaceSelection(nextWorkspace.id)
          await activateWorkspace(nextWorkspace)
        } else {
          const unloaded = await unloadActiveWorkspace(workspace.id)
          if (!unloaded && useCanvasStore.getState().activeWorkspaceId === workspace.id) return
        }
      }

      if (useCanvasStore.getState().activeWorkspaceId === workspace.id) return

      await registry.destroyWorkspace(workspace.id)
      await window.electron.terminal.closeWorkspace(workspace.id)
      unmarkWorkspaceSessionActive(workspace.id)
      clearWorkspaceAttentionCount(workspace.id)
    } catch (error) {
      console.error('[App] Failed to deactivate workspace:', error)
    } finally {
      setPendingWorkspaceDeactivationIds((current) => {
        if (!current.has(workspace.id)) return current

        const next = new Set(current)
        next.delete(workspace.id)
        return next
      })
    }
  }, [activeSidebarWorkspaces, activateWorkspace, clearWorkspaceAttentionCount, pendingWorkspaceDeactivationIds, recordWorkspaceSelection, registry, requestConfirm, t, unloadActiveWorkspace, unmarkWorkspaceSessionActive])
  const terminalAttentionCounts = useMemo(() => {
    if (!terminalAttentionEnabled) return {}

    return Object.fromEntries(
      Object.entries(terminalAttention).map(([tileId, entry]) => [tileId, entry.count]),
    )
  }, [terminalAttention, terminalAttentionEnabled])
  const activeWorkspaceAttentionCount = useMemo(() => {
    if (!terminalAttentionEnabled) return 0
    return sumTerminalAttentionCounts(terminalAttention)
  }, [terminalAttention, terminalAttentionEnabled])

  const liveWorkspaceTerminalCounts = useWorkspaceTerminalCounts(registry)
  const workspaceTerminalCounts = useMemo(() => {
    if (!activeWorkspaceId) return liveWorkspaceTerminalCounts
    return {
      ...liveWorkspaceTerminalCounts,
      [activeWorkspaceId]: tiles.filter((tile) => tile.type === 'terminal').length,
    }
  }, [liveWorkspaceTerminalCounts, activeWorkspaceId, tiles])
  const activeWorkspaceAttentionByTile = useMemo(() => (
    Object.fromEntries(
      Object.entries(terminalAttention).map(([tileId, entry]) => [tileId, entry.count]),
    )
  ), [terminalAttention])
  const activityCards = useMemo(() => buildWorkspaceActivityCards({
    workspaces: workspaceMetadata,
    sessionActiveIds: sessionActiveWorkspaceIds,
    attentionCounts: workspaceAttentionCounts,
    terminalCounts: workspaceTerminalCounts,
    activeWorkspaceId,
    activeWorkspaceAttentionByTile,
    recentOutputCounts,
    processActivity: terminalProcessActivity.terminals,
  }), [
    workspaceMetadata,
    sessionActiveWorkspaceIds,
    workspaceAttentionCounts,
    workspaceTerminalCounts,
    activeWorkspaceId,
    activeWorkspaceAttentionByTile,
    recentOutputCounts,
    terminalProcessActivity.terminals,
  ])

  useEffect(() => {
    if (!terminalAttentionEnabled) {
      clearAllWorkspaceAttentionCounts()
      return
    }

    updateWorkspaceAttentionCount(activeWorkspaceId, activeWorkspaceAttentionCount)
  }, [activeWorkspaceAttentionCount, activeWorkspaceId, clearAllWorkspaceAttentionCounts, terminalAttentionEnabled, updateWorkspaceAttentionCount])

  const canCreateNote = tileCreationAvailability.note
  const canCreateBrowser = tileCreationAvailability.browser
  const canCreateTimer = tileCreationAvailability.timer
  const remoteTerminalConfigured = Boolean(activeWorkspaceConfig.remoteTerminal)
  const canCreateRemoteTerminal = remoteTerminalConfigured && remoteSshAvailable
  const boardEnabled = boardState.enabled
  const boardReviewCount = useMemo(() => getBoardReviewCount(boardState), [boardState])
  const boardReviewLabel = boardReviewCount > 0 ? (boardReviewCount > 9 ? '9+' : String(boardReviewCount)) : null
  const workspaceRootPath = activeWorkspaceConfig.rootFolderPath?.trim() ?? ''
  const hasWorkspacePanel = Boolean(workspaceRootPath)
  const closeBoard = useCallback(() => {
    setBoardVisible(false)
    setViewMode(activeWorkspaceType === 'grid' ? 'gridview' : 'fullview')
  }, [activeWorkspaceType, setBoardVisible, setViewMode])
  const openBoard = useCallback(() => {
    setBoardVisible(true)
    setViewMode('board')
  }, [setBoardVisible, setViewMode])
  const activeFilePath = useMemo(() => {
    const activeTileId = viewMode === 'fullview'
      ? fullviewActiveTileId
      : viewMode === 'splitview'
        ? splitViewState.focusedPanel === 'left'
          ? splitViewState.activeLeftTileId
          : splitViewState.activeRightTileId
        : focusedTileId
    const activeTile = activeTileId ? tiles.find((tile) => tile.id === activeTileId) : null
    return activeTile?.type === 'files' ? activeTile.filePath ?? null : null
  }, [focusedTileId, fullviewActiveTileId, splitViewState, tiles, viewMode])

  const handleWorkspaceConfigUpdated = useCallback((updatedWorkspace: WorkspaceMetadata) => {
    setWorkspace(updatedWorkspace.id, updatedWorkspace.name, updatedWorkspace.config)
    setWorkspaceMetadata((current) => current.map((workspace) => (
      workspace.id === updatedWorkspace.id
        ? { ...workspace, name: updatedWorkspace.name, config: updatedWorkspace.config }
        : workspace
    )))
  }, [setWorkspace])

  const openSettings = useCallback((section: SettingsSectionId = 'appearance') => {
    setSettingsSection(section)
    setShowSettings(true)
  }, [])

  const openWorkspaceEditor = useCallback((workspace: WorkspaceMetadata, initialTab?: WorkspaceDialogRequest['initialTab']) => {
    setWorkspaceEditor({
      mode: 'edit',
      workspaceId: workspace.id,
      request: {
        title: t('workspace.editWorkspace'),
        eyebrow: t('workspace.workspaceSettings'),
        confirmLabel: t('workspace.saveWorkspace'),
        typeEditable: false,
        workspaceId: workspace.id,
        initialTab,
        value: {
          type: workspace.config.type,
          name: workspace.name,
          rootFolderPath: workspace.config.rootFolderPath ?? '',
          initialCommand: workspace.config.initialCommand ?? '',
          customScripts: workspace.config.customScripts ?? [],
          terminalHistoryEnabled: workspace.config.terminalHistoryEnabled !== false,
          remoteTerminal: workspace.config.remoteTerminal ?? { host: '', user: '' },
          agentProvider: workspace.config.agentProvider,
          agentProviders: workspace.config.agentProviders,
          sourceControlRepositoryPaths: workspace.config.sourceControlRepositoryPaths,
        },
      },
    })
  }, [t])

  const openActiveWorkspaceEditor = useCallback((initialTab?: WorkspaceDialogRequest['initialTab']) => {
    if (!activeWorkspaceId) return
    const workspace = workspaceMetadata.find((entry) => entry.id === activeWorkspaceId)
    if (workspace) openWorkspaceEditor(workspace, initialTab)
  }, [activeWorkspaceId, openWorkspaceEditor, workspaceMetadata])

  const toggleWorkspacePanel = useCallback(() => {
    if (!activeWorkspaceId || !hasWorkspacePanel) return

    void window.electron.workspace.update(activeWorkspaceId, {
      config: { workspacePanelOpen: !activeWorkspaceConfig.workspacePanelOpen },
    }).then((updatedWorkspace) => {
      if (!updatedWorkspace) return
      handleWorkspaceConfigUpdated(updatedWorkspace)
    })
  }, [activeWorkspaceConfig.workspacePanelOpen, activeWorkspaceId, handleWorkspaceConfigUpdated, hasWorkspacePanel])

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

  const activateSplitTile = useCallback((panel: SplitPanelId, tileId: string) => {
    focusTile(tileId)
    selectTiles([tileId])
    setSplitPanelActiveTile(panel, tileId)
    setFullviewActiveTileId(tileId)
  }, [focusTile, selectTiles, setFullviewActiveTileId, setSplitPanelActiveTile])

  const makeOpenedFileVisible = useCallback((tileId: string) => {
    const state = useCanvasStore.getState()
    const tile = state.tiles.find((entry) => entry.id === tileId)
    if (!tile) return

    state.focusTile(tileId)
    state.selectTiles([tileId])
    state.bringToFront(tileId)
    state.setFullviewActiveTileId(tileId)

    if (isTileDetached(tile)) {
      void window.electron.floating.focus(tileId)
      return
    }

    const workspaceType = state.activeWorkspaceConfig.type
    const currentMode = state.viewMode
    if (currentMode === 'fullview') return

    if (workspaceType === 'grid' && currentMode !== 'splitview') {
      if (currentMode === 'board') state.setViewMode('gridview')
      return
    }

    if (currentMode === 'splitview') {
      const split = state.splitViewState
      if (split.leftTileIds.includes(tileId)) {
        state.setSplitFocusedPanel('left')
        state.setSplitPanelActiveTile('left', tileId)
      } else if (split.rightTileIds.includes(tileId)) {
        state.setSplitFocusedPanel('right')
        state.setSplitPanelActiveTile('right', tileId)
      } else {
        const panel = split.focusedPanel
        state.setSplitViewState(panel === 'left'
          ? { ...split, leftTileIds: [...split.leftTileIds, tileId], activeLeftTileId: tileId }
          : { ...split, rightTileIds: [...split.rightTileIds, tileId], activeRightTileId: tileId })
      }
      return
    }

    if (currentMode === 'board') state.setViewMode('canvas')
    requestAnimationFrame(() => {
      requestAnimationFrame(() => getCanvasMethods()?.centerViewOnTile(tileId))
    })
  }, [])

  const openFileTile = useCallback(async (relativePath: string, options: FileTileOpenOptions = {}) => {
    const path = relativePath.trim()
    if (!workspaceRootPath || !path) throw new Error('A workspace file path is required')

    const initialState = useCanvasStore.getState()
    const request = fileTileOpenRequestsRef.current.begin(
      initialState.activeWorkspaceId,
      workspaceRootPath,
    )
    const size = getDefaultTileSize('files')
    const focusedTile = initialState.tiles.find((tile) => tile.id === initialState.focusedTileId)
    const position = focusedTile
      ? { x: focusedTile.x + focusedTile.width + 40, y: focusedTile.y }
      : {
          x: (-initialState.viewport.tx + 200) / initialState.viewport.zoom,
          y: (-initialState.viewport.ty + 150) / initialState.viewport.zoom,
        }
    const proposed: TileState = {
      id: `tile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'files',
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
      zIndex: initialState.nextZIndex,
      label: options.diff
        ? `${deriveFileTileTitle(path)} (${t(options.diff.staged ? 'files.diffStaged' : 'files.diffWorkingTree')})`
        : deriveFileTileTitle(path),
      filePath: path,
      filePreview: true,
      ...(options.diff ? { fileDiff: options.diff } : {}),
      ...(options.markdownView ? { fileMarkdownView: options.markdownView } : {}),
      ...(options.reveal ? { fileRevealRequest: { ...options.reveal, id: `${Date.now()}-${Math.random()}` } } : {}),
    }

    const initialPlan = planFileTileOpen(initialState.tiles, proposed)
    if (initialPlan.kind === 'focus-existing') {
      if (options.reveal) initialState.updateTile(initialPlan.tileId, { fileRevealRequest: { ...options.reveal, id: `${Date.now()}-${Math.random()}` } })
      makeOpenedFileVisible(initialPlan.tileId)
      return
    }

    const getCurrentRequestState = () => {
      const current = useCanvasStore.getState()
      const currentRootPath = current.activeWorkspaceConfig.rootFolderPath?.trim() ?? ''
      return fileTileOpenRequestsRef.current.isCurrent(
        request,
        current.activeWorkspaceId,
        currentRootPath,
      ) ? current : null
    }
    let readResult: Awaited<ReturnType<typeof window.electron.files.read>> | null = null
    if (!options.diff && !isImageFilePath(path)) {
      try {
        readResult = await window.electron.files.read(workspaceRootPath, path)
      } catch (error) {
        if (!getCurrentRequestState()) return
        throw error
      }
    }
    const currentState = getCurrentRequestState()
    if (!currentState) return
    const initializedTile = readResult?.status === 'ready'
      ? {
          ...proposed,
          fileVersion: readResult.revision.sha256,
          fileChangeToken: readResult.revision.metadataToken,
        }
      : proposed
    const state = currentState
    const plan = planFileTileOpen(state.tiles, initializedTile)

    if (plan.kind === 'focus-existing') {
      if (options.reveal) state.updateTile(plan.tileId, { fileRevealRequest: { ...options.reveal, id: `${Date.now()}-${Math.random()}` } })
      makeOpenedFileVisible(plan.tileId)
      return
    }

    if (plan.kind === 'reuse-preview') {
      state.setTiles(state.tiles.map((tile) => tile.id === plan.tile.id ? { ...plan.tile, ...(options.reveal ? { fileRevealRequest: { ...options.reveal, id: `${Date.now()}-${Math.random()}` } } : {}) } : tile))
      makeOpenedFileVisible(plan.tile.id)
      return
    }

    if (state.activeWorkspaceConfig.type === 'grid' && state.tiles.length >= GRID_MAX_TILES) {
      throw new Error(`Grid workspaces can contain at most ${GRID_MAX_TILES} tiles.`)
    }
    state.addTile(plan.tile)
    makeOpenedFileVisible(plan.tile.id)
  }, [makeOpenedFileVisible, t, workspaceRootPath])

  useEffect(() => window.electron.floating.onNavigationRequested(({ workspaceId, kind, target, fileMarkdownView, fileReveal }) => {
    if (workspaceId !== useCanvasStore.getState().activeWorkspaceId) return
    if (kind === 'file') {
      void openFileTile(target, { markdownView: fileMarkdownView, reveal: fileReveal }).catch((error: unknown) => {
        console.error('[App] Failed to open file tile from floating navigation:', error)
      })
      return
    }
    addBrowser(target)
  }), [addBrowser, openFileTile])

  const handleSetViewMode = useCallback((mode: ViewMode) => {
    if (mode === 'board') {
      if (boardState.enabled) openBoard()
      return
    }

    const transition = resolveViewModeTransition({
      activeWorkspaceType,
      currentViewMode: viewMode,
      requestedMode: mode,
      focusedTileId,
      fullviewActiveTileId,
      tiles: attachedTiles,
      splitViewState,
    })

    if (!transition) return

    if (transition.workspaceTypeSwitch) {
      void switchWorkspaceType(transition.workspaceTypeSwitch, transition.viewMode)
      return
    }

    if (transition.fullviewActiveTileId !== undefined) {
      setFullviewActiveTileId(transition.fullviewActiveTileId)
    }

    if (transition.viewMode === 'gridview') {
      setViewMode('gridview')
      return
    }

    if (transition.viewMode === 'splitview') {
      if (attachedTiles.length < 2) return

      if (viewMode === 'splitview') {
        setSplitViewState({
          ...splitViewState,
          orientation: toggleSplitOrientation(splitViewState.orientation),
        })
        return
      }

      const activeTileId = focusedTileId && attachedTiles.some((tile) => tile.id === focusedTileId)
        ? focusedTileId
        : fullviewActiveTileId
      const nextSplitState = normalizeSplitViewForTiles(splitViewState, attachedTiles, activeTileId)
      setSplitViewState(nextSplitState)
      const nextActiveId = nextSplitState.focusedPanel === 'left'
        ? nextSplitState.activeLeftTileId
        : nextSplitState.activeRightTileId
      if (nextActiveId) {
        focusTile(nextActiveId)
        selectTiles([nextActiveId])
        setFullviewActiveTileId(nextActiveId)
      }
    }

    setViewMode(transition.viewMode)
  }, [activeWorkspaceType, attachedTiles, boardState.enabled, focusTile, focusedTileId, fullviewActiveTileId, openBoard, selectTiles, setFullviewActiveTileId, setSplitViewState, setViewMode, splitViewState, switchWorkspaceType, viewMode])

  const openTileEditor = useCallback((tile: TileState) => {
    setTileMenu(null)
    setTileEditor({
      tileId: tile.id,
      request: {
        title: t('ui.editTile', { tile: getTileTypeLabel(tile.type, t) }),
        confirmLabel: t('ui.saveTile', { tile: getTileTypeLabel(tile.type, t) }),
        tileType: tile.type,
        shellProfileId: tile.shellProfileId,
        value: {
          label: tile.label ?? '',
          startupCommand: tile.type === 'terminal' ? tile.startupCommand ?? '' : '',
          notificationsMuted: tile.notificationsMuted === true,
        },
      },
    })
  }, [t])

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

    if (tile.type === 'terminal' || tile.type === 'timer') {
      patch.notificationsMuted = value.notificationsMuted ? true : undefined
    }

    updateTile(tile.id, patch)
    setTileEditor(null)
  }, [tileEditor, tiles, updateTile])

  const toggleTileNotificationsMuted = useCallback((tile: TileState) => {
    updateTile(tile.id, { notificationsMuted: tile.notificationsMuted ? undefined : true })
  }, [updateTile])

  const openTileConfigurationMenu = useCallback((tileId: string, trigger: HTMLElement) => {
    const rect = trigger.getBoundingClientRect()
    setTileMenu({ tileId, x: rect.left, y: rect.bottom + 6 })
  }, [])

  const focusTileInFullview = useCallback((tile: TileState) => {
    setTileMenu(null)
    focusTile(tile.id)
    selectTiles([tile.id])
    setFullviewActiveTileId(tile.id)
    setViewMode('fullview')
  }, [focusTile, selectTiles, setFullviewActiveTileId, setViewMode])

  const focusAgentTile = useCallback((tileId: string) => {
    const tile = useCanvasStore.getState().tiles.find((entry) => entry.id === tileId)
    if (!tile) return
    focusTileInFullview(tile)
  }, [focusTileInFullview])

  const openActivityWorkspace = useCallback((workspace: WorkspaceMetadata) => {
    agentsView.close()
    agentsView.closeSessionDialog()
    setActivityOpen(false)
    setHomeOpen(false)
    switchWorkspace(workspace)
  }, [agentsView.close, agentsView.closeSessionDialog, switchWorkspace])

  const openAgentsViewSession = useCallback((workspaceId: string, tileId: string) => {
    setHomeOpen(false)
    agentsView.closeSessionDialog()
    if (workspaceId === activeWorkspaceId) {
      agentsView.openForSession(tileId)
      return
    }

    const workspace = sidebarWorkspaces.find((entry) => entry.id === workspaceId)
    if (!workspace) return

    pendingAgentSessionSourceRef.current = activeWorkspaceId
    setPendingAgentSession({ workspaceId, tileId })
    setActivityOpen(false)
    agentsView.close()
    switchWorkspace(workspace)
  }, [activeWorkspaceId, agentsView.close, agentsView.closeSessionDialog, agentsView.openForSession, sidebarWorkspaces, switchWorkspace])

  const handleAgentSessionCreated = useCallback((result: AgentSessionCreateResult) => {
    openAgentsViewSession(result.workspaceId, result.tileId)
  }, [openAgentsViewSession])

  const goToWorkspaceTerminal = useCallback((workspace: WorkspaceMetadata, tileId: string | null) => {
    agentsView.close()
    agentsView.closeSessionDialog()
    setActivityOpen(false)
    setHomeOpen(false)
    void (async () => {
      try {
        if (workspace.id !== useCanvasStore.getState().activeWorkspaceId) {
          recordWorkspaceSelection(workspace.id)
          await activateWorkspace(workspace)
        }
        const state = useCanvasStore.getState()
        const focusTileId = resolveActivationFocusTarget({
          tiles: state.tiles,
          requestedWorkspaceId: workspace.id,
          activeWorkspaceId: state.activeWorkspaceId,
          tileId,
        })
        if (!focusTileId) return
        const tile = state.tiles.find((entry) => entry.id === focusTileId)
        if (!tile) return
        if (isTileDetached(tile)) {
          focusTile(tile.id)
          selectTiles([tile.id])
          setFullviewActiveTileId(tile.id)
          void window.electron.floating.focus(tile.id)
          return
        }
        focusTileInFullview(tile)
      } catch (error) {
        console.error('[App] Failed to navigate to workspace terminal:', error)
      }
    })()
  }, [activateWorkspace, agentsView.close, agentsView.closeSessionDialog, focusTile, focusTileInFullview, recordWorkspaceSelection, selectTiles, setFullviewActiveTileId])

  useEffect(() => {
    return window.electron.agents.onAlert((event) => {
      const canvasState = useCanvasStore.getState()
      const tile = canvasState.tiles.find((entry) => entry.id === event.tileId)
      const decision = decideAgentAlertNotification({
        enabled: useSettingsStore.getState().notifications.desktopAlertsEnabled,
        windowFocused: document.hasFocus(),
        activeWorkspaceId: canvasState.activeWorkspaceId,
        alertWorkspaceId: event.workspaceId,
        tileMuted: tile?.type === 'terminal' && tile.notificationsMuted === true,
      })

      if (decision.sound) {
        playAgentAlertSound(event.priority === 'intervention' ? 'intervention' : 'completed')
      }
      if (!decision.toast) return

      const workspace = workspaceMetadata.find((entry) => entry.id === event.workspaceId)
      const providerLabel = t(event.provider === 'claude' ? 'agentsView.claude' : 'agentsView.codex')
      const eventLabel = t({
        completed: 'agentAlert.completed',
        input: 'agentAlert.input',
        permission: 'agentAlert.permission',
      }[event.event])
      const notificationText = buildAgentAlertNotificationText({
        providerLabel,
        workspaceName: workspace?.name ?? null,
        sessionTitle: event.sessionTitle,
        eventLabel,
      })

      void window.electron.notifications.showAgentAlert({
        ...notificationText,
        workspaceId: event.workspaceId,
        tileId: event.tileId,
        surface: event.surface,
      }).catch((error) => {
        console.error('[App] Failed to show agent alert notification:', error)
      })
    })
  }, [t, workspaceMetadata])

  useEffect(() => {
    return window.electron.notifications.onAgentAlertClicked(({ workspaceId, tileId, surface }) => {
      if (!workspaceId) return
      if (surface === 'agents-view') {
        openAgentsViewSession(workspaceId, tileId)
        return
      }
      const workspace = workspaceMetadata.find((entry) => entry.id === workspaceId)
      if (!workspace) return
      goToWorkspaceTerminal(workspace, tileId)
    })
  }, [goToWorkspaceTerminal, openAgentsViewSession, workspaceMetadata])

  const openActivityPaletteAgent = useCallback((workspace: WorkspaceMetadata, session: AgentActiveSession) => {
    if (getAgentSessionSurface(session) === 'agents-view') {
      openAgentsViewSession(workspace.id, session.tileId)
      return
    }
    goToWorkspaceTerminal(workspace, session.tileId)
  }, [goToWorkspaceTerminal, openAgentsViewSession])

  const detachTile = useCallback((tile: TileState) => {
    if (!activeWorkspaceId || isTileDetached(tile)) return
    detachTileToFloating(tile.id)
    void window.electron.floating.open(activeWorkspaceId, tile.id, tile.floating?.bounds)
  }, [activeWorkspaceId, detachTileToFloating])

  const attachTile = useCallback((tile: TileState) => {
    if (!isTileDetached(tile)) return
    attachFloatingTile(tile.id)
    void window.electron.floating.close(tile.id, false)
  }, [attachFloatingTile])

  const duplicateTileFromMenu = useCallback((tile: TileState) => {
    const duplicateId = duplicateTerminalTile(tile.id)
    if (!duplicateId) return

    if (viewMode === 'fullview') {
      setFullviewActiveTileId(duplicateId)
    }
  }, [duplicateTerminalTile, setFullviewActiveTileId, viewMode])

  const bumpTileRefreshKey = useCallback((tileId: string) => {
    setTileRefreshKeys((current) => ({
      ...current,
      [tileId]: (current[tileId] ?? 0) + 1,
    }))
  }, [])

  const requestRefreshTileConfirmation = useCallback((tile: TileState) => {
    const label = tile.label ?? getTileTypeLabel(tile.type, t)

    if (tile.type === 'terminal') {
      return requestConfirm({
        title: t('ui.refreshTerminal'),
        message: t('ui.refreshTerminalMessage', { label }),
        confirmLabel: t('common.refresh'),
        cancelLabel: t('ui.keepRunning'),
        danger: true,
      })
    }

    if (tile.type === 'browser') {
      return requestConfirm({
        title: t('ui.refreshBrowser'),
        message: t('ui.refreshBrowserMessage', { label }),
        confirmLabel: t('common.refresh'),
        cancelLabel: t('ui.keepCurrent'),
      })
    }

    if (tile.type === 'note') {
      return requestConfirm({
        title: t('ui.refreshNote'),
        message: t('ui.refreshNoteMessage', { label }),
        confirmLabel: t('common.refresh'),
        cancelLabel: t('ui.keepEditing'),
        danger: true,
      })
    }

    return requestConfirm({
      title: t('ui.refreshTile'),
      message: t('ui.refreshTileMessage', { label }),
      confirmLabel: t('common.refresh'),
      cancelLabel: t('ui.keepEditing'),
      danger: true,
    })
  }, [requestConfirm, t])

  const handleRefreshTile = useCallback(async (tile: TileState) => {
    setTileMenu(null)

    const workspaceId = activeWorkspaceId
    const terminalTarget = tile.type === 'terminal' && workspaceId
      ? { workspaceId, tileId: tile.id }
      : null
    const confirmed = await requestRefreshTileConfirmation(tile)
    if (!confirmed) return

    if (terminalTarget) {
      await destroyTerminalRuntime(registry, terminalTarget, true, window.electron.terminal.destroyCurrent)
      clearTerminalTitle(terminalTarget.tileId)
    }

    bumpTileRefreshKey(tile.id)
  }, [activeWorkspaceId, bumpTileRefreshKey, clearTerminalTitle, registry, requestRefreshTileConfirmation])

  const handleConfirmWorkspaceEditor = useCallback(async (value: WorkspaceDialogValue) => {
    if (!workspaceEditor) return

    if (workspaceEditor.mode === 'create') {
      if (activeWorkspaceId) {
        if (autosaveTimerRef.current) {
          clearTimeout(autosaveTimerRef.current)
          autosaveTimerRef.current = null
        }

        await saveToDisk(activeWorkspaceId)
      }

      const created = await window.electron.workspace.create({
        type: value.type,
        name: value.name,
        rootFolderPath: value.rootFolderPath || undefined,
        initialCommand: value.initialCommand || undefined,
        customScripts: value.customScripts ?? [],
        terminalHistoryEnabled: value.terminalHistoryEnabled,
        remoteTerminal: value.remoteTerminal,
        agentProvider: value.agentProvider,
        agentProviders: value.agentProviders,
        sourceControlRepositoryPaths: value.sourceControlRepositoryPaths,
      })
      await refreshWorkspaceMetadata()
      setWorkspaceEditor(null)
      await activateWorkspace(created, { persistCurrent: false, updateMain: false })
      return
    }

    const updated = await window.electron.workspace.update(workspaceEditor.workspaceId, {
      name: value.name,
      config: {
        rootFolderPath: value.rootFolderPath || undefined,
        initialCommand: value.initialCommand || undefined,
        customScripts: value.customScripts ?? [],
        terminalHistoryEnabled: value.terminalHistoryEnabled,
        remoteTerminal: value.remoteTerminal,
        agentProvider: value.agentProvider,
        agentProviders: value.agentProviders,
        sourceControlRepositoryPaths: value.sourceControlRepositoryPaths,
      },
    })
    if (!updated) return

    const list = await refreshWorkspaceMetadata()
    setWorkspaceEditor(null)

    if (updated.id === activeWorkspaceId) {
      setWorkspace(updated.id, updated.name, updated.config)
      const refreshed = list.find((workspace) => workspace.id === updated.id) ?? updated
      void activateWorkspace(refreshed, { persistCurrent: false, updateMain: false })
    }
  }, [activateWorkspace, activeWorkspaceId, refreshWorkspaceMetadata, saveToDisk, setWorkspace, workspaceEditor])

  const handleSaveWorkspaceManagement = useCallback(async (entries: WorkspaceManagementEntry[]) => {
    if (activeWorkspaceId) {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }

      await saveToDisk(activeWorkspaceId)
    }

    const result = await window.electron.workspace.commitManagementChanges({ workspaces: entries })

    await destroyRemovedWorkspaceRuntimes(registry, result.removedWorkspaceIds)
    pruneSessionActiveWorkspaceIds(result.workspaces.map((workspace) => workspace.id))
    setWorkspaceMetadata(result.workspaces)
    if (result.removedWorkspaceIds.length > 0) {
      pruneWorkspaceAttentionCounts(result.workspaces.map((workspace) => workspace.id))
    }
    setShowWorkspaceManager(false)

    if (!result.activeWorkspace) {
      skipNextAutosaveRef.current = true
      setWorkspace('', '', { type: 'canvas', workspacePanelOpen: true, sourceControlViewMode: 'list', sourceControlRepositoryPaths: [], agentProviders: createDefaultAgentProvidersConfig() })
      restoreState(createEmptyCanvasState())
      const dialogCopy = getWorkspaceDialogCopy('first', t)
      setWorkspaceEditor({
        mode: 'create',
        request: {
          title: dialogCopy.title,
          eyebrow: dialogCopy.eyebrow,
          confirmLabel: dialogCopy.confirmLabel,
          canCancel: false,
          typeEditable: true,
          value: {
            name: '',
            type: 'canvas',
            rootFolderPath: '',
            initialCommand: '',
            terminalHistoryEnabled: true,
            remoteTerminal: { host: '', user: '' },
            agentProvider: undefined,
            agentProviders: createDefaultAgentProvidersConfig(),
            sourceControlRepositoryPaths: [],
          },
        },
      })
      return
    }

    if (result.activeWorkspace.id === activeWorkspaceId) {
      setWorkspace(result.activeWorkspace.id, result.activeWorkspace.name, result.activeWorkspace.config)
      return
    }

    await activateWorkspace(result.activeWorkspace, { persistCurrent: false, updateMain: false })
  }, [activeWorkspaceId, activateWorkspace, pruneSessionActiveWorkspaceIds, pruneWorkspaceAttentionCounts, registry, restoreState, saveToDisk, setWorkspace, t])

  const openCreateWorkspaceDialog = useCallback(() => {
    const dialogCopy = getWorkspaceDialogCopy('new', t)
    setWorkspaceEditor({
      mode: 'create',
      request: {
        title: dialogCopy.title,
        eyebrow: dialogCopy.eyebrow,
        confirmLabel: dialogCopy.confirmLabel,
        typeEditable: true,
        value: {
          type: 'canvas',
          name: '',
          rootFolderPath: '',
          initialCommand: '',
          customScripts: [],
          terminalHistoryEnabled: true,
          remoteTerminal: { host: '', user: '' },
          agentProvider: undefined,
          agentProviders: createDefaultAgentProvidersConfig(),
          sourceControlRepositoryPaths: [],
        },
      },
    })
  }, [t])

  const openHome = useCallback(() => {
    agentsView.close()
    agentsView.closeSessionDialog()
    setActivityOpen(false)
    setShowProfilePicker(false)
    setShowNotePicker(false)
    setAgentsMaximizedSessionId(null)
    setHomeOpen(true)
  }, [agentsView.close, agentsView.closeSessionDialog])

  const selectWorkspaceFromHome = useCallback((workspace: WorkspaceMetadata) => {
    agentsView.close()
    agentsView.closeSessionDialog()
    setActivityOpen(false)
    switchWorkspace(workspace)
  }, [agentsView.close, agentsView.closeSessionDialog, switchWorkspace])

  const selectInactiveWorkspace = useCallback((workspace: WorkspaceMetadata) => {
    setInactiveSectionExpanded(false)
    selectWorkspaceFromHome(workspace)
  }, [selectWorkspaceFromHome])

  const createTerminalFromSidebar = useCallback(() => {
    if (availableProfiles.length <= 1 && defaultProfile && !remoteTerminalConfigured) {
      addTerminal(defaultProfile.id)
      setShowProfilePicker(false)
      setShowNotePicker(false)
      return
    }
    setShowNotePicker(false)
    setShowProfilePicker((v) => !v)
  }, [availableProfiles.length, defaultProfile, addTerminal, remoteTerminalConfigured])

  const handleCreateBoardTask = useCallback(async () => {
    if (!activeWorkspaceId) return
    const title = await requestPrompt({
      title: t('ui.newTask'),
      message: t('ui.captureTaskTitle'),
      confirmLabel: t('common.continue'),
      placeholder: t('ui.title'),
    })
    if (!title) return
    const task = await requestPrompt({
      title: t('ui.taskDetails'),
      message: t('ui.captureWork'),
      confirmLabel: t('ui.createTask'),
      placeholder: t('ui.task'),
    })
    if (!task) return
    const nextBoard = await window.electron.board.createUserTask(activeWorkspaceId, { title, task })
    setBoardState(nextBoard)
    openBoard()
  }, [activeWorkspaceId, openBoard, requestPrompt, t])

  const handleBoardButton = useCallback(async () => {
    if (!activeWorkspaceId) return
    setShowProfilePicker(false)
    if (!boardState.enabled) {
      const nextBoard = await window.electron.board.enable(activeWorkspaceId)
      setBoardState(nextBoard)
      openBoard()
      return
    }
    await handleCreateBoardTask()
  }, [activeWorkspaceId, boardState.enabled, handleCreateBoardTask, openBoard])

  const updateBoardTask = useCallback((taskId: string, patch: { title?: string; task?: string }) => {
    if (!activeWorkspaceId) return
    window.electron.board.updateUserTask(activeWorkspaceId, { taskId, ...patch })
      .then(setBoardState)
      .catch((error) => console.error('[board] update task failed', error))
  }, [activeWorkspaceId])

  const addBoardNote = useCallback((taskId: string, note: string) => {
    if (!activeWorkspaceId) return
    window.electron.board.addUserNote(activeWorkspaceId, { taskId, note })
      .then(setBoardState)
      .catch((error) => console.error('[board] add note failed', error))
  }, [activeWorkspaceId])

  const deleteBacklogBoardTask = useCallback(async (task: BoardTask) => {
    if (!activeWorkspaceId) return
    const confirmed = await requestConfirm({
      title: t('ui.deleteTask'),
      message: t('ui.deleteTaskMessage', { title: task.title }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('ui.keepTask'),
      danger: true,
    })
    if (!confirmed) return
    setBoardState(await window.electron.board.deleteBacklogTask(activeWorkspaceId, task.id))
  }, [activeWorkspaceId, requestConfirm, t])

  const approveReviewBoardTask = useCallback(async (task: BoardTask) => {
    if (!activeWorkspaceId) return
    setBoardState(await window.electron.board.approveReviewTask(activeWorkspaceId, task.id))
  }, [activeWorkspaceId])

  const rejectReviewBoardTask = useCallback(async (task: BoardTask) => {
    if (!activeWorkspaceId) return
    const note = await requestPrompt({
      title: t('ui.rejectTask'),
      message: t('ui.rejectTaskMessage', { title: task.title }),
      confirmLabel: t('board.reject'),
      placeholder: t('ui.requiredNote'),
      danger: true,
    })
    if (!note) return
    setBoardState(await window.electron.board.rejectReviewTask(activeWorkspaceId, { taskId: task.id, note }))
  }, [activeWorkspaceId, requestPrompt, t])

  const activeTileMenu = tileMenu ? tiles.find((tile) => tile.id === tileMenu.tileId) ?? null : null
  const tileMenuItems: MenuItem[] = activeTileMenu
    ? buildTileConfigurationMenuItems({
        tile: activeTileMenu,
        onEdit: openTileEditor,
        onDuplicate: duplicateTileFromMenu,
        onRefresh: handleRefreshTile,
        onToggleNotificationsMuted: toggleTileNotificationsMuted,
        onToggleLock: (tile) => updateTile(tile.id, { locked: !tile.locked }),
        onBeforeAction: () => setTileMenu(null),
        translate: (key) => t(key),
      })
    : []
  const sortedTiles = sortedAttachedTiles

  useEffect(() => {
    if (attachedTiles.length === 0) {
      setFullviewActiveTileId(null)
      return
    }

    if (!fullviewActiveTileId || !attachedTiles.some((tile) => tile.id === fullviewActiveTileId)) {
      const fallback = focusedTileId && attachedTiles.some((tile) => tile.id === focusedTileId)
        ? focusedTileId
        : sortedTiles[0]?.id ?? null
      setFullviewActiveTileId(fallback)
    }
  }, [attachedTiles, sortedTiles, fullviewActiveTileId, focusedTileId, viewMode, setFullviewActiveTileId, setViewMode])

  useEffect(() => {
    if (viewMode === 'board' && (!boardState.enabled || !boardVisible)) {
      setViewMode(activeWorkspaceType === 'grid' ? 'gridview' : 'fullview')
      return
    }

    if (activeWorkspaceType === 'grid' && viewMode !== 'gridview' && viewMode !== 'fullview' && viewMode !== 'board' && viewMode !== 'splitview') {
      setViewMode('gridview')
      return
    }

    if (activeWorkspaceType === 'canvas' && viewMode === 'gridview') {
      setViewMode('fullview')
    }
  }, [activeWorkspaceType, boardState.enabled, boardVisible, setViewMode, viewMode])

  useEffect(() => {
    if (viewMode !== 'splitview') return

    if (attachedTiles.length < 2) {
      const fallback = attachedTiles[0]?.id ?? null
      setFullviewActiveTileId(fallback)
      if (fallback) {
        focusTile(fallback)
        selectTiles([fallback])
        setViewMode('fullview')
      } else {
        setViewMode('canvas')
      }
      return
    }

    const normalized = normalizeSplitViewForTiles(splitViewState, sortedTiles, fullviewActiveTileId ?? focusedTileId)
    if (!areSplitViewStatesEqual(splitViewState, normalized)) {
      setSplitViewState(normalized)
    }
  }, [activeWorkspaceType, attachedTiles, focusTile, focusedTileId, fullviewActiveTileId, selectTiles, setFullviewActiveTileId, setSplitViewState, setViewMode, sortedTiles, splitViewState, viewMode])

  const closeTileFromFullview = useCallback(async (tileId: string) => {
    const ordered = attachedTiles.slice().sort((a, b) => b.zIndex - a.zIndex)
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
  }, [attachedTiles, fullviewActiveTileId, deleteTile, setFullviewActiveTileId, setViewMode])

  const closeTileFromSplitview = useCallback(async (panel: SplitPanelId, tileId: string) => {
    const panelIds = panel === 'left' ? splitViewState.leftTileIds : splitViewState.rightTileIds
    const otherPanelIds = panel === 'left' ? splitViewState.rightTileIds : splitViewState.leftTileIds
    const activeTileId = panel === 'left' ? splitViewState.activeLeftTileId : splitViewState.activeRightTileId
    const index = panelIds.indexOf(tileId)
    const fallback =
      panelIds[index + 1] ??
      panelIds[index - 1] ??
      null
    const otherFallback = panel === 'left'
      ? splitViewState.activeRightTileId ?? otherPanelIds[0] ?? null
      : splitViewState.activeLeftTileId ?? otherPanelIds[0] ?? null

    const deleted = await deleteTile(tileId)
    if (!deleted) return

    if (panelIds.length === 1) {
      setFullviewActiveTileId(otherFallback)
      if (otherFallback) {
        focusTile(otherFallback)
        selectTiles([otherFallback])
        setViewMode('fullview')
      } else {
        setViewMode('canvas')
      }
      return
    }

    if (activeTileId === tileId && fallback) {
      activateSplitTile(panel, fallback)
    }
  }, [activateSplitTile, deleteTile, focusTile, selectTiles, setFullviewActiveTileId, setViewMode, splitViewState])

  const moveTileToSplitPanel = useCallback((tileId: string, targetPanel: SplitPanelId) => {
    const sourcePanel = splitViewState.leftTileIds.includes(tileId)
      ? 'left'
      : splitViewState.rightTileIds.includes(tileId)
        ? 'right'
        : null

    if (sourcePanel === targetPanel) {
      activateSplitTile(targetPanel, tileId)
      return
    }

    const sourceIds = sourcePanel === 'left'
      ? splitViewState.leftTileIds
      : sourcePanel === 'right'
        ? splitViewState.rightTileIds
        : []
    if (sourcePanel && sourceIds.length <= 1) return

    const leftTileIds = splitViewState.leftTileIds.filter((id) => id !== tileId)
    const rightTileIds = splitViewState.rightTileIds.filter((id) => id !== tileId)
    const nextLeftIds = targetPanel === 'left' ? [...leftTileIds, tileId] : leftTileIds
    const nextRightIds = targetPanel === 'right' ? [...rightTileIds, tileId] : rightTileIds
    const sourceFallback = sourceIds.find((id) => id !== tileId) ?? null

    setSplitViewState({
      leftTileIds: nextLeftIds,
      rightTileIds: nextRightIds,
      activeLeftTileId: targetPanel === 'left'
        ? tileId
        : splitViewState.activeLeftTileId === tileId
          ? sourceFallback
          : splitViewState.activeLeftTileId,
      activeRightTileId: targetPanel === 'right'
        ? tileId
        : splitViewState.activeRightTileId === tileId
          ? sourceFallback
          : splitViewState.activeRightTileId,
      focusedPanel: targetPanel,
      orientation: splitViewState.orientation,
    })
    activateSplitTile(targetPanel, tileId)
  }, [activateSplitTile, setSplitViewState, splitViewState])

  const currentUpdateBannerKey = updateStatus === 'downloaded'
    ? `downloaded:${updateAvailableVersion ?? 'ready'}`
    : `progress:${updateAvailableVersion ?? updateStatus}`
  const showUpdateBanner =
    (updateStatus === 'available' || updateStatus === 'downloading' || updateStatus === 'downloaded') &&
    dismissedUpdateVersion !== currentUpdateBannerKey

  const updateBannerCopy = (() => {
    if (updateStatus === 'downloaded') {
      return {
        title: t('ui.updateReady', { version: updateAvailableVersion ?? '' }),
        message: t('ui.restartUpdateMessage'),
      }
    }

    if (updateStatus === 'downloading') {
      return {
        title: updateAvailableVersion
          ? t('ui.downloadingUpdate', { version: updateAvailableVersion })
          : t('ui.downloadingUpdateUnknown'),
        message: updateProgressPercent !== null
          ? t('ui.updateProgress', { percent: updateProgressPercent })
          : t('ui.downloadingUpdateMessage'),
      }
    }

    return {
      title: updateAvailableVersion
        ? t('ui.updateFound', { version: updateAvailableVersion })
        : t('ui.updateFoundUnknown'),
      message: updateMessage ?? t('update.downloading'),
    }
  })()

  const agentTileProvider = activeWorkspaceId ? agentsView.effectiveProvider : null
  const resumeHistoryInTile = tileCreationAvailability.agent && defaultProfile
    ? (item: AgentSessionHistoryItem) => {
        // Reuse the tile that already holds this conversation instead of opening it twice.
        const existing = tiles.find((tile) => tile.agent?.provider === item.provider && tile.agent.sessionId === item.identifier)
        const cwd = sanitizeAgentCwd(item.cwd)
        const tileId = existing?.id ?? addTerminal(defaultProfile.id, {
          provider: item.provider,
          sessionId: item.identifier,
          ...(cwd ? { cwd } : {}),
        })
        if (!tileId) return
        agentsView.close()
        setActivityOpen(false)
        focusAgentTile(tileId)
      }
    : undefined
  const tileCreationSelectorProps: TileCreationSelectorProps = {
    canCreateAgent: Boolean(tileCreationAvailability.agent && agentTileProvider && defaultProfile),
    canCreateNote,
    canCreateBrowser,
    canCreateTimer,
    canCreateBoard: Boolean(activeWorkspaceId),
    boardEnabled,
    boardVisible,
    onCreateTerminal: createTerminalFromSidebar,
    onCreateAgent: () => {
      if (!tileCreationAvailability.agent) return
      setShowProfilePicker(false)
      setShowNotePicker(false)
      if (!agentTileProvider || !defaultProfile) return
      // A preset Claude session ID lets the tile resume the conversation after the agent exits.
      const sessionId = agentTileProvider === 'claude' ? crypto.randomUUID() : undefined
      addTerminal(defaultProfile.id, { provider: agentTileProvider, ...(sessionId ? { sessionId } : {}) })
    },
    onCreateNote: () => {
      setShowProfilePicker(false)
      setShowNotePicker((value) => !value)
    },
    onCreateBrowser: () => {
      setShowProfilePicker(false)
      addBrowser()
    },
    onCreateTimer: () => {
      setShowProfilePicker(false)
      addTimer()
    },
    onCreateBoard: () => {
      void handleBoardButton()
    },
    onOpenBoard: openBoard,
    boardBadge: boardReviewLabel,
    boardBadgeTitle: boardReviewLabel
      ? `${boardReviewCount} board ${boardReviewCount === 1 ? 'task' : 'tasks'} waiting for review`
      : undefined,
  }
  const showWorkspaceHome = (homeOpen || !activeWorkspaceId) && !activityOpen && !agentsView.isOpen
  const workspaceHomeNow = Date.now()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg-primary text-text-primary">
      <TopBar
        hasWorkspace={Boolean(activeWorkspaceId)}
        workspaceId={activeWorkspaceId ?? undefined}
        workspaceName={activeWorkspaceName}
        workspaceConfig={activeWorkspaceConfig}
        onEditWorkspaceScripts={() => openActiveWorkspaceEditor('scripts')}
        zoom={viewport.zoom}
        viewMode={viewMode}
        splitOrientation={splitViewState.orientation}
        workspaceType={activeWorkspaceType}
        boardEnabled={boardEnabled}
        boardVisible={boardVisible}
        boardReviewCount={boardReviewCount}
        canSplitView={attachedTiles.length >= 2}
        sidebarCollapsed={sidebarHidden}
        onToggleSidebar={toggleSidebar}
        activityOpen={activityOpen}
        onToggleActivity={() => {
          agentsView.close()
          agentsView.closeSessionDialog()
          setHomeOpen(false)
          setActivityOpen((value) => !value)
        }}
        agentsViewAvailable={Boolean(activeWorkspaceId && agentsView.effectiveProvider)}
        agentsViewOpen={agentsView.isOpen}
        agentSessionCount={agentsView.sessions.length}
        agentAttentionCount={countAgentsViewAttention(agentsView.sessions)}
        onToggleAgentsView={() => {
          setHomeOpen(false)
          setActivityOpen(false)
          agentsView.closeSessionDialog()
          // The button selects the Agents view like the other view buttons and always shows every session.
          setAgentsMaximizedSessionId(null)
          if (!agentsView.isOpen) agentsView.toggle()
        }}
        agentProvider={activeWorkspaceConfig.agentProvider}
        agentUsage={agentUsage}
        hasWorkspacePanel={hasWorkspacePanel}
        workspacePanelOpen={activeWorkspaceConfig.workspacePanelOpen}
        onToggleWorkspacePanel={toggleWorkspacePanel}
        onSetViewMode={(mode) => {
          const overlayOpen = agentsView.isOpen || activityOpen
          agentsView.close()
          setHomeOpen(false)
          setActivityOpen(false)
          // Leaving Agents or Activity for the view underneath restores it as it was,
          // instead of toggling it (split orientation, canvas/grid swap).
          if (overlayOpen && mode === viewMode) return
          handleSetViewMode(mode)
        }}
        onFitToContent={() => getCanvasMethods()?.fitViewToContent()}
        onZoomToggle={handleZoomToggle}
        onOpenSettings={() => openSettings()}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Sidebar — below the native title bar */}
      <Sidebar
        collapsed={sidebarHidden}
        onToggle={toggleSidebar}
        footer={
          <div ref={footerRef} className="relative border-t border-border bg-bg-secondary px-3 py-3">
            {showProfilePicker && (
              <div className="absolute bottom-full left-4 z-[9999] mb-3 w-[260px]">
                <TileCreationMenu
                  title={t('ui.shellProfiles')}
                  items={[
                    ...availableProfiles.map((profile) => ({
                      id: profile.id,
                      icon: Terminal,
                      label: profile.label,
                      detail: profile.available ? `[ ${t('ui.ready').toUpperCase()} ]` : `[ ${t('ui.missing').toUpperCase()} ]`,
                      disabled: !profile.available,
                      onClick: () => {
                        addTerminal(profile.id)
                        setShowProfilePicker(false)
                      },
                    })),
                    {
                      id: 'remote-ssh',
                      icon: Terminal,
                      label: t('ui.remoteSsh'),
                      detail: canCreateRemoteTerminal
                        ? `[ ${t('ui.ready').toUpperCase()} ]`
                        : remoteTerminalConfigured
                          ? t('ui.opensshMissingStatus')
                          : t('ui.configureStatus'),
                      disabled: !canCreateRemoteTerminal,
                      title: !remoteTerminalConfigured
                        ? t('ui.configureRemoteTerminalFirst')
                        : !remoteSshAvailable
                          ? t('ui.opensshMissing')
                          : t('ui.createSshTerminal'),
                      onClick: () => {
                        addRemoteTerminal()
                        setShowProfilePicker(false)
                      },
                    },
                  ]}
                />
              </div>
            )}

            {showNotePicker && (
              <div className="absolute bottom-full left-4 z-[9999] mb-3 w-[260px]">
                <TileCreationMenu
                  title={t('ui.noteType')}
                  items={[
                    {
                      id: 'rich-note',
                      icon: StickyNote,
                      label: t('ui.richNote'),
                      detail: t('ui.richStatus'),
                      onClick: () => {
                        addNote('rich')
                        setShowNotePicker(false)
                      },
                    },
                    {
                      id: 'markdown-note',
                      icon: StickyNote,
                      label: t('ui.markdownNote'),
                      detail: t('ui.markdownStatus'),
                      onClick: () => {
                        addNote('markdown')
                        setShowNotePicker(false)
                      },
                    },
                  ]}
                />
              </div>
            )}

            {activeWorkspaceId && !homeOpen && (
              <TileCreationSelector {...tileCreationSelectorProps} />
            )}
          </div>
        }
      >
        <div className="flex h-full flex-col bg-bg-secondary">
          <div className="flex min-h-0 flex-1 flex-col px-3 py-4">
            <div className="mb-3 flex items-center justify-between px-2">
              <span className="nd-label text-text-secondary">{t('sidebar.workspaces')}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-display"
                  onClick={openCreateWorkspaceDialog}
                  title={t('app.newWorkspace')}
                  aria-label={t('app.newWorkspace')}
                >
                  <Plus size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-display"
                  onClick={openHome}
                  title={t('sidebar.home')}
                  aria-label={t('sidebar.home')}
                >
                  <House size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-display"
                  onClick={() => setShowWorkspaceManager(true)}
                  title={t('app.manageWorkspaces')}
                  aria-label={t('app.manageWorkspaces')}
                >
                  <SlidersHorizontal size={14} aria-hidden="true" />
                </button>
              </div>
            </div>

            {sidebarWorkspaces.length === 0 ? (
              <div className="nd-panel-raised rounded-[20px] px-5 py-8 text-center text-text-secondary">
                <div className="nd-label">{t('common.none')}</div>
                <div className="mt-3 text-sm text-text-disabled">{t('sidebar.emptyWorkspaces')}</div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <WorkspaceSidebarSection
                  title={t('sidebar.activeSection')}
                  count={activeSidebarWorkspaces.length}
                  expanded={activeSectionExpanded}
                  onToggle={() => setActiveSectionExpanded((expanded) => !expanded)}
                  className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto"
                >
                  {activeSidebarWorkspaces.length === 0 ? (
                    <div className="px-2 py-2 text-sm text-text-disabled">
                      {t('sidebar.noActiveWorkspaces')}
                    </div>
                  ) : (
                    <div className="min-h-0 flex-1 space-y-1 pr-1">
                      {activeSidebarWorkspaces.map((workspace) => (
                        <ActiveWorkspaceEntry
                          key={workspace.id}
                          workspace={workspace}
                          sessions={agentsView.snapshot.sessions}
                          expanded={expandedActiveWorkspaceIds.has(workspace.id)}
                          onToggleExpanded={() => toggleActiveWorkspaceExpanded(workspace.id)}
                          onOpenAgent={openActivityPaletteAgent}
                          focusedAgentTileId={workspace.id === activeWorkspaceId ? focusedAgentTileId : null}
                          active={workspace.id === activeWorkspaceId}
                          sessionActive={sessionActiveWorkspaceIds.has(workspace.id)}
                          onClick={() => {
                            agentsView.close()
                            agentsView.closeSessionDialog()
                            setActivityOpen(false)
                            switchWorkspace(workspace)
                          }}
                          onConfigure={() => openWorkspaceEditor(workspace)}
                          onFocus={() => {
                            agentsView.close()
                            agentsView.closeSessionDialog()
                            setActivityOpen(false)
                            recordWorkspaceSelection(workspace.id)
                            void activateWorkspace(workspace, { activationMode: 'focus-last' })
                          }}
                          onDeactivate={() => void deactivateWorkspace(workspace)}
                          deactivatePending={pendingWorkspaceDeactivationIds.has(workspace.id)}
                        />
                      ))}
                    </div>
                  )}
                </WorkspaceSidebarSection>
                <WorkspaceSidebarSection
                  title={t('sidebar.inactiveSection')}
                  count={inactiveSidebarWorkspaces.length}
                  expanded={inactiveSectionExpanded}
                  onToggle={() => setInactiveSectionExpanded((expanded) => !expanded)}
                  className="shrink-0"
                >
                  {inactiveSidebarWorkspaces.length > 0 && (
                    <div className="max-h-[40vh] overflow-y-auto pr-1">
                      {inactiveSidebarWorkspaces.map((workspace) => (
                        <InactiveWorkspaceRow
                          key={workspace.id}
                          workspace={workspace}
                          now={workspaceHomeNow}
                          onSelect={selectInactiveWorkspace}
                        />
                      ))}
                    </div>
                  )}
                </WorkspaceSidebarSection>
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
                <div className="nd-label text-text-secondary">{t('ui.updates')}</div>
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
                    <span>{t('update.restartToInstall')}</span>
                  </button>
                )}

                <button
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:text-text-display"
                  onClick={() => setDismissedUpdateVersion(currentUpdateBannerKey)}
                  title={t('ui.dismissUpdateBanner')}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeWorkspaceId ? (
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <div
                className="min-w-0 flex-1 overflow-hidden"
                hidden={activityOpen || agentsView.isOpen || showWorkspaceHome}
                aria-hidden={activityOpen || agentsView.isOpen || showWorkspaceHome}
                inert={activityOpen || agentsView.isOpen || showWorkspaceHome}
              >
              <div className="flex h-full min-h-0 overflow-hidden">
              <div className="relative min-w-0 flex flex-1 flex-col overflow-hidden">
                {viewMode === 'splitview' && (
                <SplitviewPanel
                  tiles={sortedTiles}
                  splitViewState={splitViewState}
                  attentionCounts={terminalAttentionCounts}
                  agentTitles={agentTitles}
                  onActivateTile={activateSplitTile}
                  onCloseTile={(panel, tileId) => {
                    void closeTileFromSplitview(panel, tileId)
                  }}
                  onEditTile={openTileEditor}
                  onFocusTile={focusTileInFullview}
                  onDuplicateTile={(panel, tile) => {
                    const duplicateId = duplicateTerminalTile(tile.id, { splitPanel: panel })
                    if (duplicateId) setFullviewActiveTileId(duplicateId)
                  }}
                  onRefreshTile={handleRefreshTile}
                  onToggleNotificationsMuted={toggleTileNotificationsMuted}
                  onMoveTile={moveTileToSplitPanel}
                  onFocusPanel={setSplitFocusedPanel}
                  onToggleLock={(tileId) => {
                    const tile = tiles.find((entry) => entry.id === tileId)
                    if (!tile) return
                    updateTile(tileId, { locked: !tile.locked })
                  }}
                />
              )}

                <div className="relative min-h-0 flex-1">
                {viewMode === 'board' && boardEnabled && boardVisible ? (
                  <BoardView
                    workspaceId={activeWorkspaceId}
                    board={boardState}
                    onClose={closeBoard}
                    onCreateTask={handleCreateBoardTask}
                    onUpdateTask={updateBoardTask}
                    onAddNote={addBoardNote}
                    onDeleteBacklogTask={deleteBacklogBoardTask}
                    onApproveReviewTask={approveReviewBoardTask}
                    onRejectReviewTask={rejectReviewBoardTask}
                  />
                ) : activeWorkspaceType === 'grid' && viewMode === 'gridview' ? (
                  <GridView
                    key={activeWorkspaceId}
                    workspaceId={activeWorkspaceId}
                    workspaceConfig={activeWorkspaceConfig}
                    rootNode={gridViewState.rootNode}
                    tiles={attachedTiles}
                    tileRefreshKeys={tileRefreshKeys}
                    focusedTileId={focusedTileId}
                    terminalTitles={terminalTitles}
                    agentTitles={agentTitles}
                    onFocusTile={(tileId) => {
                      focusTile(tileId)
                      selectTiles([tileId])
                    }}
                    onUpdateTile={updateTile}
                    onSetRootNode={(rootNode) => setGridViewState({ rootNode })}
                    onConfigureTile={(tile, trigger) => openTileConfigurationMenu(tile.id, trigger)}
                    onFocusTileInView={focusTileInFullview}
                    onDetachTile={detachTile}
                    onCloseTile={deleteTile}
                    onOpenBrowserTile={(url) => addBrowser(url)}
                    onOpenFileTile={openFileTile}
                    tileCreationSelectorProps={tileCreationSelectorProps}
                    workspaceRootPath={workspaceRootPath}
                  />
                ) : (
                  <Canvas
                    key={activeWorkspaceId}
                    workspaceId={activeWorkspaceId}
                    workspaceConfig={activeWorkspaceConfig}
                    tileCreationSelectorProps={tileCreationSelectorProps}
                    profiles={availableProfiles}
                    onCreateTerminal={(profileId) => addTerminal(profileId)}
                    onCreateRichNote={() => addNote('rich')}
                    onCreateMarkdownNote={() => addNote('markdown')}
                    onCreateBrowser={() => addBrowser()}
                    onCreateTimer={() => addTimer()}
                    onOpenBrowserTile={(url) => addBrowser(url)}
                    onOpenFileTile={openFileTile}
                    canCreateNote={canCreateNote}
                    canCreateBrowser={canCreateBrowser}
                    canCreateTimer={canCreateTimer}
                    onDeleteTile={deleteTile}
                    onConfigureTile={(tile, x, y) => {
                      setTileMenu({ tileId: tile.id, x, y })
                    }}
                    onFocusTileInView={focusTileInFullview}
                    onDetachTile={detachTile}
                    tileRefreshKeys={tileRefreshKeys}
                    viewMode={viewMode}
                    fullviewActiveTileId={fullviewActiveTileId}
                    splitViewState={splitViewState}
                    splitOrientation={splitViewState.orientation}
                    onFocusSplitPanel={setSplitFocusedPanel}
                    workspaceRootPath={workspaceRootPath}
                  />
                )}
                </div>
              </div>
              </div>
              </div>
              {activityOpen ? (
                <WorkspaceActivityView
                  cards={activityCards}
                  agentUsage={agentUsage}
                  workspaces={workspaceMetadata}
                  onOpenWorkspace={openActivityWorkspace}
                  onGoToTerminal={goToWorkspaceTerminal}
                  onOpenSettings={openSettings}
                  agents={agentSettings}
                />
              ) : agentsView.isOpen && agentsView.effectiveProvider ? (
                <div className="flex min-h-0 min-w-0 flex-1">
                <AgentsView
                  workspaceId={activeWorkspaceId}
                  workspaceConfig={activeWorkspaceConfig}
                  sessions={agentsView.sessions}
                  focusedSessionId={agentsView.focusedSessionId}
                  onFocusSession={agentsView.openForSession}
                  maximizedSessionId={agentsMaximizedSessionId}
                  onMaximizedSessionChange={setAgentsMaximizedSessionId}
                  onCloseSession={(session) => { void closeAgentsSession(session) }}
                  onNewSession={agentsView.openNewSessionDialog}
                  shortcutLabel={newAgentSessionShortcut}
                  onOpenBrowserTile={(url) => addBrowser(url)}
                  onOpenFileTile={openFileTile}
                />
                </div>
              ) : showWorkspaceHome ? (
                <WorkspaceHome
                  workspaces={inactiveSidebarWorkspaces}
                  now={workspaceHomeNow}
                  onSelectWorkspace={selectWorkspaceFromHome}
                  onCreateWorkspace={openCreateWorkspaceDialog}
                />
              ) : null}
              {hasWorkspacePanel && activeWorkspaceConfig.workspacePanelOpen && (
                // Outside the tile wrapper so it stays visible beside the Agents view.
                <div
                  className="flex min-h-0 shrink-0"
                  hidden={activityOpen || showWorkspaceHome}
                  aria-hidden={activityOpen || showWorkspaceHome}
                  inert={activityOpen || showWorkspaceHome}
                >
                  <WorkspacePanel
                    rootPath={workspaceRootPath}
                    workspaceId={activeWorkspaceId}
                    sourceControlRepositoryPaths={activeWorkspaceConfig.sourceControlRepositoryPaths}
                    sourceControlViewMode={activeWorkspaceConfig.sourceControlViewMode}
                    onWorkspaceUpdated={handleWorkspaceConfigUpdated}
                    activeFilePath={activeFilePath}
                    onOpenFile={openFileTile}
                    onOpenDiff={(repositoryPath, change, staged) => {
                      const path = repositoryPath === '.' ? change.path : `${repositoryPath}/${change.path}`
                      void openFileTile(path, { diff: { repositoryPath, path: change.path, originalPath: change.originalPath, staged } }).catch((error: unknown) => {
                        console.error('[App] Failed to open Git diff tile:', error)
                      })
                    }}
                    agentProvider={agentsView.effectiveProvider}
                    agentProviders={activeWorkspaceConfig.agentProviders}
                    tiles={tiles}
                    terminalTitles={terminalTitles}
                    onFocusTile={focusAgentTile}
                    onOpenAgentsSession={agentsView.openForSession}
                    requestConfirm={requestConfirm}
                    onResumeInTile={resumeHistoryInTile}
                    onOpenWorkspaceSettings={openActiveWorkspaceEditor}
                  />
                </div>
              )}
            </div>
          ) : activityOpen ? (
            <WorkspaceActivityView
              cards={activityCards}
              agentUsage={agentUsage}
              workspaces={workspaceMetadata}
              onOpenWorkspace={openActivityWorkspace}
              onGoToTerminal={goToWorkspaceTerminal}
              onOpenSettings={openSettings}
              agents={agentSettings}
            />
          ) : showWorkspaceHome ? (
            <WorkspaceHome
              workspaces={inactiveSidebarWorkspaces}
              now={workspaceHomeNow}
              onSelectWorkspace={selectWorkspaceFromHome}
              onCreateWorkspace={openCreateWorkspaceDialog}
            />
          ) : null}
      </div>
      </div>

      {/* Settings panel */}
      <SettingsPanel
        open={showSettings}
        initialSection={settingsSection}
        onClose={() => setShowSettings(false)}
        onOpenJsonEditor={() => {
          setShowSettings(false)
          setShowJsonEditor(true)
        }}
      />
      {workspaceMetadata.length > 0 && (
        <ActivityPalette
          step={agentsView.activityPaletteStep}
          fromActivity={agentsView.sessionDialogFromActivity}
          workspaces={sidebarWorkspaces}
          sessionWorkspaces={agentSessionWorkspaces}
          sessions={agentsView.snapshot.sessions}
          agents={agentSettings}
          initialWorkspaceId={agentsView.sessionDialogInitialWorkspaceId}
          focusRequestId={agentsView.sessionDialogFocusRequestId}
          shortcutLabel={newAgentSessionShortcut}
          onClose={agentsView.closeSessionDialog}
          onNewSession={agentsView.showNewSessionStep}
          onBack={agentsView.backToActivity}
          onCreated={handleAgentSessionCreated}
          onOpenAgent={openActivityPaletteAgent}
        />
      )}
      <RawJsonEditor
        open={showJsonEditor}
        workspaceId={activeWorkspaceId}
        workspaceType={activeWorkspaceType}
        state={activeWorkspaceId ? (activeWorkspaceType === 'grid' ? currentGridState : currentCanvasState) : null}
        onClose={() => setShowJsonEditor(false)}
        onApply={(state) => {
          if (activeWorkspaceType === 'grid') {
            restoreGridWorkspaceState(activeWorkspaceId, activeWorkspaceName, activeWorkspaceConfig, state as GridWorkspaceState)
          } else {
            restoreWorkspaceState(activeWorkspaceId, activeWorkspaceName, activeWorkspaceConfig, state as CanvasState)
          }
          if (activeWorkspaceId) {
            window.electron.canvas.save(activeWorkspaceId, state, activeWorkspaceType)
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
      <AppDialog
        request={activeDialog?.request ?? null}
        onCancel={closeActiveDialog}
        onConfirm={confirmActiveDialog}
      />
      <WorkspaceDialog
        request={workspaceEditor?.request ?? null}
        allowCustomScripts
        onCancel={() => {
          if (workspaceEditor?.request.canCancel === false) return
          setWorkspaceEditor(null)
        }}
        onConfirm={handleConfirmWorkspaceEditor}
      />
      <WorkspaceManagementDialog
        open={showWorkspaceManager}
        workspaces={workspaceMetadata}
        onCancel={() => setShowWorkspaceManager(false)}
        onSave={handleSaveWorkspaceManagement}
      />
      <TileEditorDialog
        request={tileEditor?.request ?? null}
        onCancel={() => setTileEditor(null)}
        onConfirm={handleConfirmTileEditor}
      />
    </div>
  )
}

export default function App(): React.ReactElement {
  const rendererMode = new URLSearchParams(window.location.search).get('mode')

  return (
    <TerminalRuntimeProvider>
      {rendererMode === 'floating-tile' ? <FloatingTileWindow /> : <AppContent />}
    </TerminalRuntimeProvider>
  )
}
