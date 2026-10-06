import type { AppThemeId } from './appThemes'
import type { TerminalThemeId } from './terminalThemes'
import type { TerminalSessionIdentity } from './terminalSessionIdentity'

// ─── Agents ────────────────────────────────────────────────────────────────

/** Providers supported by Yira's agent terminal integration. */
export type AgentProvider = 'claude' | 'codex'

export type AgentSessionSurface = 'tile' | 'agents-view'

export type ClaudeStatusLineStateStatus = 'active' | 'inactive' | 'chainable' | 'outdated' | 'malformed' | 'unsupported'
export type ClaudeStatusLineMutationStatus = 'installed' | 'already-installed' | 'uninstalled' | 'already-uninstalled' | 'malformed' | 'unsupported' | 'invalid' | 'conflict'

export interface ClaudeStatusLineState {
  status: ClaudeStatusLineStateStatus
  message: string
}

export interface ClaudeStatusLineMutationResult {
  ok: boolean
  success: boolean
  status: ClaudeStatusLineMutationStatus
  changed: boolean
  text: string
  message: string
}

export const AGENT_PROVIDERS: readonly AgentProvider[] = ['claude', 'codex']

/** Provider commands are fixed by the main process; only arguments are configurable. */
export const AGENT_PROVIDER_COMMANDS: Readonly<Record<AgentProvider, string>> = {
  claude: 'claude',
  codex: 'codex',
}

export interface AgentProviderConfig {
  enabled: boolean
  args: string[]
}

export type AgentProviderConfigInput = Partial<AgentProviderConfig>
export type AgentProvidersConfig = Record<AgentProvider, AgentProviderConfig>
export type AgentProvidersConfigInput = Partial<Record<AgentProvider, AgentProviderConfigInput>>

/** Defaults are deliberately data-only so older workspace files can be migrated safely. */
export const DEFAULT_AGENT_PROVIDERS_CONFIG: AgentProvidersConfig = {
  claude: { enabled: true, args: [] },
  codex: { enabled: true, args: [] },
}

/** Alias for callers that refer to the provider map as settings. */
export type AgentProviderSettings = AgentProvidersConfig

export type AgentSessionStatus = 'working' | 'needs-input' | 'done' | 'exited'

/** Metadata retained on a terminal tile that was launched for an agent session. */
export interface TerminalAgentMetadata {
  provider: AgentProvider
  sessionId?: string
  /** Workspace-relative directory used when resuming a history session. */
  cwd?: string
  /** Agents View requests may only attach to an already-running runtime target. */
  surface?: AgentSessionSurface
}

/** Backwards-compatible name for consumers that call this agent terminal metadata. */
export type AgentTerminalMetadata = TerminalAgentMetadata

export interface AgentActiveSession {
  sessionId: string
  tileId: string
  workspaceId: string
  provider: AgentProvider
  status: AgentSessionStatus
  startedAt: string
  lastActivityAt: string
  /** Missing values from older daemons are interpreted as 'tile'. */
  surface?: AgentSessionSurface
  title?: string
  /** Latest title the agent set on its terminal, as the agent wrote it. */
  liveTitle?: string
  /** Provider conversation running now, when detected; it replaces `sessionId` after /clear. */
  conversationId?: string
  worktreeRoot?: string
  worktreeBranch?: string
  worktrees?: Array<{ path: string; baseSha: string }>
}

export type ActiveAgentSession = AgentActiveSession

export interface AgentActiveSessionSnapshot {
  sessions: AgentActiveSession[]
}

export interface AgentHistoryEntry {
  sessionId: string
  provider: AgentProvider
  workspaceId?: string
  workspaceName?: string
  title?: string
  status?: AgentSessionStatus
  startedAt?: string
  endedAt?: string
  summary?: string
}

export type AgentHistoryItem = AgentHistoryEntry

export interface AgentHistoryQuery {
  workspaceId?: string
  provider?: AgentProvider
  search?: string
  limit?: number
}

export interface AgentHistoryResult {
  entries: AgentHistoryEntry[]
  hasMore: boolean
}

/**
 * Safe, renderer-facing metadata for one provider transcript.
 *
 * The main process deliberately returns no transcript path or message body;
 * title and preview are bounded snippets derived from the local transcript.
 */
export interface AgentSessionHistoryItem {
  identifier: string
  provider: AgentProvider
  /** Workspace-relative cwd when a workspace-scoped query supplied one. */
  cwd?: string
  startedAt: string
  lastActivityAt: string
  title?: string
  preview?: string
  model?: string
  messageCount: number
}

export interface AgentSessionHistoryResult {
  items: AgentSessionHistoryItem[]
  hasMore: boolean
}

export interface AgentSessionHistoryQuery {
  workspaceId?: string
  provider?: AgentProvider
  search?: string
  limit?: number
}

export type AgentTranscriptEntryKind = 'prompt' | 'command' | 'reply'

export interface AgentTranscriptEntry {
  kind: AgentTranscriptEntryKind
  /** Prompt or reply text with line breaks preserved; commands are formatted as "/name args". */
  text: string
  timestamp?: string
  /** True when text was cut at the per-entry limit. */
  truncated?: boolean
}

export interface AgentSessionTranscriptQuery {
  workspaceId?: string
  provider: AgentProvider
  identifier: string
  /** Entry index (exclusive) to page backwards from; omitted means the end of the conversation. */
  before?: number
  limit?: number
}

export interface AgentSessionTranscriptResult {
  /** Entries in chronological order. */
  entries: AgentTranscriptEntry[]
  /** Index of entries[0] within the whole conversation. */
  start: number
  total: number
  found: boolean
}

export interface AgentSessionCreateInput {
  workspaceId: string
  provider?: AgentProvider
  prompt?: string
  resumeSessionId?: string
  resumeCwd?: string
  worktree?: boolean
}

export interface AgentSessionCreateResult {
  workspaceId: string
  tileId: string
  provider: AgentProvider
}

export interface AgentSessionCloseInput {
  workspaceId: string
  tileId: string
}

export interface AgentSessionCloseResult {
  worktree: 'none' | 'removed' | 'kept' | 'missing'
  worktreeRoot?: string
}

export interface AgentSessionCapabilities {
  provider: AgentProvider | null
  providers: AgentProvider[]
  worktreeAvailable: boolean
}

export interface AgentProviderAvailability {
  provider: AgentProvider
  command: string
  configured: boolean
  available: boolean
}

export type AgentProviderAvailabilitySnapshot = Record<AgentProvider, AgentProviderAvailability>

export type AgentUsageWindowKind = 'fiveHour' | 'weekly'

/** Sanitized usage for one provider quota window. */
export interface AgentUsageWindow {
  kind: AgentUsageWindowKind
  usedPercent: number
  resetsAt: string
}

/** Safe usage state exposed to renderer-facing consumers. */
export interface AgentUsageProviderSnapshot {
  provider: AgentProvider
  windows: AgentUsageWindow[]
  planType?: string
  credits?: {
    hasCredits: boolean
    unlimited: boolean
    balance?: string
  }
  limitReached?: string | null
  updatedAt?: string
  status: 'available' | 'unavailable'
}

export interface AgentTokenBreakdown {
  input: number
  cacheRead: number
  cacheWrite: number
  output: number
  reasoning: number
}

export interface AgentUsageRecentSession {
  provider: AgentProvider
  sessionId: string
  workspaceId?: string
  model?: string
  lastActivityAt: string
  contextTokens?: number
  contextWindow?: number
  contextWindowApprox?: boolean
}

export interface AgentUsageProviderDetails {
  provider: AgentProvider
  day: string
  tokens: AgentTokenBreakdown
  hourly: number[]
  sessionCount: number
  topModel?: {
    name: string
    share: number
  }
  tokensByWorkspace: Record<string, number>
  linesAdded?: number
  linesRemoved?: number
}

export interface AgentUsageDetailsSnapshot {
  updatedAt: string
  providers: Partial<Record<AgentProvider, AgentUsageProviderDetails>>
  recentSessions: AgentUsageRecentSession[]
}
export type AgentDetectionSnapshot = Record<AgentProvider, { installed: boolean; hooksInstalled: boolean }>

export type AgentUsagePeriod = 'today' | '7d' | '30d'
export interface AgentUsageHistoryRequest { period: AgentUsagePeriod; providers?: AgentProvider[] }
export interface AgentUsageHistorySnapshot {
  updatedAt: string
  period: AgentUsagePeriod
  providers: AgentProvider[]
  indexing: boolean
  totals: AgentTokenBreakdown & { total: number; messages: number; sessions: number }
  series: { bucket: 'hour' | 'day'; points: Array<{ start: string } & Partial<Record<AgentProvider, number>>> }
  byModel: Array<{ provider: AgentProvider; model: string; tokens: number }>
  byWorkspace: Array<{ workspaceId: string; tokens: number }>
  byProvider: Array<{ provider: AgentProvider; tokens: number }>
  lines?: { added: number; removed: number }
  recentSessions: AgentUsageRecentSession[]
}

/** Global usage state always includes a safe entry for each supported provider. */
export interface AgentUsageSnapshot {
  claude: AgentUsageProviderSnapshot
  codex: AgentUsageProviderSnapshot
}

// ─── Workspace ─────────────────────────────────────────────────────────────

export type WorkspaceType = 'canvas' | 'grid'
export type SourceControlViewMode = 'list' | 'tree'

export interface WakeOnLanConfig {
  enabled: boolean
  macAddress: string
  broadcastAddress?: string
  port?: number
}

export interface RemoteTerminalConfig {
  host: string
  user: string
  port?: number
  wakeOnLan?: WakeOnLanConfig
}

export type RemotePreparationStatus = 'checking' | 'packet-sent' | 'host-online' | 'ssh-ready' | 'unconfirmed'

export interface RemotePreparationResult {
  status: 'disabled' | 'available' | 'host-online' | 'woken'
  wakeSent: boolean
}

export interface Workspace {
  id: string
  name: string
  config: WorkspaceConfig
  /** Internal storage location for persisted Yira state. */
  path: string
  /** Keep this workspace at the top of workspace selectors. */
  pinned?: boolean
  /** Monotonic timestamp of the last explicit workspace selection. */
  lastSelectedAt?: number
}

/** Config-only workspace data used for selectors and workspace editing. */
export type WorkspaceMetadata = Workspace

export interface WorkspaceConfig {
  type: WorkspaceType
  rootFolderPath?: string
  sourceControlRepositoryPaths: string[]
  workspacePanelOpen: boolean
  sourceControlViewMode: SourceControlViewMode
  initialCommand?: string
  terminalHistoryEnabled?: boolean
  remoteTerminal?: RemoteTerminalConfig
  agentProvider?: AgentProvider
  agentProviders: AgentProvidersConfig
}

export type WorkspaceConfigInput = Omit<Partial<WorkspaceConfig>, 'agentProviders'> & {
  agentProvider?: AgentProvider
  agentProviders?: AgentProvidersConfigInput
}

export interface WorkspaceCreateInput {
  type?: WorkspaceType
  name: string
  rootFolderPath?: string
  sourceControlRepositoryPaths?: string[]
  workspacePanelOpen?: boolean
  sourceControlViewMode?: SourceControlViewMode
  initialCommand?: string
  terminalHistoryEnabled?: boolean
  remoteTerminal?: RemoteTerminalConfig
  agentProvider?: AgentProvider
  agentProviders?: AgentProvidersConfigInput
}

export interface WorkspaceManagementEntry {
  id?: string
  name: string
  type?: WorkspaceType
  rootFolderPath?: string
  sourceControlRepositoryPaths?: string[]
  workspacePanelOpen?: boolean
  sourceControlViewMode?: SourceControlViewMode
  initialCommand?: string
  terminalHistoryEnabled?: boolean
  remoteTerminal?: RemoteTerminalConfig
  agentProvider?: AgentProvider
  agentProviders?: AgentProvidersConfigInput
}

export interface WorkspaceManagementCommitInput {
  workspaces: WorkspaceManagementEntry[]
}

export interface WorkspaceManagementCommitResult {
  workspaces: WorkspaceMetadata[]
  activeWorkspaceId: string
  activeWorkspace: WorkspaceMetadata | null
  createdWorkspaceIds: string[]
  removedWorkspaceIds: string[]
}

export interface WorkspaceOpenFolderResult {
  workspace: WorkspaceMetadata | null
  canceled: boolean
  selectedRootFolderPath?: string
  suggestedName?: string
  error?: string
}

export type WorkspaceUpdatePatch = Partial<Pick<Workspace, 'name'>> & {
  config?: WorkspaceConfigInput
}

// ─── Source Control ───────────────────────────────────────────────────────

/** Safe renderer-facing metadata for a discovered Git repository. */
export interface GitRepository {
  /** Workspace-relative POSIX path. The workspace root is represented by `.`. */
  relativePath: string
  /** Visible repository directory name. */
  name: string
}

export type GitChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'unmerged' | 'untracked' | 'unknown'

export interface GitFileChange {
  path: string
  status: GitChangeStatus
  originalPath?: string
}

export interface GitFileDiffContent {
  original: string
  modified: string
  modifiedExists?: boolean
  binary?: boolean
  tooLarge?: boolean
  error?: string
}

export interface GitStatusResult {
  isRepository: boolean
  branch: string | null
  upstream?: string
  ahead: number
  behind: number
  originUrl?: string
  staged: GitFileChange[]
  unstaged: GitFileChange[]
  error?: string
}

export interface GitCommitSummary {
  shortHash: string
  subject: string
  commitDate: string
}

export interface GitCommitHistoryResult {
  outgoing: GitCommitSummary[]
  upstream: GitCommitSummary[]
  local: GitCommitSummary[]
  error?: string
}

export interface WorkspaceGitDiffResult {
  additions: number
  deletions: number
  available: boolean
  /** Zero distinguishes an empty workspace from an unavailable repository diff. */
  repositoryCount?: number
}

export interface Config {
  workspaces: WorkspaceMetadata[]
  activeWorkspaceId: string
  settings: AppSettings
}

// ─── App Settings ──────────────────────────────────────────────────────────

export type AppearanceMode = 'dark' | 'light' | 'system'
export type WindowBackgroundMaterial = 'none' | 'mica' | 'acrylic' | 'translucent'

export interface WindowBackgroundMaterialState {
  supported: WindowBackgroundMaterial[]
  active: WindowBackgroundMaterial
  requiresRestart: boolean
}
export type ConfigurableTileCreationType = 'agent' | 'note' | 'browser' | 'timer'

export type TileCreationAvailability = Record<ConfigurableTileCreationType, boolean>

export interface UserSettings {
  agents: Record<AgentProvider, { enabled: boolean }>
  language: 'en' | 'es'
  themeId: AppThemeId
  appearance: AppearanceMode
  windowBackgroundMaterial: WindowBackgroundMaterial
  interfaceFontSizePx: number
  tileFontSizePx: number
  showGrid: boolean
  snapToGrid: boolean
  gridSize: number
  updateDiagnosticsEnabled: boolean
  updateDiagnosticsMigrationComplete: boolean
  browser: {
    homeUrl: string
  }
  terminal: {
    attentionEnabled: boolean
    agentAlertsEnabled: boolean
    themeId: TerminalThemeId
  }
  notifications: {
    attentionDelayEnabled: boolean
  }
  tiles: {
    creationAvailability: TileCreationAvailability
  }
  groups: {
    enabled: boolean
  }
  shortcuts: {
    newAgentSession: string
  }
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  agents: { claude: { enabled: true }, codex: { enabled: true } },
  language: 'en',
  themeId: 'default',
  appearance: 'dark',
  windowBackgroundMaterial: 'none',
  interfaceFontSizePx: 16,
  tileFontSizePx: 16,
  showGrid: true,
  snapToGrid: true,
  gridSize: 20,
  updateDiagnosticsEnabled: true,
  updateDiagnosticsMigrationComplete: true,
  browser: {
    homeUrl: 'about:blank',
  },
  terminal: {
    attentionEnabled: true,
    agentAlertsEnabled: true,
    themeId: 'yira-default',
  },
  notifications: {
    attentionDelayEnabled: true,
  },
  tiles: {
    creationAvailability: {
      agent: true,
      note: true,
      browser: true,
      timer: false,
    },
  },
  groups: {
    enabled: false,
  },
  shortcuts: {
    newAgentSession: 'Ctrl+N',
  },
}

export interface AppSettings {
  snapToGrid: boolean
  gridSize: number
  autoSaveIntervalMs: number
  defaultTileSize: { w: number; h: number }
}

export const DEFAULT_SETTINGS: AppSettings = {
  snapToGrid: true,
  gridSize: 20,
  autoSaveIntervalMs: 500,
  defaultTileSize: { w: 640, h: 420 },
}

// ─── App Updates ───────────────────────────────────────────────────────────

export type UpdateStatus =
  | 'idle'
  | 'unsupported'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  availableVersion: string | null
  progressPercent: number | null
  message: string | null
}

// ─── Window close preparation ─────────────────────────────────────────────

export type WindowClosePreparationPhase = 'flush' | 'persist'

export interface WindowClosePreparationRequest {
  requestId: string
  phase: WindowClosePreparationPhase
}

export interface WindowClosePreparationResponse extends WindowClosePreparationRequest {
  ok: boolean
  error?: string
}

// ─── Notifications ────────────────────────────────────────────────────────

export interface NotificationAttentionOptions {
  onlyWhenInactive?: boolean
}

export type NotificationAttentionReason =
  | 'marked'
  | 'already-marked'
  | 'cleared'
  | 'window-focused'
  | 'no-window'

export interface NotificationAttentionResult {
  marked: boolean
  reason: NotificationAttentionReason
}

export const NOTIFICATION_ATTENTION_DELAY_MS = 10_000

// ─── Shell Profiles ────────────────────────────────────────────────────────

export type ShellProfileId = 'powershell' | 'cmd' | 'wsl' | 'bash' | 'zsh' | 'fish'

export type TerminalConnectionKind = 'remote-ssh'

export interface TerminalExitEvent {
  exitCode: number
  signal?: number
}

export interface TerminalCreateResult {
  cols: number
  rows: number
  buffer: string
  identity: TerminalSessionIdentity
  exitEvent?: TerminalExitEvent
}

export interface ShellProfile {
  id: ShellProfileId
  label: string
  shell: string      // executable name or path
  args: string[]
  available: boolean
}

export interface TerminalCreateOptions {
  shellProfileId: ShellProfileId
  workspaceId?: string
  workspaceDir?: string
  wslStartInHome?: boolean
  initialCommand?: string
  terminalHistoryEnabled?: boolean
  connection?: TerminalConnectionKind
  remoteTerminal?: RemoteTerminalConfig
  remoteStartupCommand?: string
  agent?: TerminalAgentMetadata
  /** Normalized workspace provider settings used by the main-process adapter. */
  agentProviderConfig?: AgentProviderConfig
}

// ─── Files ─────────────────────────────────────────────────────────────────

export type FileEntryKind = 'file' | 'directory'

export interface FileEntry {
  name: string
  relativePath: string
  kind: FileEntryKind
  size: number
  modifiedAt: string
}

export interface FileListOptions {
  showIgnored?: boolean
}

export interface FileListResult {
  currentDir: string
  currentPath: string
  parentPath: string | null
  entries: FileEntry[]
  rootLabel: string
  rootPath: string
}

export interface FileSearchEntry {
  name: string
  relativePath: string
}

export interface FileSearchResult {
  entries: FileSearchEntry[]
}

export interface FileSelectFolderResult {
  path: string
  name: string
}

export interface FileRevision {
  size: number
  modifiedAt: string
  metadataToken: string
  sha256: string
}

export type FileReadResult =
  | { status: 'ready'; content: string; revision: FileRevision }
  | { status: 'unsupported'; reason: string }
  | { status: 'missing' }

export type FileStatResult =
  | { status: 'available'; revision: FileRevision }
  | { status: 'missing' }

export type FileWriteResult =
  | { status: 'saved'; revision: FileRevision }
  | { status: 'conflict'; revision: FileRevision }
  | { status: 'missing' }

export interface FileWriteInput {
  content: string
  expectedVersion: string
  force?: boolean
}

export type FilePreviewAssetResult =
  | { status: 'ready'; mimeType: string; dataBase64: string }
  | { status: 'unsupported'; reason: string }
  | { status: 'missing' }

// ─── Board ─────────────────────────────────────────────────────────────────

export type BoardStatus = 'backlog' | 'ready' | 'in_progress' | 'review' | 'done'
export type BoardActor = 'human' | 'mcp'

export interface BoardNote {
  id: string
  actor: BoardActor
  body: string
  createdAt: string
  sessionId?: string
}

export type BoardEventType = 'created' | 'updated' | 'status_changed' | 'note_added' | 'metadata_enriched'

export interface BoardEvent {
  id: string
  type: BoardEventType
  actor: BoardActor
  timestamp: string
  fromStatus?: BoardStatus
  toStatus?: BoardStatus
  note?: string
  sessionId?: string
}

export interface BoardTask {
  id: string
  title: string
  task: string
  status: BoardStatus
  createdAt: string
  updatedAt: string
  completedAt?: string
  type?: string
  context?: string
  relatedTaskIds?: string[]
  notes: BoardNote[]
  events: BoardEvent[]
}

export interface BoardState {
  enabled: boolean
  tasks: BoardTask[]
}

export const BOARD_COLUMNS: Array<{ id: BoardStatus; label: string }> = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'ready', label: 'Ready' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
]

// ─── Tile Types ────────────────────────────────────────────────────────────

export type TileType = 'terminal' | 'note' | 'browser' | 'timer' | 'files'
export type TimerStatus = 'idle' | 'running' | 'paused' | 'done'

export type NoteColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple' | 'orange' | 'white' | 'dark'
export type NoteFont = 'sans' | 'rounded' | 'serif' | 'marker' | 'handwritten'
export type NoteKind = 'rich' | 'markdown'
export type MarkdownViewMode = 'edit' | 'preview' | 'live'

export function normalizeNoteKind(value: unknown): NoteKind {
  return value === 'markdown' ? 'markdown' : 'rich'
}

export function normalizeMarkdownViewMode(value: unknown): MarkdownViewMode {
  return value === 'edit' || value === 'preview' || value === 'live' ? value : 'live'
}

export function normalizeFileMarkdownViewMode(value: unknown): MarkdownViewMode {
  return value === 'edit' || value === 'preview' || value === 'live' ? value : 'edit'
}

export interface FileTileOpenOptions {
  markdownView?: MarkdownViewMode
  reveal?: { line: number; column?: number; endLine?: number }
  diff?: { repositoryPath: string; path: string; originalPath?: string; staged: boolean }
}

export const NOTE_COLORS: Record<NoteColor, { bg: string; text: string; accent: string }> = {
  yellow: { bg: '#fef3c7', text: '#78350f', accent: '#e3b341' },
  green:  { bg: '#dcfce7', text: '#166534', accent: '#5bb974' },
  blue:   { bg: '#dbeafe', text: '#1e40af', accent: '#5b9bf6' },
  pink:   { bg: '#fce7f3', text: '#9d174d', accent: '#f472b6' },
  purple: { bg: '#f3e8ff', text: '#6b21a8', accent: '#a78bfa' },
  orange: { bg: '#ffedd5', text: '#9a3412', accent: '#f59e42' },
  white:  { bg: '#f8f8f8', text: '#333333', accent: '#d4d4d4' },
  dark:   { bg: '#3a3a3a', text: '#e5e5e5', accent: '#777777' },
}

export const NOTE_FONTS: Record<NoteFont, string> = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  rounded: '"Nunito", "Quicksand", system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  marker: '"Caveat", "Comic Sans MS", cursive',
  handwritten: '"Dancing Script", "Pacifico", cursive',
}

export type GroupColorId = 'blue' | 'green' | 'amber' | 'rose' | 'slate'

export const GROUP_COLOR_ORDER: GroupColorId[] = ['blue', 'green', 'amber', 'rose', 'slate']

export const GROUP_COLORS: Record<GroupColorId, { swatch: string; border: string; background: string; text: string }> = {
  blue: {
    swatch: '#4a9eff',
    border: '#4a9effcc',
    background: 'rgba(74, 158, 255, 0.10)',
    text: '#7db6ff',
  },
  green: {
    swatch: '#2fbf71',
    border: '#2fbf71cc',
    background: 'rgba(47, 191, 113, 0.10)',
    text: '#74dca0',
  },
  amber: {
    swatch: '#f0a53a',
    border: '#f0a53acc',
    background: 'rgba(240, 165, 58, 0.10)',
    text: '#ffc875',
  },
  rose: {
    swatch: '#e56b8c',
    border: '#e56b8ccc',
    background: 'rgba(229, 107, 140, 0.10)',
    text: '#f2a1b8',
  },
  slate: {
    swatch: '#8a94a6',
    border: '#8a94a6cc',
    background: 'rgba(138, 148, 166, 0.10)',
    text: '#c3cad4',
  },
}

export interface TileGroup {
  id: string
  name: string
  colorId: GroupColorId
  tileIds: string[]
  locked?: boolean
}

export interface TileSizePreset {
  defaultWidth: number
  defaultHeight: number
  minWidth: number
  minHeight: number
}

export const TILE_SIZE_PRESETS: Record<TileType, TileSizePreset> = {
  terminal: { defaultWidth: 900, defaultHeight: 400, minWidth: 900, minHeight: 400 },
  note: { defaultWidth: 900, defaultHeight: 800, minWidth: 900, minHeight: 800 },
  browser: { defaultWidth: 1800, defaultHeight: 800, minWidth: 1800, minHeight: 800 },
  timer: { defaultWidth: 900, defaultHeight: 400, minWidth: 900, minHeight: 400 },
  files: { defaultWidth: 1200, defaultHeight: 800, minWidth: 900, minHeight: 500 },
}

export function getTileSizePreset(type: TileType): TileSizePreset {
  return TILE_SIZE_PRESETS[type]
}

export function getDefaultTileSize(type: TileType): { width: number; height: number } {
  const preset = getTileSizePreset(type)
  return {
    width: preset.defaultWidth,
    height: preset.defaultHeight,
  }
}

export function normalizeTileSize(type: TileType, size: { width: number; height: number }): { width: number; height: number } {
  const preset = getTileSizePreset(type)
  const width = Number.isFinite(size.width) ? size.width : preset.minWidth
  const height = Number.isFinite(size.height) ? size.height : preset.minHeight
  return {
    width: Math.max(preset.minWidth, width),
    height: Math.max(preset.minHeight, height),
  }
}

export const NOTE_TILE_DEFAULT_WIDTH = TILE_SIZE_PRESETS.note.defaultWidth
export const NOTE_TILE_DEFAULT_HEIGHT = TILE_SIZE_PRESETS.note.defaultHeight
export const NOTE_TILE_MIN_WIDTH = TILE_SIZE_PRESETS.note.minWidth
export const NOTE_TILE_MIN_HEIGHT = TILE_SIZE_PRESETS.note.minHeight

export type NoteBlocks = import('@blocknote/core').PartialBlock[]

// ─── Tile State ────────────────────────────────────────────────────────────

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface DetachedGridPlacement {
  rootNode?: GridLayoutNode | null
}

export interface TileFloatingState {
  detached: true
  bounds?: WindowBounds
  gridPlacement?: DetachedGridPlacement
}

export interface FloatingNavigationRequest {
  kind: 'file' | 'browser'
  target: string
  fileMarkdownView?: MarkdownViewMode
  fileReveal?: { line: number; column?: number; endLine?: number }
}

export interface FloatingNavigationEvent extends FloatingNavigationRequest {
  workspaceId: string
}

export interface TileState {
  id: string
  type: TileType
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  label?: string
  locked?: boolean
  notificationsMuted?: boolean
  radiusIndex?: number
  groupId?: string
  floating?: TileFloatingState

  // Terminal-specific
  shellProfileId?: ShellProfileId
  terminalConnection?: TerminalConnectionKind
  startupCommand?: string
  agent?: TerminalAgentMetadata

  // Note-specific
  noteKind?: NoteKind
  noteColor?: NoteColor
  noteFont?: NoteFont
  noteContent?: string
  markdown?: string
  markdownView?: MarkdownViewMode

  // Browser-specific
  browserUrl?: string

  // Files-specific
  filePath?: string
  fileDiff?: { repositoryPath: string; path: string; originalPath?: string; staged: boolean }
  filePreview?: boolean
  fileDraft?: string
  /** SHA-256 revision expected by a subsequent write. */
  fileVersion?: string
  /** File metadata token used to detect external changes. */
  fileChangeToken?: string
  fileMarkdownView?: MarkdownViewMode
  /** One-shot editor navigation request; removed by canvas persistence normalization. */
  fileRevealRequest?: { id: string; line: number; column?: number; endLine?: number }

  // Timer-specific
  timerDurationMs?: number
  timerRemainingMs?: number
  timerStatus?: TimerStatus
  timerEndsAt?: number
  timerCompletedAt?: number
  timerNotifiedAt?: number
}

// ─── Canvas State ──────────────────────────────────────────────────────────

export interface CanvasState {
  tiles: TileState[]
  groups: TileGroup[]
  viewport: Viewport
  nextZIndex: number
  focusedTileId: string | null
  viewMode: ViewMode
  fullviewActiveTileId: string | null
  /** Legacy persisted layouts may omit this presentation property. */
  boardVisible?: boolean
  splitViewState?: SplitViewState
}

export type CanvasViewMode = 'canvas' | 'fullview' | 'splitview' | 'board'
export type GridViewMode = 'gridview' | 'fullview' | 'splitview' | 'board'
export type ViewMode = CanvasViewMode | GridViewMode

export type SplitPanelId = 'left' | 'right'
export type SplitOrientation = 'vertical' | 'horizontal'

export interface SplitViewState {
  leftTileIds: string[]
  rightTileIds: string[]
  activeLeftTileId: string | null
  activeRightTileId: string | null
  focusedPanel: SplitPanelId
  orientation: SplitOrientation
}

export const GRID_MAX_TILES = 24

export interface GridLayoutLeafNode {
  id: string
  type: 'leaf'
  tileId: string
}

export interface GridLayoutSplitNode {
  id: string
  type: 'split'
  direction: 'row' | 'column'
  children: GridLayoutNode[]
  sizes: number[]
}

export type GridLayoutNode = GridLayoutLeafNode | GridLayoutSplitNode

export interface GridViewState {
  rootNode: GridLayoutNode | null
}

export interface GridWorkspaceState {
  tiles: TileState[]
  nextZIndex: number
  focusedTileId: string | null
  fullviewActiveTileId: string | null
  viewMode: GridViewMode
  /** Legacy persisted layouts may omit this presentation property. */
  boardVisible?: boolean
  gridViewState: GridViewState
  splitViewState?: SplitViewState
}

export interface Viewport {
  tx: number
  ty: number
  zoom: number
}
