import type { TileState } from '@shared/types'

export const MAX_TERMINAL_WINDOW_TITLE_LENGTH = 120

export function getTerminalDisplayTitle(tile: TileState, terminalTitles: Record<string, string>): string {
  const manualLabel = tile.label?.trim()
  if (manualLabel) return manualLabel

  const dynamicTitle = terminalTitles[tile.id]?.trim()
  if (dynamicTitle) return dynamicTitle

  return `Terminal ${tile.id.slice(-4)}`
}

export function normalizeTerminalWindowTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').slice(0, MAX_TERMINAL_WINDOW_TITLE_LENGTH).trim()
}
