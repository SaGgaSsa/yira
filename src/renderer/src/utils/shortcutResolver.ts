export interface KeyboardShortcutInput {
  key: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
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
