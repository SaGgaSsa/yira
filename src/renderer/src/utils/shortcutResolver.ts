import { matchesShortcut } from '@shared/shortcuts'
import type { ShortcutSettings } from '@shared/shortcuts'

export { matchesShortcut, normalizeAccelerator } from '@shared/shortcuts'

export interface KeyboardShortcutInput {
  key: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

export type ResolvedKeyboardShortcut =
  | 'focus-left-panel'
  | 'focus-right-panel'
  | 'previous-tab'
  | 'next-tab'

export function resolveKeyboardShortcut(
  input: KeyboardShortcutInput,
  shortcuts: ShortcutSettings,
): ResolvedKeyboardShortcut | null {
  if (matchesShortcut(input, shortcuts.focusLeftPanel)) return 'focus-left-panel'
  if (matchesShortcut(input, shortcuts.focusRightPanel)) return 'focus-right-panel'
  if (matchesShortcut(input, shortcuts.previousTab)) return 'previous-tab'
  if (matchesShortcut(input, shortcuts.nextTab)) return 'next-tab'

  return null
}

export function isTerminalShortcutTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false

  const closest = (target as { closest?: unknown }).closest
  return typeof closest === 'function' && Boolean(closest.call(target, '.xterm'))
}

export function isShortcutCaptureTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false

  const closest = (target as { closest?: unknown }).closest
  return typeof closest === 'function' && Boolean(closest.call(target, '[data-agent-shortcut-capture]'))
}
