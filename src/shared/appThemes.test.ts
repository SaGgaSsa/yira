import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { APP_THEMES, COLOR_PRESETS, getAppThemeTokens, getTranslucentThemeTokens, isLightColorPreset, normalizeAppThemeId } from './appThemes'
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

test('the catalog contains Default and thirteen complete shared palettes', () => {
  assert.equal(APP_THEMES.length, 14)
  assert.equal(new Set(APP_THEMES.map(({ id }) => id)).size, 14)
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

test('Default comes first, then dark palettes, then light palettes', () => {
  assert.equal(APP_THEMES[0].id, 'default')
  const lightFlags = APP_THEMES.slice(1).map(({ id }) => COLOR_PRESETS[id as keyof typeof COLOR_PRESETS].light)
  assert.deepEqual(lightFlags, [...lightFlags].sort((a, b) => Number(a) - Number(b)))
  assert.deepEqual(APP_THEMES.filter(({ id }) => isLightColorPreset(id)).map(({ id }) => id), ['catppuccin-latte', 'rose-pine-dawn', 'solarized-light'])
})

function relativeLuminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((index) => {
    const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

test('light palettes keep primary text readable and use light overlays', () => {
  const dark = getAppThemeTokens('default')
  const light = getAppThemeTokens('default', true)
  for (const preset of Object.values(COLOR_PRESETS)) {
    const base = preset.light ? light : dark
    for (const token of ['--hover-bg', '--active-bg', '--accent-text'] as const) assert.equal(preset.tokens[token], base[token], `${preset.id} ${token}`)
    if (!preset.light) continue
    const ratio = contrastRatio(preset.tokens['--text-primary'], preset.tokens['--surface'])
    assert.ok(ratio >= 4.5, `${preset.id} contrast ${ratio.toFixed(2)}`)
  }
})

test('every app theme defines the CSS variables referenced by Tailwind colors', () => {
  const css = readFileSync(new URL('../renderer/src/index.css', import.meta.url), 'utf8')
  const theme = css.slice(css.indexOf('@theme inline {')).split('}')[0]
  const variables = [...theme.matchAll(/--color-[\w-]+: var\((--[\w-]+)\)/g)].map(([, variable]) => variable)
  assert.ok(variables.length > 0)
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
