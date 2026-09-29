import type { AppThemeId } from '@shared/appThemes'
import type {
  ShellProfileId,
  CanvasState,
  Workspace,
  WorkspaceMetadata,
  WorkspaceCreateInput,
  WorkspaceManagementCommitInput,
  WorkspaceManagementCommitResult,
  WorkspaceOpenFolderResult,
  WorkspaceType,
  WorkspaceUpdatePatch,
  UserSettings,
  ClaudeStatusLineMutationResult,
  ClaudeStatusLineState,
  WindowBackgroundMaterial,
  WindowBackgroundMaterialState,
  WindowBounds,
  WindowClosePreparationRequest,
  BoardState,
  BoardTask,
  RemotePreparationResult,
  RemotePreparationStatus,
  TerminalCreateOptions,
  TerminalCreateResult,
  TerminalExitEvent,
  UpdateState,
  NotificationAttentionOptions,
  NotificationAttentionResult,
  FileListOptions,
  FileListResult,
  FileSearchResult,
  FilePreviewAssetResult,
  FileReadResult,
  FileSelectFolderResult,
  FileStatResult,
  FileWriteInput,
  FileWriteResult,
  FloatingNavigationEvent,
  FloatingNavigationRequest,
  GitCommitHistoryResult,
  GitRepository,
  GitStatusResult,
  WorkspaceGitDiffResult,
  AgentActiveSessionSnapshot,
  AgentProviderAvailabilitySnapshot,
  AgentSessionHistoryQuery,
  AgentSessionHistoryResult,
  AgentUsageSnapshot,
  AgentUsageDetailsSnapshot,
  NoteBlocks,
  MarkdownViewMode,
  NoteKind,
} from '@shared/types'
import type { TerminalSessionIdentity, TerminalSessionTarget } from '@shared/terminalSessionIdentity'

type NoteData = {
  title?: string
  blocks?: NoteBlocks
  content?: string
  color?: string
  font?: string
  noteKind?: NoteKind
  markdown?: string
  markdownView?: MarkdownViewMode
}

interface ElectronWorld {
  workspace: {
    list: () => Promise<WorkspaceMetadata[]>
    create: (input: WorkspaceCreateInput) => Promise<Workspace>
    update: (id: string, patch: WorkspaceUpdatePatch) => Promise<Workspace | null>
    rename: (id: string, name: string) => Promise<Workspace | null>
    delete: (id: string) => Promise<void>
    setActive: (id: string) => Promise<void>
    recordSelection: (id: string) => Promise<Workspace | null>
    setPinned: (id: string, pinned: boolean) => Promise<Workspace | null>
    setType: (id: string, type: WorkspaceType) => Promise<Workspace | null>
    getActive: () => Promise<Workspace | null>
    openFolder: () => Promise<WorkspaceOpenFolderResult>
    commitManagementChanges: (input: WorkspaceManagementCommitInput) => Promise<WorkspaceManagementCommitResult>
  }
  agents: {
    availability: () => Promise<AgentProviderAvailabilitySnapshot>
    getAvailability: () => Promise<AgentProviderAvailabilitySnapshot>
    sessionsSnapshot: (workspaceId?: string) => Promise<AgentActiveSessionSnapshot>
    getSessions: (workspaceId?: string) => Promise<AgentActiveSessionSnapshot>
    subscribeSessions: (workspaceId?: string) => Promise<string | false>
    unsubscribeSessions: (token: string) => Promise<boolean>
    onSessionsChanged: (callback: (snapshot: AgentActiveSessionSnapshot) => void) => () => void
    usageSnapshot: () => Promise<AgentUsageSnapshot | null>
    usageDetails: () => Promise<AgentUsageDetailsSnapshot | null>
    onUsageChanged: (callback: (snapshot: AgentUsageSnapshot) => void) => () => void
    history: (query?: AgentSessionHistoryQuery) => Promise<AgentSessionHistoryResult>
    queryHistory: (query?: AgentSessionHistoryQuery) => Promise<AgentSessionHistoryResult>
  }
  settings: {
    load: () => Promise<UserSettings | null>
    save: (settings: UserSettings) => Promise<void>
    configureAgentHooks: (provider: 'codex' | 'claude') => Promise<{ message: string }>
    uninstallAgentHooks: (provider: 'codex' | 'claude') => Promise<{ message: string }>
    getClaudeStatusLineStatus: () => Promise<ClaudeStatusLineState>
    installClaudeStatusLine: () => Promise<ClaudeStatusLineMutationResult>
    uninstallClaudeStatusLine: () => Promise<ClaudeStatusLineMutationResult>
  }
  note: {
    save: (tileId: string, data: NoteData) => Promise<void>
    load: (tileId: string) => Promise<NoteData | null>
    delete: (tileId: string) => Promise<void>
  }
  board: {
    load: (workspaceId: string) => Promise<BoardState>
    enable: (workspaceId: string) => Promise<BoardState>
    createUserTask: (workspaceId: string, input: Pick<BoardTask, 'title' | 'task'>) => Promise<BoardState>
    updateUserTask: (workspaceId: string, input: { taskId: string; title?: string; task?: string }) => Promise<BoardState>
    addUserNote: (workspaceId: string, input: { taskId: string; note: string }) => Promise<BoardState>
    deleteBacklogTask: (workspaceId: string, taskId: string) => Promise<BoardState>
    approveReviewTask: (workspaceId: string, taskId: string) => Promise<BoardState>
    rejectReviewTask: (workspaceId: string, input: { taskId: string; note: string }) => Promise<BoardState>
  }
  files: {
    openFolder: (folderPath: string) => Promise<void>
    selectFolder: (defaultPath?: string) => Promise<FileSelectFolderResult | null>
    list: (rootPath: string, relativeDir: string, options?: FileListOptions) => Promise<FileListResult>
    search: (rootPath: string, query: string) => Promise<FileSearchResult>
    read: (rootPath: string, relativePath: string) => Promise<FileReadResult>
    stat: (rootPath: string, relativePath: string) => Promise<FileStatResult>
    write: (rootPath: string, relativePath: string, input: FileWriteInput) => Promise<FileWriteResult>
    readPreviewAsset: (rootPath: string, relativePath: string) => Promise<FilePreviewAssetResult>
  }
  git: {
    discoverRepositories: (workspaceId: string) => Promise<GitRepository[]>
    discoverRepositoriesAtRoot: (rootFolderPath: string) => Promise<GitRepository[]>
    status: (workspaceId: string, repositoryPath: string) => Promise<GitStatusResult>
    history: (workspaceId: string, repositoryPath: string) => Promise<GitCommitHistoryResult>
    workspaceDiff: (workspaceId: string) => Promise<WorkspaceGitDiffResult>
    stage: (workspaceId: string, repositoryPath: string, relativePath: string, originalPath?: string) => Promise<void>
    unstage: (workspaceId: string, repositoryPath: string, relativePath: string, originalPath?: string) => Promise<void>
    commit: (workspaceId: string, repositoryPath: string, message: string) => Promise<void>
    fetch: (workspaceId: string, repositoryPath: string) => Promise<void>
    pull: (workspaceId: string, repositoryPath: string) => Promise<void>
    push: (workspaceId: string, repositoryPath: string) => Promise<void>
    sync: (workspaceId: string, repositoryPath: string) => Promise<void>
  }
  canvas: {
    load: (workspaceId: string, workspaceType?: string) => Promise<unknown | null>
    save: (workspaceId: string, state: unknown, workspaceType?: string) => Promise<void>
  }
  terminal: {
    prepareRemote: (workspaceId: string) => Promise<RemotePreparationResult>
    onPreparationProgress: (workspaceId: string, callback: (status: RemotePreparationStatus) => void) => () => void
    create: (target: TerminalSessionTarget, options: TerminalCreateOptions) => Promise<TerminalCreateResult>
    attach: (identity: TerminalSessionIdentity) => Promise<TerminalCreateResult>
    write: (identity: TerminalSessionIdentity, data: string) => Promise<void>
    resize: (identity: TerminalSessionIdentity, cols: number, rows: number) => Promise<void>
    destroy: (identity: TerminalSessionIdentity) => Promise<void>
    destroyCurrent: (target: TerminalSessionTarget) => Promise<void>
    detach: (identity: TerminalSessionIdentity) => Promise<void>
    acknowledgeAgentAlert: (identity: TerminalSessionIdentity) => Promise<void>
    setAgentAlertsEnabled: (enabled: boolean) => Promise<void>
    sshAvailable: () => Promise<boolean>
    onData: (identity: TerminalSessionIdentity, callback: (data: string) => void) => () => void
    onExit: (identity: TerminalSessionIdentity, callback: (event: TerminalExitEvent) => void) => () => void
    onAgentAlert: (tileId: string, callback: (state: unknown) => void) => () => void
  }
  shellProfiles: {
    list: () => Promise<Array<{ id: ShellProfileId; label: string; available: boolean }>>
  }
  shell: {
    openExternal: (url: string) => Promise<void>
  }
  clipboard: {
    readText: () => Promise<string>
    saveImageToTempFile: () => Promise<string | null>
    writeText: (text: string) => Promise<void>
    writeRich: (data: { text: string; html: string }) => Promise<void>
  }
  notifications: {
    requestAttention: (options?: NotificationAttentionOptions) => Promise<NotificationAttentionResult>
    clearAttention: () => Promise<NotificationAttentionResult>
  }
  window: {
    setTitle: (title: string) => Promise<void>
    getBackgroundMaterialState: () => Promise<WindowBackgroundMaterialState>
    setBackgroundMaterial: (material: WindowBackgroundMaterial) => Promise<WindowBackgroundMaterialState>
    setTitleBarOverlayTheme: (theme: 'dark' | 'light' | AppThemeId) => Promise<void>
    onClosePreparationRequest: (
      callback: (request: WindowClosePreparationRequest) => void | Promise<void>,
    ) => () => void
  }
  floating: {
    open: (workspaceId: string, tileId: string, bounds?: WindowBounds) => Promise<void>
    focus: (tileId: string) => Promise<void>
    close: (tileId: string, attachOnClose?: boolean) => Promise<void>
    closeWorkspace: (workspaceId: string) => Promise<void>
    requestAttach: (tileId: string) => Promise<void>
    getTileSnapshot: (workspaceId: string, tileId: string) => Promise<unknown | null>
    updateTile: (workspaceId: string, tileId: string, patch: unknown) => Promise<void>
    requestNavigation: (tileId: string, request: FloatingNavigationRequest) => Promise<void>
    onAttachRequested: (
      callback: (event: { workspaceId: string; tileId: string; bounds?: WindowBounds }) => void,
    ) => () => void
    onBoundsChanged: (
      callback: (event: { workspaceId: string; tileId: string; bounds: WindowBounds }) => void,
    ) => () => void
    onSnapshotRequest: (
      callback: (event: { requestId: string; workspaceId: string; tileId: string }) => unknown | Promise<unknown>,
    ) => () => void
    onUpdateTile: (
      callback: (event: { workspaceId: string; tileId: string; patch: unknown }) => void,
    ) => () => void
    onNavigationRequested: (callback: (event: FloatingNavigationEvent) => void) => () => void
  }
  updates: {
    getState: () => Promise<UpdateState>
    check: () => Promise<UpdateState>
    install: () => Promise<void>
    onStateChange: (callback: (state: UpdateState) => void) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronWorld
  }
}

export {}
