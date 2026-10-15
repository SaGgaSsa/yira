import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CONFIGURABLE_SHORTCUT_IDS,
  DEFAULT_SHORTCUTS,
  isBlockingShortcutIssue,
  normalizeShortcutSettings,
  validateShortcut,
} from './shortcuts'

test('normalizes stored shortcuts and fills missing ids with defaults', () => {
  assert.deepEqual(normalizeShortcutSettings(undefined), DEFAULT_SHORTCUTS)
  assert.deepEqual(normalizeShortcutSettings(null), DEFAULT_SHORTCUTS)
  assert.deepEqual(normalizeShortcutSettings('not an object'), DEFAULT_SHORTCUTS)
  assert.deepEqual(normalizeShortcutSettings({ newAgentSession: 'ctrl+n' }), DEFAULT_SHORTCUTS)

  const normalized = normalizeShortcutSettings({
    openHome: 'alt+Home',
    newAgentSession: 'not a shortcut',
    focusLeftPanel: 'alt+left',
  })
  assert.equal(normalized.openHome, 'Alt+Home')
  assert.equal(normalized.newAgentSession, DEFAULT_SHORTCUTS.newAgentSession)
  assert.equal(normalized.focusLeftPanel, 'Alt+ArrowLeft')
  assert.equal(normalized.nextTab, DEFAULT_SHORTCUTS.nextTab)
  assert.equal(normalizeShortcutSettings({ openHome: 'alt+home' }).openHome, DEFAULT_SHORTCUTS.openHome)
})

test('every configurable id has a default binding', () => {
  for (const id of CONFIGURABLE_SHORTCUT_IDS) {
    assert.equal(typeof DEFAULT_SHORTCUTS[id], 'string')
  }
})

test('reports conflicts with another configurable shortcut', () => {
  assert.deepEqual(
    validateShortcut('openHome', 'Ctrl+N', DEFAULT_SHORTCUTS),
    { kind: 'conflict', with: 'newAgentSession' },
  )
  assert.deepEqual(
    validateShortcut('nextTab', 'Ctrl+Shift+Tab', DEFAULT_SHORTCUTS),
    { kind: 'conflict', with: 'previousTab' },
  )
})

test('validating an id against its own current binding is not a conflict', () => {
  for (const id of CONFIGURABLE_SHORTCUT_IDS) {
    assert.equal(validateShortcut(id, DEFAULT_SHORTCUTS[id], DEFAULT_SHORTCUTS), null)
  }
})

test('reports invalid accelerators before any other issue', () => {
  assert.deepEqual(validateShortcut('openHome', 'Shift+N', DEFAULT_SHORTCUTS), { kind: 'invalid' })
  assert.deepEqual(validateShortcut('openHome', 'not a shortcut', DEFAULT_SHORTCUTS), { kind: 'invalid' })
})

test('blocks clipboard shortcuts the terminal needs', () => {
  for (const accelerator of ['Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+Shift+C', 'Ctrl+Shift+V', 'ctrl+shift+c']) {
    assert.deepEqual(
      validateShortcut('openHome', accelerator, DEFAULT_SHORTCUTS),
      { kind: 'reserved', reason: 'clipboard' },
    )
  }
})

test('blocks editing shortcuts', () => {
  for (const accelerator of ['Ctrl+A', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+Shift+Z', 'Ctrl+S']) {
    assert.deepEqual(
      validateShortcut('openHome', accelerator, DEFAULT_SHORTCUTS),
      { kind: 'reserved', reason: 'editing' },
    )
  }
})

test('blocks Windows system shortcuts', () => {
  for (const accelerator of [
    'Alt+F4', 'Alt+Tab', 'Alt+Space', 'Alt+Escape', 'Ctrl+Escape', 'Ctrl+Shift+Escape', 'Ctrl+Alt+Delete',
  ]) {
    assert.deepEqual(
      validateShortcut('openHome', accelerator, DEFAULT_SHORTCUTS),
      { kind: 'reserved', reason: 'system' },
    )
  }
})

test('warns about terminal control keys without blocking them', () => {
  for (const accelerator of [
    'Ctrl+L', 'Ctrl+D', 'Ctrl+R', 'Ctrl+W', 'Ctrl+U', 'Ctrl+K', 'Ctrl+E', 'Ctrl+H', 'Ctrl+P', 'Ctrl+B',
    'Ctrl+F', 'Ctrl+G', 'Ctrl+O', 'Ctrl+T', 'Alt+B', 'Alt+F', 'Alt+D', 'Alt+Backspace',
  ]) {
    assert.deepEqual(
      validateShortcut('openHome', accelerator, DEFAULT_SHORTCUTS),
      { kind: 'warning', reason: 'terminal' },
    )
  }
})

test('accepts free combinations and classifies issues as blocking or not', () => {
  assert.equal(validateShortcut('openHome', 'Ctrl+Shift+H', DEFAULT_SHORTCUTS), null)

  assert.equal(isBlockingShortcutIssue({ kind: 'invalid' }), true)
  assert.equal(isBlockingShortcutIssue({ kind: 'conflict', with: 'nextTab' }), true)
  assert.equal(isBlockingShortcutIssue({ kind: 'reserved', reason: 'system' }), true)
  assert.equal(isBlockingShortcutIssue({ kind: 'warning', reason: 'terminal' }), false)
  assert.equal(isBlockingShortcutIssue(null), false)
})
