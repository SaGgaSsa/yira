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
