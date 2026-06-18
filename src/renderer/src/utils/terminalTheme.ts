import { getTerminalTheme } from '@shared/terminalThemes'

export function getXtermTheme(themeId: unknown) {
  return { ...getTerminalTheme(themeId).colors }
}

export function getTerminalContainerBackground(themeId: unknown): string {
  return getTerminalTheme(themeId).colors.background
}
