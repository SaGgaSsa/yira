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
import { GroupEditorDialog, type GroupEditorRequest, type GroupEditorValue } from './components/GroupEditorDialog'
import { WorkspaceDialog, type WorkspaceDialogRequest, type WorkspaceDialogValue } from './components/WorkspaceDialog'
import { WorkspaceManagementDialog } from './components/WorkspaceManagementDialog'
import { WorkspaceListItem } from './components/WorkspaceListItem'
import { WorkspaceActivityView } from './components/WorkspaceActivityView'
import { AgentsView } from './components/AgentsView'
import { AgentSessionDialog } from './components/AgentSessionDialog'
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
import { findMergeTargetGroup, getGroupingBlockedReason } from './utils/grouping'
import { GRID_MAX_TILES, GROUP_COLOR_ORDER, getDefaultTileSize, type AgentActiveSession, type AgentSessionCreateResult, type AgentUsageSnapshot, type BoardState, type BoardTask, type FileTileOpenOptions, type TileState, type CanvasState, type GridWorkspaceState, type Workspace, type WorkspaceMetadata, type TileGroup, type ViewMode, type SplitPanelId, type SplitViewState, type WorkspaceManagementEntry, type WorkspaceType } from '@shared/types'
import { createDefaultAgentProvidersConfig } from '@shared/workspaceConfig'
import { createEmptyGridWorkspaceState, normalizeGridWorkspaceState } from '@shared/gridWorkspaceState'
import {
  reconcileCanvasStateWithSharedTiles,
  reconcileGridStateWithSharedTiles,
} from '@shared/workspaceTypeSwitch'
import { getBoardReviewCount } from '@shared/board'
import { countAgentsViewAttention } from './utils/agentsViewSessions'
import { getAttachedTiles, isTileDetached, selectFloatingTileWindowOpenRequests } from '@shared/floatingTiles'
import { refreshGridTileContent } from './utils/gridTileRefresh'
import { DEFAULT_SPLIT_ORIENTATION, toggleSplitOrientation } from './utils/splitViewState'
import { getActiveWindowTitle } from './utils/windowTitle'
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
import { Terminal, StickyNote, SlidersHorizontal, Trash2, Pencil, Lock, Columns, Download, X, Plus } from 'lucide-react'

const GROUP_SHOW_TOP_PADDING = 42
const EMPTY_BOARD_STATE: BoardState = {
  enabled: false,
  tasks: [],
}

function createEmptyCanvasState(): CanvasState {
  return {
    tiles: [],
    groups: [],
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

type CanvasSnapshotSource = Pick<ReturnType<typeof useCanvasStore.getState>, 'tiles' | 'groups' | 'viewport' | 'nextZIndex' | 'focusedTileId' | 'viewMode' | 'fullviewActiveTileId' | 'boardVisible' | 'splitViewState'>
type GridSnapshotSource = Pick<ReturnType<typeof useCanvasStore.getState>, 'tiles' | 'nextZIndex' | 'focusedTileId' | 'viewMode' | 'fullviewActiveTileId' | 'boardVisible' | 'gridViewState' | 'splitViewState'>

function createCanvasSnapshot(source: CanvasSnapshotSource): CanvasState {
  return {
    tiles: source.tiles.map((tile) => ({ ...tile })),
    groups: source.groups.map((group) => ({
      ...group,
      tileIds: [...group.tileIds],
    })),
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
  const groupsEnabled = useSettingsStore((s) => s.groups.enabled)
  const terminalAttentionEnabled = useSettingsStore((s) => s.terminal.attentionEnabled)
  const tileCreationAvailability = useSettingsStore((s) => s.tiles.creationAvailability)

  // Canvas state
  const tiles = useCanvasStore((s) => s.tiles)
  const viewport = useCanvasStore((s) => s.viewport)
  const groups = useCanvasStore((s) => s.groups)
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
  const createGroup = useCanvasStore((s) => s.createGroup)
  const addTilesToGroup = useCanvasStore((s) => s.addTilesToGroup)
  const updateGroup = useCanvasStore((s) => s.updateGroup)
  const setGroupLocked = useCanvasStore((s) => s.setGroupLocked)
  const ungroup = useCanvasStore((s) => s.ungroup)
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
  const agentsView = useAgentsView({
    workspaceId: activeWorkspaceId,
    workspaceConfig: activeWorkspaceConfig,
    agents: agentSettings,
    newSessionShortcut: newAgentSessionShortcut,
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
  const [sessionActiveWorkspaceIds, setSessionActiveWorkspaceIds] = useState<Set<string>>(new Set())
  const [pendingWorkspaceDeactivationIds, setPendingWorkspaceDeactivationIds] = useState<Set<string>>(new Set())
  const [boardState, setBoardState] = useState<BoardState>(EMPTY_BOARD_STATE)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>('appearance')
  const [showJsonEditor, setShowJsonEditor] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
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
  }, [agentsView.sessionDialogOpen])
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
  const [groupEditor, setGroupEditor] = useState<GroupEditorState>(null)
  const [workspaceEditor, setWorkspaceEditor] = useState<WorkspaceEditorState>(null)
  const [tileEditor, setTileEditor] = useState<TileEditorState>(null)
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null)
  const [tileRefreshKeys, setTileRefreshKeys] = useState<Record<string, number>>({})
  const [tileMenu, setTileMenu] = useState<{ tileId: string; x: number; y: number } | null>(null)
  const [groupMenu, setGroupMenu] = useState<{ groupId: string; x: number; y: number } | null>(null)
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

  const agentsViewTitleSession = useMemo(() => {
    if (activityOpen || !agentsView.isOpen) return undefined
    const sessions = agentsView.sessions
    const session = sessions.find((candidate) => candidate.tileId === agentsView.focusedSessionId)
      ?? (sessions.length === 1 ? sessions[0] : undefined)
    return session ? { tileId: session.tileId, title: session.title } : null
  }, [activityOpen, agentsView.focusedSessionId, agentsView.isOpen, agentsView.sessions])

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
      groups,
      viewport,
      nextZIndex,
      focusedTileId,
      viewMode,
      fullviewActiveTileId,
      boardVisible,
      splitViewState,
    }),
    [tiles, groups, viewport, nextZIndex, focusedTileId, viewMode, fullviewActiveTileId, boardVisible, splitViewState],
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
    const retainedAgentSessionTiles = agentSessionSnapshotRef.current.sessions
      .filter((session) => session.workspaceId === workspace.id && session.surface === 'agents-view')
      .map((session) => ({ id: session.tileId, type: 'terminal' as const }))
    // Snapshot IDs protect announced sessions; the registry prefix fallback protects sessions created before the next snapshot arrives.
    const pendingAgentRuntimeTiles = registry.listTargets()
      .filter((target) => target.workspaceId === workspace.id && target.tileId.startsWith('agent-'))
      .map((target) => ({ id: target.tileId, type: 'terminal' as const }))
    await pruneWorkspaceTerminalRuntimes(registry, workspace.id, [
      ...restoredState.tiles,
      ...retainedAgentSessionTiles,
      ...pendingAgentRuntimeTiles,
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
    Promise.all([
      refreshWorkspaceMetadata(),
      window.electron.workspace.getActive(),
    ]).then(([list, active]) => {
      console.log('[App] Workspaces:', list)

      if (active) {
        void activateWorkspace(active, { persistCurrent: false, updateMain: false })
        return
      }

      if (list[0]) {
        void activateWorkspace(list[0], { persistCurrent: false })
        return
      }

      skipNextAutosaveRef.current = true
      setWorkspace('', '', { type: 'canvas', workspacePanelOpen: true, sourceControlViewMode: 'list', sourceControlRepositoryPaths: [], agentProviders: createDefaultAgentProvidersConfig() })
      restoreState(createEmptyCanvasState())
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
  }, [activateWorkspace, refreshWorkspaceMetadata, restoreState, setProfiles, setWorkspace])

  const switchWorkspace = useCallback(
    (workspace: WorkspaceMetadata) => {
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
  }, [tiles, groups, viewport, nextZIndex, viewMode, fullviewActiveTileId, splitViewState, gridViewState, activeWorkspaceId, scheduleSave])

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
    activityOpen,
    agentsViewOpen: agentsView.isOpen,
    onCloseAgentsView: agentsView.close,
    onClosePicker: () => {
      setShowProfilePicker(false)
      setShowWorkspaceManager(false)
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
  const effectiveGroups = groupsEnabled ? groups : []
  const sidebarWorkspaces = useMemo(
    () => getWorkspaceSidebarOrder(workspaceMetadata),
    [workspaceMetadata],
  )
  const agentSessionWorkspaces = useMemo(
    () => sidebarWorkspaces.filter((workspace) => (
      workspace.id === activeWorkspaceId || sessionActiveWorkspaceIds.has(workspace.id)
    )),
    [activeWorkspaceId, sessionActiveWorkspaceIds, sidebarWorkspaces],
  )
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

      if (workspace.id === activeWorkspaceId) {
        const nextWorkspace = sidebarWorkspaces.find((entry) => (
          entry.id !== workspace.id && sessionActiveWorkspaceIds.has(entry.id)
        )) ?? sidebarWorkspaces.find((entry) => entry.id !== workspace.id)

        if (!nextWorkspace) return

        recordWorkspaceSelection(nextWorkspace.id)
        await activateWorkspace(nextWorkspace)
      }

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
  }, [activeWorkspaceId, activateWorkspace, clearWorkspaceAttentionCount, pendingWorkspaceDeactivationIds, recordWorkspaceSelection, registry, requestConfirm, sessionActiveWorkspaceIds, sidebarWorkspaces, t, unmarkWorkspaceSessionActive])
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

  const mergeTargetGroup = useMemo(
    () => findMergeTargetGroup(attachedTiles, effectiveGroups, selectedTileIds),
    [attachedTiles, effectiveGroups, selectedTileIds],
  )

  const groupingBlockedReason = useMemo(
    () => getGroupingBlockedReason(attachedTiles, effectiveGroups, selectedTileIds, mergeTargetGroup?.id),
    [attachedTiles, effectiveGroups, selectedTileIds, mergeTargetGroup],
  )

  const handleCreateGroupFromSelection = useCallback(() => {
    if (!groupsEnabled) return
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
        title: t('ui.createGroup'),
        confirmLabel: t('ui.createGroupConfirm'),
        value: {
          name: t('ui.untitledGroup'),
          colorId: GROUP_COLOR_ORDER[groups.length % GROUP_COLOR_ORDER.length] ?? GROUP_COLOR_ORDER[0],
          locked: false,
        },
      },
    })
  }, [addTilesToGroup, groupingBlockedReason, groups.length, groupsEnabled, mergeTargetGroup, selectedTileIds, t])

  const openGroupEditor = useCallback((group: TileGroup) => {
    setGroupMenu(null)
    setGroupEditor({
      mode: 'edit',
      groupId: group.id,
      request: {
        title: t('ui.editGroup'),
        confirmLabel: t('ui.saveGroup'),
        value: {
          name: group.name,
          colorId: group.colorId,
          locked: Boolean(group.locked),
        },
      },
    })
  }, [t])

  const handleConfirmGroupEditor = useCallback((value: GroupEditorValue) => {
    if (!groupEditor) return

    const nextGroup = {
      name: value.name,
      colorId: value.colorId,
      locked: value.locked,
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
      title: t('ui.ungroupTiles'),
      message: t('ui.ungroupTilesMessage', { name: group.name }),
      confirmLabel: t('ui.ungroup'),
      cancelLabel: t('ui.keepGroup'),
      danger: true,
    })
    if (!confirmed) return
    ungroup(group.id)
  }, [requestConfirm, t, ungroup])

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

  const handleShowGroup = useCallback((group: TileGroup) => {
    const bounds = getGroupBounds(group)
    if (!bounds) return

    setGroupMenu(null)
    selectTiles(bounds.tileIds)
    focusTile(null)

    const fitGroupBounds = () => {
      getCanvasMethods()?.fitViewToBounds(bounds, { top: GROUP_SHOW_TOP_PADDING })
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
    setGroupMenu(null)
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
    setActivityOpen(false)
    switchWorkspace(workspace)
  }, [agentsView.close, switchWorkspace])

  const handleAgentSessionCreated = useCallback((result: AgentSessionCreateResult) => {
    if (result.workspaceId === activeWorkspaceId) {
      agentsView.openForSession(result.tileId)
      return
    }

    const workspace = sidebarWorkspaces.find((entry) => entry.id === result.workspaceId)
    if (!workspace) return

    pendingAgentSessionSourceRef.current = activeWorkspaceId
    setPendingAgentSession({ workspaceId: result.workspaceId, tileId: result.tileId })
    setActivityOpen(false)
    agentsView.close()
    switchWorkspace(workspace)
  }, [activeWorkspaceId, agentsView.close, agentsView.openForSession, sidebarWorkspaces, switchWorkspace])

  const goToWorkspaceTerminal = useCallback((workspace: WorkspaceMetadata, tileId: string | null) => {
    agentsView.close()
    setActivityOpen(false)
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
  }, [activateWorkspace, agentsView.close, focusTile, focusTileInFullview, recordWorkspaceSelection, selectTiles, setFullviewActiveTileId])

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
          terminalHistoryEnabled: true,
          remoteTerminal: { host: '', user: '' },
          agentProvider: undefined,
          agentProviders: createDefaultAgentProvidersConfig(),
          sourceControlRepositoryPaths: [],
        },
      },
    })
  }, [t])

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
  const activeGroupMenu = groupsEnabled && groupMenu ? effectiveGroups.find((group) => group.id === groupMenu.groupId) ?? null : null
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
  const groupMenuItems: MenuItem[] = activeGroupMenu ? [
    {
      label: t('ui.show'),
      icon: Columns,
      action: () => handleShowGroup(activeGroupMenu),
    },
    {
      label: t('ui.editGroupAction'),
      icon: Pencil,
      action: () => {
        openGroupEditor(activeGroupMenu)
      },
    },
    {
      label: activeGroupMenu.locked ? t('ui.unlock') : t('ui.lock'),
      icon: Lock,
      action: () => handleToggleGroupLock(activeGroupMenu),
    },
    {
      label: t('ui.ungroup'),
      icon: Trash2,
      danger: true,
      action: () => {
        void handleUngroup(activeGroupMenu)
      },
    },
  ] : []
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

  const confirmRemoveTileFromGroup = useCallback(async (tile: TileState, group: TileGroup) => {
    return requestConfirm({
      title: t('ui.removeTileFromGroup'),
      message: t('ui.removeTileFromGroupMessage', { tile: tile.label ?? t('ui.thisTile'), group: group.name }),
      confirmLabel: t('ui.remove'),
      cancelLabel: t('ui.keepInGroup'),
      danger: true,
    })
  }, [requestConfirm, t])

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

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg-primary text-text-primary">
      <TopBar
        hasWorkspace={Boolean(activeWorkspaceId)}
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
          setActivityOpen((value) => !value)
        }}
        agentsViewAvailable={Boolean(activeWorkspaceId && agentsView.effectiveProvider)}
        agentsViewOpen={agentsView.isOpen}
        agentSessionCount={agentsView.sessions.length}
        agentAttentionCount={countAgentsViewAttention(agentsView.sessions)}
        onToggleAgentsView={() => {
          setActivityOpen(false)
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
          agentsView.close()
          setActivityOpen(false)
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

            <TileCreationSelector {...tileCreationSelectorProps} />
          </div>
        }
      >
        <div className="flex h-full flex-col bg-bg-secondary">
          <div className="flex-1 px-3 py-4">
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
              <div className="space-y-2">
                {sidebarWorkspaces.map((workspace) => (
                  <WorkspaceListItem
                    key={workspace.id}
                    workspace={workspace}
                    active={workspace.id === activeWorkspaceId}
                    sessionActive={sessionActiveWorkspaceIds.has(workspace.id)}
                    attentionCount={workspaceAttentionCounts[workspace.id] ?? 0}
                    recentOutputCount={recentOutputCounts[workspace.id] ?? 0}
                    className="w-full transition-colors"
                    onClick={() => {
                      agentsView.close()
                      setActivityOpen(false)
                      switchWorkspace(workspace)
                    }}
                    onConfigure={() => openWorkspaceEditor(workspace)}
                    onFocus={() => {
                      agentsView.close()
                      setActivityOpen(false)
                      recordWorkspaceSelection(workspace.id)
                      void activateWorkspace(workspace, { activationMode: 'focus-last' })
                    }}
                    onDeactivate={() => void deactivateWorkspace(workspace)}
                    deactivatePending={pendingWorkspaceDeactivationIds.has(workspace.id) || sidebarWorkspaces.length < 2}
                  />
                ))}
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
                hidden={activityOpen || agentsView.isOpen}
                aria-hidden={activityOpen || agentsView.isOpen}
                inert={activityOpen || agentsView.isOpen}
              >
              <div className="flex h-full min-h-0 overflow-hidden">
              <div className="relative min-w-0 flex flex-1 flex-col overflow-hidden">
                {viewMode === 'splitview' && (
                <SplitviewPanel
                  tiles={sortedTiles}
                  splitViewState={splitViewState}
                  attentionCounts={terminalAttentionCounts}
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
                    onCreateGroupFromSelection={() => {
                      void handleCreateGroupFromSelection()
                    }}
                    groupsEnabled={activeWorkspaceType === 'canvas' && groupsEnabled}
                    onDeleteTile={deleteTile}
                    onConfigureTile={(tile, x, y) => {
                      setGroupMenu(null)
                      setTileMenu({ tileId: tile.id, x, y })
                    }}
                    onFocusTileInView={focusTileInFullview}
                    onDetachTile={detachTile}
                    onConfirmRemoveFromGroup={confirmRemoveTileFromGroup}
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
              {hasWorkspacePanel && activeWorkspaceConfig.workspacePanelOpen && (
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
                  onOpenWorkspaceSettings={openActiveWorkspaceEditor}
                />
              )}
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
                <AgentsView
                  workspaceId={activeWorkspaceId}
                  workspaceConfig={activeWorkspaceConfig}
                  provider={agentsView.effectiveProvider}
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
              ) : null}
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
          ) : (
            <div className="flex flex-1 items-center justify-center bg-bg-primary" />
          )}
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
        <AgentSessionDialog
          open={agentsView.sessionDialogOpen}
          workspaces={agentSessionWorkspaces}
          initialWorkspaceId={agentsView.sessionDialogInitialWorkspaceId}
          agents={agentSettings}
          focusRequestId={agentsView.sessionDialogFocusRequestId}
          onClose={agentsView.closeSessionDialog}
          onCreated={handleAgentSessionCreated}
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
        request={groupEditor?.request ?? null}
        onCancel={() => setGroupEditor(null)}
        onConfirm={handleConfirmGroupEditor}
      />
      <WorkspaceDialog
        request={workspaceEditor?.request ?? null}
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
