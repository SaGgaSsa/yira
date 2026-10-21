import type { TerminalThemeColors } from './terminalThemes'

export const COLOR_PRESET_IDS = ['dracula', 'nord', 'tokyo-night', 'catppuccin-mocha', 'gruvbox-dark', 'one-dark', 'rose-pine', 'kanagawa', 'everforest-dark', 'solarized-dark', 'catppuccin-latte', 'rose-pine-dawn', 'solarized-light'] as const
export type ColorPresetId = typeof COLOR_PRESET_IDS[number]
export type AppThemeId = 'default' | ColorPresetId

const DEFAULT_DARK = {
  '--black': '#000000',
  '--text-inverse': '#000000',
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
  '--accent': '#22d3ee',
  '--accent-subtle': 'rgba(34, 211, 238, 0.16)',
  '--success': '#4a9e5c',
  '--warning': '#d4a843',
  '--interactive': '#5b9bf6',
  '--activity': '#22d3ee',
  '--bg-primary': 'var(--black)',
  '--bg-secondary': 'var(--surface)',
  '--bg-tertiary': 'var(--surface-raised)',
  '--bg-elevated': 'var(--surface-panel)',
  '--text-muted': 'var(--text-disabled)',
  '--border-color': 'var(--border)',
  '--border-subtle': 'var(--border-visible)',
  '--accent-hover': '#67e8f9',
  '--accent-text': 'var(--black)',
  '--statusbar-bg': 'var(--surface)',
  '--statusbar-text': 'var(--text-primary)',
  '--hover-bg': 'rgba(255, 255, 255, 0.04)',
  '--active-bg': 'rgba(255, 255, 255, 0.08)',
  '--danger': '#d71921',
  '--danger-hover': '#ef3f47',
  '--shadow': 'rgba(0, 0, 0, 0)',
  '--scrollbar-thumb': '#2c2c2c',
  '--scrollbar-hover': '#414141',
  '--selection': 'rgba(255, 255, 255, 0.12)',
}

const DEFAULT_LIGHT: typeof DEFAULT_DARK = {
  ...DEFAULT_DARK,
  '--black': '#f5f5f5',
  '--text-inverse': '#f5f5f5',
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
  '--activity': '#0891b2',
  '--accent': '#0891b2',
  '--accent-subtle': 'rgba(8, 145, 178, 0.16)',
  '--accent-hover': '#0e7490',
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
    '--black': light ? 0.06 : 0.08,
    '--surface': light ? 0.48 : 0.56,
    '--surface-raised': light ? 0.58 : 0.62,
    '--surface-panel': light ? 0.52 : 0.58,
    '--surface-accent': light ? 0.58 : 0.62,
    '--statusbar-bg': light ? 0.48 : 0.56,
    '--bg-primary': light ? 0.06 : 0.08,
    '--bg-secondary': light ? 0.48 : 0.56,
    '--bg-tertiary': light ? 0.58 : 0.62,
    '--bg-elevated': light ? 0.52 : 0.58,
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
  light: boolean
  tokens: AppThemeTokens
  terminal: TerminalThemeColors
}

// Semantic tokens keep components independent of individual palette names.
// Light palettes start from DEFAULT_LIGHT: dark hover/active overlays and accent text on the surface color.
function createTokens(background: string, surface: string, raised: string, border: string, foreground: string, secondary: string, muted: string, accent: string, terminal: TerminalThemeColors, light = false): AppThemeTokens {
  return {
    ...(light ? DEFAULT_LIGHT : DEFAULT_DARK),
    '--black': background,
    '--text-inverse': background,
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
    '--activity': terminal.cyan,
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

const ONE_DARK_TERMINAL: TerminalThemeColors = {
  background: '#282c34',
  foreground: '#abb2bf',
  cursor: '#abb2bf',
  cursorAccent: '#282c34',
  selectionBackground: '#61afef40',
  black: '#21252b',
  red: '#e06c75',
  green: '#98c379',
  yellow: '#e5c07b',
  blue: '#61afef',
  magenta: '#c678dd',
  cyan: '#56b6c2',
  white: '#abb2bf',
  brightBlack: '#767676',
  brightRed: '#e06c75',
  brightGreen: '#98c379',
  brightYellow: '#e5c07b',
  brightBlue: '#61afef',
  brightMagenta: '#c678dd',
  brightCyan: '#56b6c2',
  brightWhite: '#abb2bf',
}

const ROSE_PINE_TERMINAL: TerminalThemeColors = {
  background: '#1f1d2e',
  foreground: '#e0def4',
  cursor: '#e0def4',
  cursorAccent: '#1f1d2e',
  selectionBackground: '#c4a7e740',
  black: '#26233a',
  red: '#eb6f92',
  green: '#31748f',
  yellow: '#f6c177',
  blue: '#9ccfd8',
  magenta: '#c4a7e7',
  cyan: '#ebbcba',
  white: '#e0def4',
  brightBlack: '#6e6a86',
  brightRed: '#eb6f92',
  brightGreen: '#31748f',
  brightYellow: '#f6c177',
  brightBlue: '#9ccfd8',
  brightMagenta: '#c4a7e7',
  brightCyan: '#ebbcba',
  brightWhite: '#e0def4',
}

const KANAGAWA_TERMINAL: TerminalThemeColors = {
  background: '#1f1f28',
  foreground: '#dcd7ba',
  cursor: '#dcd7ba',
  cursorAccent: '#1f1f28',
  selectionBackground: '#7e9cd840',
  black: '#090618',
  red: '#c34043',
  green: '#76946a',
  yellow: '#c0a36e',
  blue: '#7e9cd8',
  magenta: '#957fb8',
  cyan: '#6a9589',
  white: '#c8c093',
  brightBlack: '#727169',
  brightRed: '#e82424',
  brightGreen: '#98bb6c',
  brightYellow: '#e6c384',
  brightBlue: '#7fb4ca',
  brightMagenta: '#938aa9',
  brightCyan: '#7aa89f',
  brightWhite: '#dcd7ba',
}

const EVERFOREST_DARK_TERMINAL: TerminalThemeColors = {
  background: '#2d353b',
  foreground: '#d3c6aa',
  cursor: '#d3c6aa',
  cursorAccent: '#2d353b',
  selectionBackground: '#a7c08040',
  black: '#475258',
  red: '#e67e80',
  green: '#a7c080',
  yellow: '#dbbc7f',
  blue: '#7fbbb3',
  magenta: '#d699b6',
  cyan: '#83c092',
  white: '#d3c6aa',
  brightBlack: '#475258',
  brightRed: '#e67e80',
  brightGreen: '#a7c080',
  brightYellow: '#dbbc7f',
  brightBlue: '#7fbbb3',
  brightMagenta: '#d699b6',
  brightCyan: '#83c092',
  brightWhite: '#d3c6aa',
}

const SOLARIZED_DARK_TERMINAL: TerminalThemeColors = {
  background: '#002b36',
  foreground: '#839496',
  cursor: '#839496',
  cursorAccent: '#002b36',
  selectionBackground: '#268bd240',
  black: '#073642',
  red: '#dc322f',
  green: '#859900',
  yellow: '#b58900',
  blue: '#268bd2',
  magenta: '#d33682',
  cyan: '#2aa198',
  white: '#eee8d5',
  brightBlack: '#335e69',
  brightRed: '#cb4b16',
  brightGreen: '#586e75',
  brightYellow: '#657b83',
  brightBlue: '#839496',
  brightMagenta: '#6c71c4',
  brightCyan: '#93a1a1',
  brightWhite: '#fdf6e3',
}

const CATPPUCCIN_LATTE_TERMINAL: TerminalThemeColors = {
  background: '#eff1f5',
  foreground: '#4c4f69',
  cursor: '#4c4f69',
  cursorAccent: '#eff1f5',
  selectionBackground: '#8839ef40',
  black: '#bcc0cc',
  red: '#d20f39',
  green: '#40a02b',
  yellow: '#df8e1d',
  blue: '#1e66f5',
  magenta: '#ea76cb',
  cyan: '#179299',
  white: '#5c5f77',
  brightBlack: '#acb0be',
  brightRed: '#e7103f',
  brightGreen: '#46b02f',
  brightYellow: '#e49931',
  brightBlue: '#3878f6',
  brightMagenta: '#ef95d7',
  brightCyan: '#19a1a8',
  brightWhite: '#6c6f85',
}

const ROSE_PINE_DAWN_TERMINAL: TerminalThemeColors = {
  background: '#fffaf3',
  foreground: '#575279',
  cursor: '#575279',
  cursorAccent: '#fffaf3',
  selectionBackground: '#907aa940',
  black: '#f2e9e1',
  red: '#b4637a',
  green: '#286983',
  yellow: '#ea9d34',
  blue: '#56949f',
  magenta: '#907aa9',
  cyan: '#d7827e',
  white: '#575279',
  brightBlack: '#9893a5',
  brightRed: '#b4637a',
  brightGreen: '#286983',
  brightYellow: '#ea9d34',
  brightBlue: '#56949f',
  brightMagenta: '#907aa9',
  brightCyan: '#d7827e',
  brightWhite: '#575279',
}

const SOLARIZED_LIGHT_TERMINAL: TerminalThemeColors = {
  background: '#fdf6e3',
  foreground: '#586e75',
  cursor: '#586e75',
  cursorAccent: '#fdf6e3',
  selectionBackground: '#268bd240',
  black: '#073642',
  red: '#dc322f',
  green: '#859900',
  yellow: '#b58900',
  blue: '#268bd2',
  magenta: '#d33682',
  cyan: '#2aa198',
  white: '#bbb5a2',
  brightBlack: '#002b36',
  brightRed: '#cb4b16',
  brightGreen: '#586e75',
  brightYellow: '#657b83',
  brightBlue: '#839496',
  brightMagenta: '#6c71c4',
  brightCyan: '#93a1a1',
  brightWhite: '#fdf6e3',
}

export const COLOR_PRESETS: Record<ColorPresetId, ColorPreset> = {
  'dracula': {
    id: 'dracula',
    label: 'Dracula',
    light: false,
    tokens: createTokens('#21222c', '#282a36', '#343746', '#44475a', '#f8f8f2', '#b8b9ce', '#9193aa', '#bd93f9', DRACULA_TERMINAL),
    terminal: DRACULA_TERMINAL,
  },
  'nord': {
    id: 'nord',
    label: 'Nord',
    light: false,
    tokens: createTokens('#242933', '#2e3440', '#3b4252', '#4c566a', '#eceff4', '#d8dee9', '#a5b1c2', '#88c0d0', NORD_TERMINAL),
    terminal: NORD_TERMINAL,
  },
  'tokyo-night': {
    id: 'tokyo-night',
    label: 'Tokyo Night',
    light: false,
    tokens: createTokens('#16161e', '#1a1b26', '#24283b', '#414868', '#c0caf5', '#a9b1d6', '#9aa5ce', '#7aa2f7', TOKYO_NIGHT_TERMINAL),
    terminal: TOKYO_NIGHT_TERMINAL,
  },
  'catppuccin-mocha': {
    id: 'catppuccin-mocha',
    label: 'Catppuccin Mocha',
    light: false,
    tokens: createTokens('#11111b', '#1e1e2e', '#313244', '#45475a', '#cdd6f4', '#bac2de', '#a6adc8', '#cba6f7', CATPPUCCIN_MOCHA_TERMINAL),
    terminal: CATPPUCCIN_MOCHA_TERMINAL,
  },
  'gruvbox-dark': {
    id: 'gruvbox-dark',
    label: 'Gruvbox Dark',
    light: false,
    tokens: createTokens('#1d2021', '#282828', '#3c3836', '#504945', '#ebdbb2', '#d5c4a1', '#bdae93', '#fabd2f', GRUVBOX_DARK_TERMINAL),
    terminal: GRUVBOX_DARK_TERMINAL,
  },
  'one-dark': {
    id: 'one-dark',
    label: 'One Dark',
    light: false,
    tokens: createTokens('#21252b', '#282c34', '#2c313a', '#3e4451', '#abb2bf', '#9da5b4', '#828997', '#61afef', ONE_DARK_TERMINAL),
    terminal: ONE_DARK_TERMINAL,
  },
  'rose-pine': {
    id: 'rose-pine',
    label: 'Rosé Pine',
    light: false,
    tokens: createTokens('#191724', '#1f1d2e', '#26233a', '#403d52', '#e0def4', '#908caa', '#6e6a86', '#c4a7e7', ROSE_PINE_TERMINAL),
    terminal: ROSE_PINE_TERMINAL,
  },
  'kanagawa': {
    id: 'kanagawa',
    label: 'Kanagawa',
    light: false,
    tokens: createTokens('#16161d', '#1f1f28', '#2a2a37', '#54546d', '#dcd7ba', '#c8c093', '#727169', '#7e9cd8', KANAGAWA_TERMINAL),
    terminal: KANAGAWA_TERMINAL,
  },
  'everforest-dark': {
    id: 'everforest-dark',
    label: 'Everforest Dark',
    light: false,
    tokens: createTokens('#232a2e', '#2d353b', '#343f44', '#475258', '#d3c6aa', '#9da9a0', '#859289', '#a7c080', EVERFOREST_DARK_TERMINAL),
    terminal: EVERFOREST_DARK_TERMINAL,
  },
  'solarized-dark': {
    id: 'solarized-dark',
    label: 'Solarized Dark',
    light: false,
    tokens: createTokens('#002b36', '#002b36', '#073642', '#586e75', '#839496', '#657b83', '#586e75', '#268bd2', SOLARIZED_DARK_TERMINAL),
    terminal: SOLARIZED_DARK_TERMINAL,
  },
  'catppuccin-latte': {
    id: 'catppuccin-latte',
    label: 'Catppuccin Latte',
    light: true,
    tokens: createTokens('#dce0e8', '#eff1f5', '#ccd0da', '#bcc0cc', '#4c4f69', '#5c5f77', '#6c6f85', '#8839ef', CATPPUCCIN_LATTE_TERMINAL, true),
    terminal: CATPPUCCIN_LATTE_TERMINAL,
  },
  'rose-pine-dawn': {
    id: 'rose-pine-dawn',
    label: 'Rosé Pine Dawn',
    light: true,
    tokens: createTokens('#faf4ed', '#fffaf3', '#f2e9e1', '#dfdad9', '#575279', '#797593', '#9893a5', '#907aa9', ROSE_PINE_DAWN_TERMINAL, true),
    terminal: ROSE_PINE_DAWN_TERMINAL,
  },
  'solarized-light': {
    id: 'solarized-light',
    label: 'Solarized Light',
    light: true,
    tokens: createTokens('#eee8d5', '#fdf6e3', '#eee8d5', '#93a1a1', '#586e75', '#657b83', '#93a1a1', '#268bd2', SOLARIZED_LIGHT_TERMINAL, true),
    terminal: SOLARIZED_LIGHT_TERMINAL,
  },
}

export function normalizeAppThemeId(value: unknown): AppThemeId {
  return typeof value === 'string' && COLOR_PRESET_IDS.includes(value as ColorPresetId)
    ? value as ColorPresetId
    : 'default'
}

export function isLightColorPreset(value: unknown): boolean {
  const id = normalizeAppThemeId(value)
  return id !== 'default' && COLOR_PRESETS[id].light
}

export function getAppThemeTokens(value: unknown, light = false): AppThemeTokens {
  const id = normalizeAppThemeId(value)
  return id === 'default' ? (light ? DEFAULT_LIGHT : DEFAULT_DARK) : COLOR_PRESETS[id].tokens
}

export const APP_THEMES = [
  { id: 'default' as const, label: 'Default', tokens: DEFAULT_DARK },
  ...COLOR_PRESET_IDS.map((id) => COLOR_PRESETS[id]),
]
