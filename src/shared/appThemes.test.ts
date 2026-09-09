import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { APP_THEMES, COLOR_PRESETS, getAppThemeTokens, normalizeAppThemeId } from './appThemes'
import { getTerminalTheme } from './terminalThemes'
import { normalizeUserSettings } from './userSettings'

test('Default preserves the existing dark and light CSS palettes', () => {
  const css = readFileSync(new URL('../renderer/src/index.css', import.meta.url), 'utf8')
  for (const [selector, light] of [[':root', false], [':root.light', true]] as const) {
    const block = css.slice(css.indexOf(`${selector} {`)).split('}')[0]
    const tokens = getAppThemeTokens('default', light)
    for (const [, key, value] of block.matchAll(/  (--[\w-]+): ([^;]+);/g)) {
      if (key in tokens) assert.equal(tokens[key as keyof typeof tokens], value, key)
    }
  }
})

test('the catalog contains Default and five complete shared palettes', () => {
  assert.equal(APP_THEMES.length, 6)
  assert.equal(new Set(APP_THEMES.map(({ id }) => id)).size, 6)
  const keys = Object.keys(getAppThemeTokens('default')).sort()
  for (const preset of Object.values(COLOR_PRESETS)) {
    assert.deepEqual(Object.keys(preset.tokens).sort(), keys)
    assert.equal(getAppThemeTokens(preset.id, true), preset.tokens)
    const terminal = getTerminalTheme(preset.id).colors
    assert.equal(terminal.background, preset.tokens['--surface'])
    assert.equal(terminal.foreground, preset.tokens['--text-primary'])
    assert.equal(Object.keys(terminal).length, 21)
    for (const color of Object.values(terminal)) assert.match(color, /^#[\da-f]{6}([\da-f]{2})?$/i)
  }
})

test('legacy and invalid settings use Default while retaining terminal overrides', () => {
  for (const value of [undefined, null, 'custom', '__proto__', {}, 3]) {
    assert.equal(normalizeAppThemeId(value), 'default')
    const settings = normalizeUserSettings({ themeId: value as never, terminal: { themeId: 'light' } })
    assert.equal(settings.themeId, 'default')
    assert.equal(settings.terminal.themeId, 'light')
  }
  for (const { id } of APP_THEMES) {
    assert.equal(normalizeUserSettings({ themeId: id }).themeId, id)
  }
})
