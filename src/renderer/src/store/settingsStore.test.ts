import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_USER_SETTINGS, type UserSettings } from '@shared/types'
import { initializeI18n } from '@/i18n'
import { createUserSettingsDraft, useSettingsStore } from './settingsStore'

test('createUserSettingsDraft isolates nested changes from the active settings', () => {
  const active: UserSettings = {
    ...DEFAULT_USER_SETTINGS,
    browser: { ...DEFAULT_USER_SETTINGS.browser },
    terminal: { ...DEFAULT_USER_SETTINGS.terminal },
    notifications: { ...DEFAULT_USER_SETTINGS.notifications },
    tiles: {
      creationAvailability: { ...DEFAULT_USER_SETTINGS.tiles.creationAvailability },
    },
    groups: { ...DEFAULT_USER_SETTINGS.groups },
  }

  const draft = createUserSettingsDraft(active)
  draft.browser.homeUrl = 'https://draft.example'
  draft.terminal.attentionEnabled = false
  draft.notifications.attentionDelayEnabled = false
  draft.tiles.creationAvailability.note = false
  draft.groups.enabled = true

  assert.equal(active.browser.homeUrl, 'about:blank')
  assert.equal(active.terminal.attentionEnabled, true)
  assert.equal(active.notifications.attentionDelayEnabled, true)
  assert.equal(active.tiles.creationAvailability.note, true)
  assert.equal(active.groups.enabled, false)
})

test('applySettings persists the complete draft before replacing the active settings', async () => {
  await initializeI18n('en')

  let finishSave: (() => void) | undefined
  let savedSettings: UserSettings | undefined
  const appliedMaterials: string[] = []
  const saveFinished = new Promise<void>((resolve) => {
    finishSave = resolve
  })
  const originalWindow = globalThis.window

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      electron: {
        settings: {
          save: async (settings: UserSettings) => {
            savedSettings = settings
            await saveFinished
          },
        },
        terminal: {
          setAgentAlertsEnabled: async () => undefined,
        },
        window: {
          setBackgroundMaterial: async (material: string) => { appliedMaterials.push(material) },
        },
      },
    },
  })

  try {
    useSettingsStore.setState({
      ...DEFAULT_USER_SETTINGS,
      browser: { ...DEFAULT_USER_SETTINGS.browser },
      terminal: { ...DEFAULT_USER_SETTINGS.terminal },
      notifications: { ...DEFAULT_USER_SETTINGS.notifications },
      tiles: {
        creationAvailability: { ...DEFAULT_USER_SETTINGS.tiles.creationAvailability },
      },
      groups: { ...DEFAULT_USER_SETTINGS.groups },
      loaded: true,
    })

    const draft: UserSettings = {
      ...DEFAULT_USER_SETTINGS,
      language: 'es',
      themeId: 'nord',
      appearance: 'light',
      interfaceFontSizePx: 18,
      tileFontSizePx: 20,
      showGrid: false,
      snapToGrid: false,
      gridSize: 32,
      updateDiagnosticsEnabled: false,
      browser: { homeUrl: '  https://example.com  ' },
      terminal: {
        attentionEnabled: false,
        agentAlertsEnabled: false,
        themeId: 'high-contrast',
      },
      notifications: { attentionDelayEnabled: false },
      tiles: {
        creationAvailability: {
          note: false,
          browser: false,
          timer: true,
        },
      },
      groups: { enabled: true },
    }

    const applying = useSettingsStore.getState().applySettings(draft)

    assert.equal(useSettingsStore.getState().appearance, 'dark')
    assert.deepEqual(savedSettings, {
      ...draft,
      browser: { homeUrl: 'https://example.com' },
    })
    finishSave?.()
    await applying
    assert.deepEqual(appliedMaterials, ['none'])

    const state = useSettingsStore.getState()
    assert.equal(state.themeId, 'nord')
    assert.equal(createUserSettingsDraft(state).themeId, 'nord')
    assert.equal(state.language, 'es')
    assert.equal(state.appearance, 'light')
    assert.equal(state.interfaceFontSizePx, 18)
    assert.equal(state.tileFontSizePx, 20)
    assert.equal(state.showGrid, false)
    assert.equal(state.snapToGrid, false)
    assert.equal(state.gridSize, 32)
    assert.equal(state.updateDiagnosticsEnabled, false)
    assert.equal(state.browser.homeUrl, 'https://example.com')
    assert.deepEqual(state.terminal, draft.terminal)
    assert.deepEqual(state.notifications, draft.notifications)
    assert.deepEqual(state.tiles, draft.tiles)
    assert.deepEqual(state.groups, draft.groups)
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
  }
})
