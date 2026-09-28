import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { APP_THEMES, COLOR_PRESETS, getAppThemeTokens, getTranslucentThemeTokens, normalizeAppThemeId } from './appThemes'
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

test('every app theme defines the CSS variables referenced by Tailwind colors', () => {
  const config = readFileSync(new URL('../../tailwind.config.js', import.meta.url), 'utf8')
  const colors = config.slice(config.indexOf('colors: {'), config.indexOf('fontFamily:'))
  const variables = [...colors.matchAll(/var\((--[\w-]+)\)/g)].map(([, variable]) => variable)
  const themes = [
    getAppThemeTokens('default'),
    getAppThemeTokens('default', true),
    ...APP_THEMES.filter(({ id }) => id !== 'default').map(({ tokens }) => tokens),
  ]

  for (const tokens of themes) {
    for (const variable of variables) assert.ok(variable in tokens, `${variable} is missing`)
  }
})

test('translucent tokens add alpha to surfaces and retain borders and text', () => {
  const dark = getTranslucentThemeTokens(getAppThemeTokens('default'))
  assert.equal(dark['--black'], 'rgba(0, 0, 0, 0.08)')
  assert.equal(dark['--surface'], 'rgba(17, 17, 17, 0.56)')
  assert.equal(dark['--border'], getAppThemeTokens('default')['--border'])
  assert.equal(dark['--text-primary'], getAppThemeTokens('default')['--text-primary'])

  const light = getTranslucentThemeTokens(getAppThemeTokens('default', true), true)
  assert.equal(light['--surface'], 'rgba(255, 255, 255, 0.48)')
  assert.equal(light['--black'], 'rgba(245, 245, 245, 0.06)')
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
