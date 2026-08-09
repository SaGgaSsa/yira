import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isTerminalShortcutTarget,
  resolveKeyboardShortcut,
  type KeyboardShortcutInput,
} from './shortcutResolver'

function shortcut(overrides: Partial<KeyboardShortcutInput>): KeyboardShortcutInput {
  return {
    key: 'ArrowLeft',
    ctrlKey: true,
    altKey: true,
    shiftKey: false,
    metaKey: false,
    ...overrides,
  }
}

test('resolves Ctrl+Alt+ArrowLeft as left-panel focus', () => {
  assert.equal(resolveKeyboardShortcut(shortcut({ key: 'ArrowLeft' })), 'focus-left-panel')
})

test('resolves Ctrl+Alt+ArrowRight as right-panel focus', () => {
  assert.equal(resolveKeyboardShortcut(shortcut({ key: 'ArrowRight' })), 'focus-right-panel')
})

test('resolves Ctrl+Shift+Tab as the previous tab shortcut', () => {
  assert.equal(
    resolveKeyboardShortcut(shortcut({ key: 'Tab', altKey: false, shiftKey: true })),
    'previous-tab',
  )
})

test('resolves Ctrl+Tab as the next tab shortcut', () => {
  assert.equal(
    resolveKeyboardShortcut(shortcut({ key: 'Tab', altKey: false })),
    'next-tab',
  )
})

test('rejects Meta and other additional modifiers', () => {
  const invalidShortcuts: KeyboardShortcutInput[] = [
    shortcut({ metaKey: true }),
    shortcut({ shiftKey: true }),
    shortcut({ key: 'ArrowRight', metaKey: true }),
    shortcut({ key: 'Tab', altKey: false, shiftKey: true, metaKey: true }),
    shortcut({ key: 'Tab', altKey: true }),
  ]

  for (const invalidShortcut of invalidShortcuts) {
    assert.equal(resolveKeyboardShortcut(invalidShortcut), null)
  }
})

test('rejects non-exact keys and missing Ctrl', () => {
  assert.equal(resolveKeyboardShortcut(shortcut({ key: 'ArrowUp' })), null)
  assert.equal(resolveKeyboardShortcut(shortcut({ key: 'left' })), null)
  assert.equal(resolveKeyboardShortcut(shortcut({ key: 'Tab', altKey: false, ctrlKey: false })), null)
})

test('classifies targets inside .xterm as protected terminal targets', () => {
  const terminalTarget = {
    closest: (selector: string) => selector === '.xterm' ? {} : null,
  } as unknown as EventTarget
  const outsideTarget = {
    closest: () => null,
  } as unknown as EventTarget

  assert.equal(isTerminalShortcutTarget(terminalTarget), true)
  assert.equal(isTerminalShortcutTarget(outsideTarget), false)
  assert.equal(isTerminalShortcutTarget(null), false)
})
