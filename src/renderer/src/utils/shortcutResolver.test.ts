import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_SHORTCUTS } from '@shared/shortcuts'
import { matchesShortcut, normalizeAccelerator, resolveKeyboardShortcut, type KeyboardShortcutInput } from './shortcutResolver'

function keyboardEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: 'n',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  } as KeyboardEvent
}

function shortcutInput(overrides: Partial<KeyboardShortcutInput> = {}): KeyboardShortcutInput {
  return {
    key: 'Tab',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  }
}

test('normalizes and matches Ctrl accelerators on Windows and Linux', () => {
  assert.equal(normalizeAccelerator('ctrl+shift+a'), 'Ctrl+Shift+A')
  assert.equal(matchesShortcut(keyboardEvent({ ctrlKey: true }), 'Ctrl+N'), true)
  assert.equal(matchesShortcut(keyboardEvent({ ctrlKey: true, altKey: true }), 'Ctrl+N'), false)
})

test('uses Meta only for Cmd accelerators', () => {
  assert.equal(normalizeAccelerator('Meta+k'), 'Cmd+K')
  assert.equal(matchesShortcut(keyboardEvent({ metaKey: true }), 'Cmd+N'), true)
  assert.equal(matchesShortcut(keyboardEvent({ ctrlKey: true }), 'Cmd+N'), false)
})

test('rejects invalid accelerators and combinations without a control modifier', () => {
  assert.equal(normalizeAccelerator('N'), null)
  assert.equal(normalizeAccelerator('Shift+N'), null)
  assert.equal(normalizeAccelerator('Ctrl++N'), null)
  assert.equal(normalizeAccelerator('Ctrl+Cmd+N'), null)
  assert.equal(matchesShortcut(keyboardEvent({ ctrlKey: true }), 'not a shortcut'), false)
})

test('resolves navigation shortcuts with the default bindings', () => {
  assert.equal(
    resolveKeyboardShortcut(shortcutInput({ key: 'ArrowLeft', altKey: true }), DEFAULT_SHORTCUTS),
    'focus-left-panel',
  )
  assert.equal(
    resolveKeyboardShortcut(shortcutInput({ key: 'ArrowRight', altKey: true }), DEFAULT_SHORTCUTS),
    'focus-right-panel',
  )
  assert.equal(
    resolveKeyboardShortcut(shortcutInput({ key: 'Tab', shiftKey: true }), DEFAULT_SHORTCUTS),
    'previous-tab',
  )
  assert.equal(resolveKeyboardShortcut(shortcutInput({ key: 'Tab' }), DEFAULT_SHORTCUTS), 'next-tab')
  assert.equal(resolveKeyboardShortcut(shortcutInput({ key: 'ArrowLeft' }), DEFAULT_SHORTCUTS), null)
  assert.equal(resolveKeyboardShortcut(shortcutInput({ key: 'Tab', ctrlKey: false }), DEFAULT_SHORTCUTS), null)
  assert.equal(resolveKeyboardShortcut(shortcutInput({ key: 'Tab', metaKey: true }), DEFAULT_SHORTCUTS), null)
})

test('resolves a remapped navigation shortcut', () => {
  const remapped = { ...DEFAULT_SHORTCUTS, focusLeftPanel: 'Alt+H' }

  assert.equal(
    resolveKeyboardShortcut(shortcutInput({ key: 'h', ctrlKey: false, altKey: true }), remapped),
    'focus-left-panel',
  )
  assert.equal(
    resolveKeyboardShortcut(shortcutInput({ key: 'ArrowLeft', altKey: true }), remapped),
    null,
  )
})
