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

export function resolveKeyboardShortcut(input: KeyboardShortcutInput): ResolvedKeyboardShortcut | null {
  if (!input.ctrlKey || input.metaKey) return null

  if (input.altKey && !input.shiftKey) {
    if (input.key === 'ArrowLeft') return 'focus-left-panel'
    if (input.key === 'ArrowRight') return 'focus-right-panel'
    return null
  }

  if (!input.altKey && input.key === 'Tab') {
    return input.shiftKey ? 'previous-tab' : 'next-tab'
  }

  return null
}

export function isTerminalShortcutTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false

  const closest = (target as { closest?: unknown }).closest
  return typeof closest === 'function' && Boolean(closest.call(target, '.xterm'))
}
