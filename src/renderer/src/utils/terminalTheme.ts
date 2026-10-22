import { normalizeAppThemeId } from '@shared/appThemes'
import { normalizeTerminalThemeId } from '@shared/terminalThemes'

import { getTerminalTheme } from '@shared/terminalThemes'

const TRANSLUCENT_TERMINAL_ALPHA = 0.56

function withAlpha(background: string, alpha: number): string {
  const match = /^#([\da-f]{6})$/i.exec(background)
  if (!match) return background
  const hex = match[1]
  return `rgba(${Number.parseInt(hex.slice(0, 2), 16)}, ${Number.parseInt(hex.slice(2, 4), 16)}, ${Number.parseInt(hex.slice(4, 6), 16)}, ${alpha})`
}

export function getXtermTheme(themeId: unknown, translucent = false) {
  const colors = { ...getTerminalTheme(themeId).colors }
  // With a window material only the container paints the terminal background.
  // The RGB is kept so inverse video still resolves to the theme background.
  if (translucent) colors.background = withAlpha(colors.background, 0)
  return colors
}

export function getTerminalContainerBackground(themeId: unknown, translucent = false): string {
  const background = getTerminalTheme(themeId).colors.background
  return translucent ? withAlpha(background, TRANSLUCENT_TERMINAL_ALPHA) : background
}

// Default terminals follow the application palette; explicit overrides stay intact.
// `followLight` switches default terminals to the light palette in light mode.
export function resolveTerminalThemeId(terminalThemeId: unknown, appThemeId: unknown, followLight = false) {
  const terminalId = normalizeTerminalThemeId(terminalThemeId)
  const appId = normalizeAppThemeId(appThemeId)
  if (terminalId !== 'yira-default') return terminalId
  if (appId !== 'default') return appId
  return followLight ? 'light' : terminalId
}

export interface TerminalSearchDecorations {
  matchBackground: string
  matchBorder: string
  matchOverviewRuler: string
  activeMatchBackground: string
  activeMatchBorder: string
  activeMatchColorOverviewRuler: string
}

function parseHexColor(value: string): [number, number, number] | null {
  const match = /^#([\da-f]{6})$/i.exec(value)
  if (!match) return null
  const hex = match[1]
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number]
}

/** Blend `color` over `base` as #RRGGBB, which the search addon requires (no alpha). */
function blendHex(base: string, color: string, amount: number): string {
  const baseRgb = parseHexColor(base)
  const colorRgb = parseHexColor(color)
  if (!baseRgb || !colorRgb) return color
  const channels = baseRgb.map((channel, index) => Math.round(channel + (colorRgb[index] - channel) * amount))
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

/** Search highlight colors: the cyan accent for the active match, a dimmer blend for the rest. */
export function getTerminalSearchDecorations(themeId: unknown): TerminalSearchDecorations {
  const { background, cyan } = getTerminalTheme(themeId).colors
  return {
    matchBackground: blendHex(background, cyan, 0.28),
    matchBorder: blendHex(background, cyan, 0.5),
    matchOverviewRuler: blendHex(background, cyan, 0.5),
    activeMatchBackground: blendHex(background, cyan, 0.6),
    activeMatchBorder: cyan,
    activeMatchColorOverviewRuler: cyan,
  }
}
