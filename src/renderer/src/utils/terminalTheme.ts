import { normalizeAppThemeId } from '@shared/appThemes'
import { normalizeTerminalThemeId } from '@shared/terminalThemes'

import { getTerminalTheme } from '@shared/terminalThemes'

export function getXtermTheme(themeId: unknown) {
  return { ...getTerminalTheme(themeId).colors }
}

export function getTerminalContainerBackground(themeId: unknown): string {
  return getTerminalTheme(themeId).colors.background
}

// Default terminals follow the application palette; explicit overrides stay intact.
export function resolveTerminalThemeId(terminalThemeId: unknown, appThemeId: unknown) {
  const terminalId = normalizeTerminalThemeId(terminalThemeId)
  const appId = normalizeAppThemeId(appThemeId)
  return terminalId === 'yira-default' && appId !== 'default' ? appId : terminalId
}
