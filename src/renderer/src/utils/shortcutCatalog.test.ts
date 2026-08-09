import assert from 'node:assert/strict'
import test from 'node:test'

import { SHORTCUT_CATALOG } from './shortcutCatalog'

function navigationShortcut(label: string): string {
  const navigation = SHORTCUT_CATALOG.find((group) => group.label === 'Navigation')
  const item = navigation?.items.find((shortcut) => shortcut.label === label)
  assert.ok(item, `missing navigation shortcut: ${label}`)
  return item.keys
}

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
