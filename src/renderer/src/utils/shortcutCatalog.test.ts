import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_SHORTCUTS } from '@shared/shortcuts'
import { formatAccelerator, getShortcutCatalog, SHORTCUT_CATALOG } from './shortcutCatalog'

function navigationShortcut(label: string): string {
  const navigation = SHORTCUT_CATALOG.find((group) => group.label === 'Navigation')
  const item = navigation?.items.find((shortcut) => shortcut.label === label)
  assert.ok(item, `missing navigation shortcut: ${label}`)
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
  assert.equal(navigationShortcut('Focus left split panel'), 'Ctrl+Alt+←')
})

test('catalogs Ctrl+Alt+ArrowRight as right-panel focus', () => {
  assert.equal(navigationShortcut('Focus right split panel'), 'Ctrl+Alt+→')
})

test('catalogs Ctrl+Shift+Tab as previous-tab navigation', () => {
  assert.equal(navigationShortcut('Previous tab'), 'Ctrl+Shift+Tab')
})

test('catalogs Ctrl+Tab as next-tab navigation', () => {
  assert.equal(navigationShortcut('Next tab'), 'Ctrl+Tab')
})

test('retains fullscreen and contextual shortcuts', () => {
  const items = SHORTCUT_CATALOG.flatMap((group) => group.items)

  assert.ok(items.some((item) => item.keys === 'F11'))
  assert.ok(items.some((item) => item.keys === 'Esc'))
  assert.ok(items.some((item) => item.keys === 'Enter'))
})

test('exposes ids only on configurable shortcuts', () => {
  const items = SHORTCUT_CATALOG.flatMap((group) => group.items)
  const configurable = items.filter((item) => item.id !== undefined)
  const fixed = items.filter((item) => item.id === undefined)

  assert.equal(configurable.length, 7)
  assert.ok(fixed.every((item) => item.keys === 'F11' || item.keys === 'Esc' || item.keys === 'Enter'))
})

test('shows the configured new-agent shortcut and defaults to Ctrl+N', () => {
  const defaultItem = SHORTCUT_CATALOG.flatMap((group) => group.items)
    .find((item) => item.label === 'New agent session')
  const configuredItem = getShortcutCatalog({ ...DEFAULT_SHORTCUTS, newAgentSession: 'Alt+K' })
    .flatMap((group) => group.items)
    .find((item) => item.label === 'New agent session')

  assert.equal(defaultItem?.keys, 'Ctrl+N')
  assert.equal(configuredItem?.keys, 'Alt+K')
})

test('shows the configured open-home shortcut and defaults to Ctrl+I', () => {
  const defaultItem = SHORTCUT_CATALOG.flatMap((group) => group.items)
    .find((item) => item.label === 'Open home')
  const configuredItem = getShortcutCatalog({ ...DEFAULT_SHORTCUTS, openHome: 'Alt+H' })
    .flatMap((group) => group.items)
    .find((item) => item.label === 'Open home')

  assert.equal(defaultItem?.keys, 'Ctrl+I')
  assert.equal(configuredItem?.keys, 'Alt+H')
})

test('shows a remapped navigation shortcut with arrow glyphs', () => {
  const item = getShortcutCatalog({ ...DEFAULT_SHORTCUTS, focusLeftPanel: 'Ctrl+Alt+ArrowUp' })
    .flatMap((group) => group.items)
    .find((shortcut) => shortcut.label === 'Focus left split panel')

  assert.equal(item?.keys, 'Ctrl+Alt+↑')
  assert.equal(item?.id, 'focusLeftPanel')
})
