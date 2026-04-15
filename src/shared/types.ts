// ─── Workspace ─────────────────────────────────────────────────────────────

export interface Workspace {
  id: string
  name: string
  path: string
}

export interface Config {
  workspaces: Workspace[]
  activeWorkspaceId: string
  settings: AppSettings
}

// ─── App Settings ──────────────────────────────────────────────────────────

export type AppearanceMode = 'dark' | 'light' | 'system'
export type FontSize = 'small' | 'medium' | 'large'

export interface UserSettings {
  appearance: AppearanceMode
  fontSize: FontSize
  showGrid: boolean
  snapToGrid: boolean
  gridSize: number
  browser: {
    homeUrl: string
  }
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  appearance: 'dark',
  fontSize: 'medium',
  showGrid: true,
  snapToGrid: true,
  gridSize: 20,
  browser: {
    homeUrl: 'https://example.com',
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

// ─── Shell Profiles ────────────────────────────────────────────────────────

export type ShellProfileId = 'powershell' | 'cmd' | 'wsl' | 'bash' | 'zsh' | 'fish'

export interface ShellProfile {
  id: ShellProfileId
  label: string
  shell: string      // executable name or path
  args: string[]
  available: boolean
}

export interface TerminalCreateOptions {
  shellProfileId: ShellProfileId
  workspaceDir?: string
  wslStartInHome?: boolean
  initialCommand?: string
}

// ─── Tile Types ────────────────────────────────────────────────────────────

export type TileType = 'terminal' | 'note' | 'browser' | 'kanban'
export type KanbanColumnId = 'backlog' | 'in_development' | 'review' | 'done'
export type KanbanCardColor = 'slate' | 'blue' | 'green' | 'amber' | 'rose'

export type NoteColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple' | 'orange' | 'white' | 'dark'
export type NoteFont = 'sans' | 'rounded' | 'serif' | 'marker' | 'handwritten'

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

export const KANBAN_COLUMNS: Array<{ id: KanbanColumnId; label: string }> = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'in_development', label: 'In Development' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
]

export const KANBAN_COLUMN_WIDTH = 280
export const KANBAN_COLUMN_GAP = 16
export const KANBAN_BOARD_PADDING_X = 32
export const KANBAN_BOARD_EDGE_ALLOWANCE = 24
export const KANBAN_BOARD_FIXED_WIDTH =
  KANBAN_COLUMNS.length * KANBAN_COLUMN_WIDTH +
  (KANBAN_COLUMNS.length - 1) * KANBAN_COLUMN_GAP +
  KANBAN_BOARD_PADDING_X +
  KANBAN_BOARD_EDGE_ALLOWANCE

export const KANBAN_CARD_COLORS: Record<KanbanCardColor, { bg: string; border: string; text: string }> = {
  slate: { bg: '#232833', border: '#3b4556', text: '#d5d9e3' },
  blue: { bg: '#16263a', border: '#2f5f91', text: '#cfe5ff' },
  green: { bg: '#182d25', border: '#2f6b55', text: '#d6f5e7' },
  amber: { bg: '#362715', border: '#926428', text: '#ffe8c2' },
  rose: { bg: '#351c26', border: '#8e405b', text: '#ffd6e2' },
}

export interface KanbanCard {
  id: string
  title: string
  description: string
  color: KanbanCardColor
}

export interface KanbanBoardState {
  columns: Record<KanbanColumnId, KanbanCard[]>
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
  terminal?: {
    wslStartupCommand?: string
  }
}

// ─── Tile State ────────────────────────────────────────────────────────────

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
  hideTitlebar?: boolean
  radiusIndex?: number
  groupId?: string

  // Terminal-specific
  shellProfileId?: ShellProfileId
  startupCommand?: string

  // Note-specific
  noteColor?: NoteColor
  noteFont?: NoteFont
  noteContent?: string

  // Browser-specific
  browserUrl?: string
}

// ─── Canvas State ──────────────────────────────────────────────────────────

export interface CanvasState {
  tiles: TileState[]
  groups: TileGroup[]
  viewport: Viewport
  nextZIndex: number
  focusedTileId: string | null
  viewMode: 'canvas' | 'fullview'
  fullviewActiveTileId: string | null
}

export interface Viewport {
  tx: number
  ty: number
  zoom: number
}
