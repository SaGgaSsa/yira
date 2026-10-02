import assert from 'node:assert/strict'
import test from 'node:test'
import { matchesShortcut, normalizeAccelerator } from './shortcutResolver'

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
