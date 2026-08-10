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
  WindowBounds,
  WindowClosePreparationRequest,
  BoardState,
  BoardTask,
  TerminalCreateOptions,
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
  GitStatusResult,
  AgentActiveSessionSnapshot,
  AgentProviderAvailabilitySnapshot,
  AgentSessionHistoryQuery,
  AgentSessionHistoryResult,
  NoteBlocks,
  MarkdownViewMode,
  NoteKind,
} from '@shared/types'

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
    history: (query?: AgentSessionHistoryQuery) => Promise<AgentSessionHistoryResult>
    queryHistory: (query?: AgentSessionHistoryQuery) => Promise<AgentSessionHistoryResult>
  }
  settings: {
    load: () => Promise<UserSettings | null>
    save: (settings: UserSettings) => Promise<void>
    configureAgentHooks: (provider: 'codex' | 'claude') => Promise<{ message: string }>
    uninstallAgentHooks: (provider: 'codex' | 'claude') => Promise<{ message: string }>
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
    selectFolder: (defaultPath?: string) => Promise<FileSelectFolderResult | null>
    list: (rootPath: string, relativeDir: string, options?: FileListOptions) => Promise<FileListResult>
    search: (rootPath: string, query: string) => Promise<FileSearchResult>
    read: (rootPath: string, relativePath: string) => Promise<FileReadResult>
    stat: (rootPath: string, relativePath: string) => Promise<FileStatResult>
    write: (rootPath: string, relativePath: string, input: FileWriteInput) => Promise<FileWriteResult>
    readPreviewAsset: (rootPath: string, relativePath: string) => Promise<FilePreviewAssetResult>
  }
  git: {
    status: (workspaceId: string) => Promise<GitStatusResult>
    history: (workspaceId: string) => Promise<GitCommitHistoryResult>
    stage: (workspaceId: string, relativePath: string, originalPath?: string) => Promise<void>
    unstage: (workspaceId: string, relativePath: string, originalPath?: string) => Promise<void>
    commit: (workspaceId: string, message: string) => Promise<void>
    sync: (workspaceId: string) => Promise<void>
  }
  canvas: {
    load: (workspaceId: string, workspaceType?: string) => Promise<unknown | null>
    save: (workspaceId: string, state: unknown, workspaceType?: string) => Promise<void>
  }
  terminal: {
    create: (tileId: string, options: TerminalCreateOptions) => Promise<{ cols: number; rows: number; buffer: string }>
    write: (tileId: string, data: string) => Promise<void>
    resize: (tileId: string, cols: number, rows: number) => Promise<void>
    destroy: (tileId: string) => Promise<void>
    detach: (tileId: string) => Promise<void>
    acknowledgeAgentAlert: (tileId: string) => Promise<void>
    setAgentAlertsEnabled: (enabled: boolean) => Promise<void>
    sshAvailable: () => Promise<boolean>
    onData: (tileId: string, callback: (data: string) => void) => () => void
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
    writeText: (text: string) => Promise<void>
    writeRich: (data: { text: string; html: string }) => Promise<void>
  }
  notifications: {
    requestAttention: (options?: NotificationAttentionOptions) => Promise<NotificationAttentionResult>
    clearAttention: () => Promise<NotificationAttentionResult>
  }
  window: {
    setTitle: (title: string) => Promise<void>
    setTitleBarOverlayTheme: (theme: 'dark' | 'light') => Promise<void>
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
