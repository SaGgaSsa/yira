export const CONFIGURABLE_SHORTCUT_IDS = [
  'openHome',
  'newAgentSession',
  'focusLeftPanel',
  'focusRightPanel',
  'previousTab',
  'nextTab',
] as const

export type ShortcutId = typeof CONFIGURABLE_SHORTCUT_IDS[number]
export type ShortcutSettings = Record<ShortcutId, string>

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  openHome: 'Ctrl+I',
  newAgentSession: 'Ctrl+N',
  focusLeftPanel: 'Ctrl+Alt+ArrowLeft',
  focusRightPanel: 'Ctrl+Alt+ArrowRight',
  previousTab: 'Ctrl+Shift+Tab',
  nextTab: 'Ctrl+Tab',
}

const SHORTCUT_MODIFIER_ORDER = ['Ctrl', 'Cmd', 'Alt', 'Shift'] as const
const NAMED_SHORTCUT_KEYS = new Set([
  'Backspace', 'Delete', 'End', 'Enter', 'Escape', 'Home', 'Insert', 'PageDown', 'PageUp',
  'Space', 'Tab', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp',
])

function normalizeShortcutKey(value: string): string | null {
  const aliases: Record<string, string> = {
    esc: 'Escape',
    del: 'Delete',
    spacebar: 'Space',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    up: 'ArrowUp',
    down: 'ArrowDown',
  }
  const aliased = aliases[value.toLowerCase()] ?? value
  if (/^[a-z]$/i.test(aliased)) return aliased.toUpperCase()
  if (/^\d$/.test(aliased)) return aliased
  if (/^F(?:[1-9]|1\d|2[0-4])$/i.test(aliased)) return aliased.toUpperCase()
  if (NAMED_SHORTCUT_KEYS.has(aliased)) return aliased
  return null
}

/** Return a canonical accelerator, or null when it is malformed or has no usable modifier. */
export function normalizeAccelerator(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const parts = value.split('+').map((part) => part.trim())
  if (parts.some((part) => !part)) return null
  if (parts.length < 2) return null

  const aliases: Record<string, typeof SHORTCUT_MODIFIER_ORDER[number]> = {
    ctrl: 'Ctrl',
    control: 'Ctrl',
    cmd: 'Cmd',
    command: 'Cmd',
    meta: 'Cmd',
    alt: 'Alt',
    option: 'Alt',
    shift: 'Shift',
  }
  const modifiers: Array<typeof SHORTCUT_MODIFIER_ORDER[number]> = []
  for (const part of parts.slice(0, -1)) {
    const modifier = aliases[part.toLowerCase()]
    if (!modifier || modifiers.includes(modifier)) return null
    modifiers.push(modifier)
  }

  if (!modifiers.some((modifier) => modifier !== 'Shift')) return null
  if (modifiers.includes('Ctrl') && modifiers.includes('Cmd')) return null
  const key = normalizeShortcutKey(parts[parts.length - 1])
  if (!key) return null

  const orderedModifiers = SHORTCUT_MODIFIER_ORDER.filter((modifier) => modifiers.includes(modifier))
  return [...orderedModifiers, key].join('+')
}

/** Match a keyboard event exactly against a normalized accelerator. */
export function matchesShortcut(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  accelerator: string,
): boolean {
  const normalized = normalizeAccelerator(accelerator)
  if (!normalized) return false

  const parts = normalized.split('+')
  const key = parts[parts.length - 1]
  const modifiers = new Set(parts.slice(0, -1))
  const eventKey = event.key === ' ' ? 'Space' : normalizeShortcutKey(event.key)

  return eventKey === key &&
    event.ctrlKey === modifiers.has('Ctrl') &&
    event.metaKey === modifiers.has('Cmd') &&
    event.altKey === modifiers.has('Alt') &&
    event.shiftKey === modifiers.has('Shift')
}

/** Normalize stored shortcut settings per id, falling back to the default binding. */
export function normalizeShortcutSettings(raw: unknown): ShortcutSettings {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Partial<Record<ShortcutId, unknown>>
    : {}
  const normalized = { ...DEFAULT_SHORTCUTS }
  for (const id of CONFIGURABLE_SHORTCUT_IDS) {
    normalized[id] = normalizeAccelerator(source[id]) ?? DEFAULT_SHORTCUTS[id]
  }
  return normalized
}

export type ShortcutIssue =
  | { kind: 'invalid' }
  | { kind: 'conflict'; with: ShortcutId }
  | { kind: 'reserved'; reason: 'clipboard' | 'editing' | 'system' }
  | { kind: 'warning'; reason: 'terminal' }

/** The terminal owns Ctrl+Shift+C to copy and Ctrl+V / Ctrl+Shift+V to paste. */
const RESERVED_CLIPBOARD_SHORTCUTS = new Set([
  'Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+Shift+C', 'Ctrl+Shift+V',
])

/** Text editing and saving combinations users expect inside fields and the file editor. */
const RESERVED_EDITING_SHORTCUTS = new Set([
  'Ctrl+A', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+Shift+Z', 'Ctrl+S',
])

/** Windows shell combinations that close the window, switch focus, or reach the system menu. */
const RESERVED_SYSTEM_SHORTCUTS = new Set([
  'Alt+F4', 'Alt+Tab', 'Alt+Space', 'Alt+Escape', 'Ctrl+Escape', 'Ctrl+Shift+Escape', 'Ctrl+Alt+Delete',
])

/** Control keys used by shells and terminal UIs; assigning them takes the key away from the terminal. */
const TERMINAL_WARNING_SHORTCUTS = new Set([
  'Ctrl+L', 'Ctrl+D', 'Ctrl+R', 'Ctrl+W', 'Ctrl+U', 'Ctrl+K', 'Ctrl+E', 'Ctrl+H', 'Ctrl+P', 'Ctrl+B',
  'Ctrl+F', 'Ctrl+G', 'Ctrl+O', 'Ctrl+T', 'Alt+B', 'Alt+F', 'Alt+D', 'Alt+Backspace',
])

/** Blocking issues prevent saving a shortcut; warnings only inform the user. */
export function isBlockingShortcutIssue(issue: ShortcutIssue | null): boolean {
  return issue !== null && issue.kind !== 'warning'
}

export function validateShortcut(id: ShortcutId, accelerator: string, current: ShortcutSettings): ShortcutIssue | null {
  const normalized = normalizeAccelerator(accelerator)
  if (!normalized) return { kind: 'invalid' }

  for (const otherId of CONFIGURABLE_SHORTCUT_IDS) {
    if (otherId === id) continue
    if (normalizeAccelerator(current[otherId]) === normalized) {
      return { kind: 'conflict', with: otherId }
    }
  }

  if (RESERVED_CLIPBOARD_SHORTCUTS.has(normalized)) return { kind: 'reserved', reason: 'clipboard' }
  if (RESERVED_EDITING_SHORTCUTS.has(normalized)) return { kind: 'reserved', reason: 'editing' }
  if (RESERVED_SYSTEM_SHORTCUTS.has(normalized)) return { kind: 'reserved', reason: 'system' }
  if (TERMINAL_WARNING_SHORTCUTS.has(normalized)) return { kind: 'warning', reason: 'terminal' }

  return null
}
