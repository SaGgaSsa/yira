import type { TerminalThemeId } from './terminalThemes'

// ─── Workspace ─────────────────────────────────────────────────────────────

export type WorkspaceType = 'canvas' | 'grid'

export interface RemoteTerminalConfig {
  host: string
  user: string
  port?: number
}

export interface Workspace {
  id: string
  name: string
  config: WorkspaceConfig
  /** Internal storage location for persisted Yira state. */
  path: string
}

/** Config-only workspace data used for selectors and workspace editing. */
export type WorkspaceMetadata = Workspace

export interface WorkspaceConfig {
  type: WorkspaceType
  rootFolderPath?: string
  initialCommand?: string
  terminalHistoryEnabled?: boolean
  remoteTerminal?: RemoteTerminalConfig
}

export interface WorkspaceCreateInput {
  type?: WorkspaceType
  name: string
  rootFolderPath?: string
  initialCommand?: string
  terminalHistoryEnabled?: boolean
  remoteTerminal?: RemoteTerminalConfig
}

export interface WorkspaceManagementEntry {
  id?: string
  name: string
  type?: WorkspaceType
  rootFolderPath?: string
  initialCommand?: string
  terminalHistoryEnabled?: boolean
  remoteTerminal?: RemoteTerminalConfig
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
  config?: Partial<WorkspaceConfig>
}

export interface Config {
  workspaces: WorkspaceMetadata[]
  activeWorkspaceId: string
  settings: AppSettings
}

// ─── App Settings ──────────────────────────────────────────────────────────

export type AppearanceMode = 'dark' | 'light' | 'system'
export type ConfigurableTileCreationType = 'note' | 'browser' | 'timer' | 'files'

export type TileCreationAvailability = Record<ConfigurableTileCreationType, boolean>

export interface UserSettings {
  appearance: AppearanceMode
  interfaceFontSizePx: number
  tileFontSizePx: number
  showGrid: boolean
  snapToGrid: boolean
  gridSize: number
  browser: {
    homeUrl: string
  }
  terminal: {
    attentionEnabled: boolean
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
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  appearance: 'dark',
  interfaceFontSizePx: 16,
  tileFontSizePx: 16,
  showGrid: true,
  snapToGrid: true,
  gridSize: 20,
  browser: {
    homeUrl: 'about:blank',
  },
  terminal: {
    attentionEnabled: true,
    themeId: 'yira-default',
  },
  notifications: {
    attentionDelayEnabled: true,
  },
  tiles: {
    creationAvailability: {
      note: true,
      browser: true,
      timer: false,
      files: false,
    },
  },
  groups: {
    enabled: false,
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

export interface FileSelectFolderResult {
  path: string
  name: string
}

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

export const NOTE_COLORS: Record<NoteColor, { bg: string; text: string }> = {
  yellow: { bg: '#fef3c7', text: '#78350f' },
  green:  { bg: '#dcfce7', text: '#166534' },
  blue:   { bg: '#dbeafe', text: '#1e40af' },
  pink:   { bg: '#fce7f3', text: '#9d174d' },
  purple: { bg: '#f3e8ff', text: '#6b21a8' },
  orange: { bg: '#ffedd5', text: '#9a3412' },
  white:  { bg: '#f8f8f8', text: '#333333' },
  dark:   { bg: '#3a3a3a', text: '#e5e5e5' },
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
  files: { defaultWidth: 900, defaultHeight: 400, minWidth: 900, minHeight: 400 },
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

  // Note-specific
  noteKind?: NoteKind
  noteColor?: NoteColor
  noteFont?: NoteFont
  noteContent?: string
  markdown?: string
  markdownView?: MarkdownViewMode

  // Browser-specific
  browserUrl?: string

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
  splitViewState?: SplitViewState
}

export type CanvasViewMode = 'canvas' | 'fullview' | 'splitview' | 'board'
export type GridViewMode = 'gridview' | 'fullview' | 'board'
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
  gridViewState: GridViewState
}

export interface Viewport {
  tx: number
  ty: number
  zoom: number
}
