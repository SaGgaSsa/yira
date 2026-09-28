import { normalizeAppThemeId } from '@shared/appThemes'
import { normalizeTerminalThemeId } from '@shared/terminalThemes'

import { getTerminalTheme } from '@shared/terminalThemes'

// With a window material, xterm paints nothing and the container shows the
// shared surface token. The RGB is kept so inverse video still resolves to the
// theme background once xterm makes the color opaque.
function transparentBackground(background: string): string {
  const match = /^#([\da-f]{6})$/i.exec(background)
  if (!match) return background
  const hex = match[1]
  return `rgba(${Number.parseInt(hex.slice(0, 2), 16)}, ${Number.parseInt(hex.slice(2, 4), 16)}, ${Number.parseInt(hex.slice(4, 6), 16)}, 0)`
}

export function getXtermTheme(themeId: unknown, translucent = false) {
  const colors = { ...getTerminalTheme(themeId).colors }
  if (translucent) colors.background = transparentBackground(colors.background)
  return colors
}

export function getTerminalContainerBackground(themeId: unknown, translucent = false): string {
  return translucent ? 'var(--bg-secondary)' : getTerminalTheme(themeId).colors.background
}

// Default terminals follow the application palette; explicit overrides stay intact.
export function resolveTerminalThemeId(terminalThemeId: unknown, appThemeId: unknown) {
  const terminalId = normalizeTerminalThemeId(terminalThemeId)
  const appId = normalizeAppThemeId(appThemeId)
  return terminalId === 'yira-default' && appId !== 'default' ? appId : terminalId
}
