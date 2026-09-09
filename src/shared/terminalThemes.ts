import { COLOR_PRESET_IDS, COLOR_PRESETS } from './appThemes'

export const TERMINAL_THEME_IDS = ['yira-default', 'classic-dark', 'light', 'high-contrast', ...COLOR_PRESET_IDS] as const

export type TerminalThemeId = typeof TERMINAL_THEME_IDS[number]

export interface TerminalThemeColors {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export interface TerminalThemeDefinition {
  id: TerminalThemeId
  label: string
  colors: TerminalThemeColors
}

export const DEFAULT_TERMINAL_THEME_ID: TerminalThemeId = 'yira-default'

const TERMINAL_THEME_MAP: Record<TerminalThemeId, TerminalThemeDefinition> = {
  'dracula': { id: 'dracula', label: COLOR_PRESETS['dracula'].label, colors: COLOR_PRESETS['dracula'].terminal },
  'nord': { id: 'nord', label: COLOR_PRESETS['nord'].label, colors: COLOR_PRESETS['nord'].terminal },
  'tokyo-night': { id: 'tokyo-night', label: COLOR_PRESETS['tokyo-night'].label, colors: COLOR_PRESETS['tokyo-night'].terminal },
  'catppuccin-mocha': { id: 'catppuccin-mocha', label: COLOR_PRESETS['catppuccin-mocha'].label, colors: COLOR_PRESETS['catppuccin-mocha'].terminal },
  'gruvbox-dark': { id: 'gruvbox-dark', label: COLOR_PRESETS['gruvbox-dark'].label, colors: COLOR_PRESETS['gruvbox-dark'].terminal },
  'yira-default': {
    id: 'yira-default',
    label: 'Default',
    colors: {
      background: '#111111',
      foreground: '#e8e8e8',
      cursor: '#ffffff',
      cursorAccent: '#111111',
      selectionBackground: 'rgba(255,255,255,0.14)',
      black: '#000000',
      red: '#d71921',
      green: '#4a9e5c',
      yellow: '#d4a843',
      blue: '#5b9bf6',
      magenta: '#c88cff',
      cyan: '#7ed9d1',
      white: '#e5e5e5',
      brightBlack: '#666666',
      brightRed: '#ef3f47',
      brightGreen: '#77c989',
      brightYellow: '#f0c461',
      brightBlue: '#9bc0ff',
      brightMagenta: '#e0aaff',
      brightCyan: '#a3eee8',
      brightWhite: '#ffffff',
    },
  },
  'classic-dark': {
    id: 'classic-dark',
    label: 'Classic Dark',
    colors: {
      background: '#0b0d10',
      foreground: '#d7dee8',
      cursor: '#f8fafc',
      cursorAccent: '#0b0d10',
      selectionBackground: 'rgba(125,145,170,0.28)',
      black: '#151922',
      red: '#f87171',
      green: '#86efac',
      yellow: '#facc15',
      blue: '#60a5fa',
      magenta: '#c084fc',
      cyan: '#22d3ee',
      white: '#d7dee8',
      brightBlack: '#64748b',
      brightRed: '#fca5a5',
      brightGreen: '#bbf7d0',
      brightYellow: '#fde047',
      brightBlue: '#93c5fd',
      brightMagenta: '#d8b4fe',
      brightCyan: '#67e8f9',
      brightWhite: '#f8fafc',
    },
  },
  light: {
    id: 'light',
    label: 'Light',
    colors: {
      background: '#f7f7f2',
      foreground: '#20242a',
      cursor: '#20242a',
      cursorAccent: '#f7f7f2',
      selectionBackground: 'rgba(79,107,146,0.24)',
      black: '#20242a',
      red: '#b42318',
      green: '#157f3b',
      yellow: '#9a6700',
      blue: '#175cd3',
      magenta: '#9333ea',
      cyan: '#087e8b',
      white: '#e6e6df',
      brightBlack: '#667085',
      brightRed: '#d92d20',
      brightGreen: '#16a34a',
      brightYellow: '#ca8a04',
      brightBlue: '#2563eb',
      brightMagenta: '#a855f7',
      brightCyan: '#0891b2',
      brightWhite: '#ffffff',
    },
  },
  'high-contrast': {
    id: 'high-contrast',
    label: 'High Contrast',
    colors: {
      background: '#000000',
      foreground: '#ffffff',
      cursor: '#ffffff',
      cursorAccent: '#000000',
      selectionBackground: 'rgba(255,255,255,0.34)',
      black: '#000000',
      red: '#ff4b4b',
      green: '#00ff66',
      yellow: '#ffff00',
      blue: '#3b82ff',
      magenta: '#ff66ff',
      cyan: '#00ffff',
      white: '#ffffff',
      brightBlack: '#8a8a8a',
      brightRed: '#ff8a8a',
      brightGreen: '#7dff9f',
      brightYellow: '#ffff7a',
      brightBlue: '#8ab4ff',
      brightMagenta: '#ff9cff',
      brightCyan: '#8affff',
      brightWhite: '#ffffff',
    },
  },
}

export const TERMINAL_THEMES: TerminalThemeDefinition[] = TERMINAL_THEME_IDS.map((id) => TERMINAL_THEME_MAP[id])

export function isTerminalThemeId(value: unknown): value is TerminalThemeId {
  return typeof value === 'string' && TERMINAL_THEME_IDS.includes(value as TerminalThemeId)
}

export function normalizeTerminalThemeId(value: unknown): TerminalThemeId {
  return isTerminalThemeId(value) ? value : DEFAULT_TERMINAL_THEME_ID
}

export function getTerminalTheme(value: unknown): TerminalThemeDefinition {
  return TERMINAL_THEME_MAP[normalizeTerminalThemeId(value)]
}
