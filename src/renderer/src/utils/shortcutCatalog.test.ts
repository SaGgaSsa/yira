import assert from 'node:assert/strict'
import test from 'node:test'

import { CONFIGURABLE_SHORTCUT_IDS, DEFAULT_SHORTCUTS } from '@shared/shortcuts'
import type { ShortcutId } from '@shared/shortcuts'
import { formatAccelerator, getShortcutCatalog, SHORTCUT_CATALOG, SHORTCUT_LABEL_KEYS } from './shortcutCatalog'

function catalogItem(id: ShortcutId) {
  return SHORTCUT_CATALOG.flatMap((group) => group.items).find((item) => item.id === id)
}

function shortcutKeys(id: ShortcutId): string {
  const item = catalogItem(id)
  assert.ok(item, `missing shortcut: ${id}`)
  return item.keys
}

test('formats named arrow keys as compact glyphs', () => {
  assert.equal(formatAccelerator('Ctrl+Alt+ArrowLeft'), 'Ctrl+Alt+←')
  assert.equal(formatAccelerator('Ctrl+Alt+ArrowRight'), 'Ctrl+Alt+→')
  assert.equal(formatAccelerator('Ctrl+Alt+ArrowUp'), 'Ctrl+Alt+↑')
  assert.equal(formatAccelerator('Ctrl+Alt+ArrowDown'), 'Ctrl+Alt+↓')
  assert.equal(formatAccelerator('Ctrl+Shift+Tab'), 'Ctrl+Shift+Tab')
  assert.equal(formatAccelerator('F11'), 'F11')
})

test('catalogs Ctrl+Alt+ArrowLeft as left-panel focus', () => {
  assert.equal(shortcutKeys('focusLeftPanel'), 'Ctrl+Alt+←')
})

test('catalogs Ctrl+Alt+ArrowRight as right-panel focus', () => {
  assert.equal(shortcutKeys('focusRightPanel'), 'Ctrl+Alt+→')
})

test('catalogs Ctrl+Shift+Tab as previous-tab navigation', () => {
  assert.equal(shortcutKeys('previousTab'), 'Ctrl+Shift+Tab')
})

test('catalogs Ctrl+Tab as next-tab navigation', () => {
  assert.equal(shortcutKeys('nextTab'), 'Ctrl+Tab')
})

test('retains fixed shortcuts', () => {
  const items = SHORTCUT_CATALOG.flatMap((group) => group.items)
  const fixedKeys = [
    'Shift+Enter / Alt+Enter',
    'Ctrl+Shift+C',
    'Ctrl+V / Ctrl+Shift+V',
    'Ctrl+Click',
    'Ctrl+S',
    'F2',
    'Delete',
    'F11',
    'Esc',
    'Enter',
  ]

  for (const keys of fixedKeys) {
    assert.ok(items.some((item) => item.keys === keys), `missing fixed shortcut: ${keys}`)
  }
})

test('exposes ids only on configurable shortcuts', () => {
  const items = SHORTCUT_CATALOG.flatMap((group) => group.items)
  const configurable = items.filter((item) => item.id !== undefined)
  const fixed = items.filter((item) => item.id === undefined)

  assert.equal(configurable.length, 7)
  assert.equal(fixed.length, 10)
  assert.ok(fixed.every((item) => item.labelKey.startsWith('settings.shortcut')))
})

test('catalogs every configurable shortcut exactly once with a label key', () => {
  const items = SHORTCUT_CATALOG.flatMap((group) => group.items)

  for (const id of CONFIGURABLE_SHORTCUT_IDS) {
    assert.equal(items.filter((item) => item.id === id).length, 1, `shortcut should appear exactly once: ${id}`)
    assert.ok(SHORTCUT_LABEL_KEYS[id], `missing label key: ${id}`)
  }
  assert.deepEqual(Object.keys(SHORTCUT_LABEL_KEYS).sort(), [...CONFIGURABLE_SHORTCUT_IDS].sort())
})

test('shows the configured new-agent shortcut and defaults to Ctrl+N', () => {
  const defaultItem = catalogItem('newAgentSession')
  const configuredItem = getShortcutCatalog({ ...DEFAULT_SHORTCUTS, newAgentSession: 'Alt+K' })
    .flatMap((group) => group.items)
    .find((item) => item.id === 'newAgentSession')

  assert.equal(defaultItem?.keys, 'Ctrl+N')
  assert.equal(configuredItem?.keys, 'Alt+K')
})

test('shows the configured open-home shortcut and defaults to Ctrl+I', () => {
  const defaultItem = catalogItem('openHome')
  const configuredItem = getShortcutCatalog({ ...DEFAULT_SHORTCUTS, openHome: 'Alt+H' })
    .flatMap((group) => group.items)
    .find((item) => item.id === 'openHome')

  assert.equal(defaultItem?.keys, 'Ctrl+I')
  assert.equal(configuredItem?.keys, 'Alt+H')
})

test('shows a remapped navigation shortcut with arrow glyphs', () => {
  const item = getShortcutCatalog({ ...DEFAULT_SHORTCUTS, focusLeftPanel: 'Ctrl+Alt+ArrowUp' })
    .flatMap((group) => group.items)
    .find((shortcut) => shortcut.id === 'focusLeftPanel')

  assert.equal(item?.keys, 'Ctrl+Alt+↑')
  assert.equal(item?.labelKey, 'settings.shortcutFocusLeftSplitPanel')
})
