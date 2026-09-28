import type { TerminalThemeColors } from './terminalThemes'

export const COLOR_PRESET_IDS = ['dracula', 'nord', 'tokyo-night', 'catppuccin-mocha', 'gruvbox-dark'] as const
export type ColorPresetId = typeof COLOR_PRESET_IDS[number]
export type AppThemeId = 'default' | ColorPresetId

const DEFAULT_DARK = {
  '--black': '#000000',
  '--surface': '#111111',
  '--surface-raised': '#1a1a1a',
  '--surface-panel': '#151515',
  '--surface-accent': '#1f1f1f',
  '--border': '#222222',
  '--border-visible': '#333333',
  '--text-disabled': '#666666',
  '--text-secondary': '#999999',
  '--text-primary': '#e8e8e8',
  '--text-display': '#ffffff',
  '--accent': '#d71921',
  '--accent-subtle': 'rgba(215, 25, 33, 0.16)',
  '--success': '#4a9e5c',
  '--warning': '#d4a843',
  '--interactive': '#5b9bf6',
  '--bg-primary': 'var(--black)',
  '--bg-secondary': 'var(--surface)',
  '--bg-tertiary': 'var(--surface-raised)',
  '--bg-elevated': 'var(--surface-panel)',
  '--text-muted': 'var(--text-disabled)',
  '--border-color': 'var(--border)',
  '--border-subtle': 'var(--border-visible)',
  '--accent-hover': '#ef3f47',
  '--accent-text': 'var(--black)',
  '--statusbar-bg': 'var(--surface)',
  '--statusbar-text': 'var(--text-primary)',
  '--hover-bg': 'rgba(255, 255, 255, 0.04)',
  '--active-bg': 'rgba(255, 255, 255, 0.08)',
  '--danger': 'var(--accent)',
  '--danger-hover': '#ef3f47',
  '--shadow': 'rgba(0, 0, 0, 0)',
  '--scrollbar-thumb': '#2c2c2c',
  '--scrollbar-hover': '#414141',
  '--selection': 'rgba(255, 255, 255, 0.12)',
}

const DEFAULT_LIGHT: typeof DEFAULT_DARK = {
  ...DEFAULT_DARK,
  '--black': '#f5f5f5',
  '--surface': '#ffffff',
  '--surface-raised': '#f0f0f0',
  '--surface-panel': '#fafafa',
  '--surface-accent': '#efefef',
  '--border': '#e8e8e8',
  '--border-visible': '#cccccc',
  '--text-disabled': '#999999',
  '--text-secondary': '#666666',
  '--text-primary': '#1a1a1a',
  '--text-display': '#000000',
  '--interactive': '#007aff',
  '--accent-text': 'var(--surface)',
  '--hover-bg': 'rgba(0, 0, 0, 0.04)',
  '--active-bg': 'rgba(0, 0, 0, 0.08)',
  '--scrollbar-thumb': '#c8c8c8',
  '--scrollbar-hover': '#a8a8a8',
  '--selection': 'rgba(0, 0, 0, 0.08)',
}

export type AppThemeTokens = typeof DEFAULT_DARK

function hexToRgba(value: string, alpha: number): string | null {
  const match = /^#([\da-f]{6})$/i.exec(value)
  if (!match) return null
  const hex = match[1]
  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function getTranslucentThemeTokens(tokens: AppThemeTokens, light = false): AppThemeTokens {
  const alphaByToken: Record<string, number> = {
    '--black': light ? 0.12 : 0.08,
    '--surface': light ? 0.72 : 0.56,
    '--surface-raised': light ? 0.76 : 0.62,
    '--surface-panel': light ? 0.74 : 0.58,
    '--surface-accent': light ? 0.76 : 0.62,
    '--statusbar-bg': light ? 0.72 : 0.56,
    '--bg-primary': light ? 0.12 : 0.08,
    '--bg-secondary': light ? 0.72 : 0.56,
    '--bg-tertiary': light ? 0.76 : 0.62,
    '--bg-elevated': light ? 0.74 : 0.58,
  }
  const result: Record<keyof AppThemeTokens, string> = { ...tokens }
  for (const [token, alpha] of Object.entries(alphaByToken)) {
    const color = tokens[token as keyof AppThemeTokens]
    if (!color.startsWith('var(')) result[token as keyof AppThemeTokens] = hexToRgba(color, alpha) ?? color
  }
  return result as AppThemeTokens
}

interface ColorPreset {
  id: ColorPresetId
  label: string
  tokens: AppThemeTokens
  terminal: TerminalThemeColors
}

// Semantic tokens keep components independent of individual palette names.
function createTokens(background: string, surface: string, raised: string, border: string, foreground: string, secondary: string, muted: string, accent: string, terminal: TerminalThemeColors): AppThemeTokens {
  return {
    ...DEFAULT_DARK,
    '--black': background,
    '--surface': surface,
    '--surface-raised': raised,
    '--surface-panel': surface,
    '--surface-accent': raised,
    '--border': raised,
    '--border-visible': border,
    '--text-disabled': muted,
    '--text-secondary': secondary,
    '--text-primary': foreground,
    '--text-display': foreground,
    '--accent': accent,
    '--accent-subtle': `${accent}29`,
    '--accent-hover': foreground,
    '--success': terminal.green,
    '--warning': terminal.yellow,
    '--interactive': terminal.blue,
    '--danger': terminal.red,
    '--danger-hover': terminal.brightRed,
    '--scrollbar-thumb': border,
    '--scrollbar-hover': muted,
    '--selection': terminal.selectionBackground,
  }
}

const DRACULA_TERMINAL: TerminalThemeColors = {
  background: '#282a36',
  foreground: '#f8f8f2',
  cursor: '#f8f8f2',
  cursorAccent: '#282a36',
  selectionBackground: '#bd93f940',
  black: '#21222c',
  red: '#ff5555',
  green: '#50fa7b',
  yellow: '#f1fa8c',
  blue: '#bd93f9',
  magenta: '#ff79c6',
  cyan: '#8be9fd',
  white: '#f8f8f2',
  brightBlack: '#6272a4',
  brightRed: '#ff6e6e',
  brightGreen: '#69ff94',
  brightYellow: '#ffffa5',
  brightBlue: '#d6acff',
  brightMagenta: '#ff92df',
  brightCyan: '#a4ffff',
  brightWhite: '#ffffff',
}

const NORD_TERMINAL: TerminalThemeColors = {
  background: '#2e3440',
  foreground: '#eceff4',
  cursor: '#eceff4',
  cursorAccent: '#2e3440',
  selectionBackground: '#88c0d040',
  black: '#3b4252',
  red: '#bf616a',
  green: '#a3be8c',
  yellow: '#ebcb8b',
  blue: '#81a1c1',
  magenta: '#b48ead',
  cyan: '#88c0d0',
  white: '#e5e9f0',
  brightBlack: '#4c566a',
  brightRed: '#bf616a',
  brightGreen: '#a3be8c',
  brightYellow: '#ebcb8b',
  brightBlue: '#81a1c1',
  brightMagenta: '#b48ead',
  brightCyan: '#8fbcbb',
  brightWhite: '#eceff4',
}

const TOKYO_NIGHT_TERMINAL: TerminalThemeColors = {
  background: '#1a1b26',
  foreground: '#c0caf5',
  cursor: '#c0caf5',
  cursorAccent: '#1a1b26',
  selectionBackground: '#7aa2f740',
  black: '#15161e',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#a9b1d6',
  brightBlack: '#414868',
  brightRed: '#f7768e',
  brightGreen: '#9ece6a',
  brightYellow: '#e0af68',
  brightBlue: '#7aa2f7',
  brightMagenta: '#bb9af7',
  brightCyan: '#7dcfff',
  brightWhite: '#c0caf5',
}

const CATPPUCCIN_MOCHA_TERMINAL: TerminalThemeColors = {
  background: '#1e1e2e',
  foreground: '#cdd6f4',
  cursor: '#cdd6f4',
  cursorAccent: '#1e1e2e',
  selectionBackground: '#cba6f740',
  black: '#45475a',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#f5c2e7',
  cyan: '#94e2d5',
  white: '#bac2de',
  brightBlack: '#585b70',
  brightRed: '#f38ba8',
  brightGreen: '#a6e3a1',
  brightYellow: '#f9e2af',
  brightBlue: '#89b4fa',
  brightMagenta: '#f5c2e7',
  brightCyan: '#94e2d5',
  brightWhite: '#a6adc8',
}

const GRUVBOX_DARK_TERMINAL: TerminalThemeColors = {
  background: '#282828',
  foreground: '#ebdbb2',
  cursor: '#ebdbb2',
  cursorAccent: '#282828',
  selectionBackground: '#fabd2f40',
  black: '#282828',
  red: '#cc241d',
  green: '#98971a',
  yellow: '#d79921',
  blue: '#458588',
  magenta: '#b16286',
  cyan: '#689d6a',
  white: '#a89984',
  brightBlack: '#928374',
  brightRed: '#fb4934',
  brightGreen: '#b8bb26',
  brightYellow: '#fabd2f',
  brightBlue: '#83a598',
  brightMagenta: '#d3869b',
  brightCyan: '#8ec07c',
  brightWhite: '#ebdbb2',
}

export const COLOR_PRESETS: Record<ColorPresetId, ColorPreset> = {
  'dracula': {
    id: 'dracula',
    label: 'Dracula',
    tokens: createTokens('#21222c', '#282a36', '#343746', '#44475a', '#f8f8f2', '#b8b9ce', '#9193aa', '#bd93f9', DRACULA_TERMINAL),
    terminal: DRACULA_TERMINAL,
  },
  'nord': {
    id: 'nord',
    label: 'Nord',
    tokens: createTokens('#242933', '#2e3440', '#3b4252', '#4c566a', '#eceff4', '#d8dee9', '#a5b1c2', '#88c0d0', NORD_TERMINAL),
    terminal: NORD_TERMINAL,
  },
  'tokyo-night': {
    id: 'tokyo-night',
    label: 'Tokyo Night',
    tokens: createTokens('#16161e', '#1a1b26', '#24283b', '#414868', '#c0caf5', '#a9b1d6', '#9aa5ce', '#7aa2f7', TOKYO_NIGHT_TERMINAL),
    terminal: TOKYO_NIGHT_TERMINAL,
  },
  'catppuccin-mocha': {
    id: 'catppuccin-mocha',
    label: 'Catppuccin Mocha',
    tokens: createTokens('#11111b', '#1e1e2e', '#313244', '#45475a', '#cdd6f4', '#bac2de', '#a6adc8', '#cba6f7', CATPPUCCIN_MOCHA_TERMINAL),
    terminal: CATPPUCCIN_MOCHA_TERMINAL,
  },
  'gruvbox-dark': {
    id: 'gruvbox-dark',
    label: 'Gruvbox Dark',
    tokens: createTokens('#1d2021', '#282828', '#3c3836', '#504945', '#ebdbb2', '#d5c4a1', '#bdae93', '#fabd2f', GRUVBOX_DARK_TERMINAL),
    terminal: GRUVBOX_DARK_TERMINAL,
  },
}

export function normalizeAppThemeId(value: unknown): AppThemeId {
  return typeof value === 'string' && COLOR_PRESET_IDS.includes(value as ColorPresetId)
    ? value as ColorPresetId
    : 'default'
}

export function getAppThemeTokens(value: unknown, light = false): AppThemeTokens {
  const id = normalizeAppThemeId(value)
  return id === 'default' ? (light ? DEFAULT_LIGHT : DEFAULT_DARK) : COLOR_PRESETS[id].tokens
}

export const APP_THEMES = [
  { id: 'default' as const, label: 'Default', tokens: DEFAULT_DARK },
  ...COLOR_PRESET_IDS.map((id) => COLOR_PRESETS[id]),
]
