import { create } from 'zustand'
import type { UserSettings, AgentProvider, AppearanceMode, ConfigurableTileCreationType, WindowBackgroundMaterial } from '@shared/types'
import { DEFAULT_USER_SETTINGS } from '@shared/types'
import type { TerminalThemeId } from '@shared/terminalThemes'
import { clampFontSizePx, normalizeUserSettings } from '@shared/userSettings'
import type { SupportedLanguage } from '@shared/language'
import { i18n } from '@/i18n'
import { normalizeAccelerator } from '@/utils/shortcutResolver'

export interface SettingsState extends UserSettings {
  loaded: boolean
  activeWindowBackgroundMaterial: WindowBackgroundMaterial
  windowBackgroundMaterialRequiresRestart: boolean

  // Actions
  setAppearance: (mode: AppearanceMode) => void
  setLanguage: (language: SupportedLanguage) => void
  setInterfaceFontSizePx: (size: number) => void
  setTileFontSizePx: (size: number) => void
  setShowGrid: (show: boolean) => void
  setSnapToGrid: (snap: boolean) => void
  setGridSize: (size: number) => void
  setUpdateDiagnosticsEnabled: (enabled: boolean) => void
  setBrowserHomeUrl: (url: string) => void
  setTerminalAttentionEnabled: (enabled: boolean) => void
  setAgentAlertsEnabled: (enabled: boolean) => void
  setAgentEnabled: (provider: AgentProvider, enabled: boolean) => void
  setTerminalThemeId: (themeId: TerminalThemeId) => void
  setNotificationAttentionDelayEnabled: (enabled: boolean) => void
  setDesktopAlertsEnabled: (enabled: boolean) => void
  setTileCreationAvailable: (type: ConfigurableTileCreationType, available: boolean) => void
  setNewAgentSessionShortcut: (shortcut: string) => void
  applySettings: (settings: UserSettings) => Promise<void>
  loadSettings: () => Promise<void>
  saveSettings: () => void
}

const autosaveTimer = { current: null as ReturnType<typeof setTimeout> | null }

export function createUserSettingsDraft(settings: UserSettings): UserSettings {
  return {
    agents: { claude: { ...settings.agents.claude }, codex: { ...settings.agents.codex } },
    language: settings.language,
    themeId: settings.themeId,
    appearance: settings.appearance,
    windowBackgroundMaterial: settings.windowBackgroundMaterial,
    interfaceFontSizePx: settings.interfaceFontSizePx,
    tileFontSizePx: settings.tileFontSizePx,
    showGrid: settings.showGrid,
    snapToGrid: settings.snapToGrid,
    gridSize: settings.gridSize,
    updateDiagnosticsEnabled: settings.updateDiagnosticsEnabled,
    updateDiagnosticsMigrationComplete: settings.updateDiagnosticsMigrationComplete,
    browser: { ...settings.browser },
    terminal: { ...settings.terminal },
    notifications: { ...settings.notifications },
    tiles: {
      creationAvailability: { ...settings.tiles.creationAvailability },
    },
    shortcuts: { ...settings.shortcuts },
  }
}

function scheduleSave() {
  if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
  autosaveTimer.current = setTimeout(() => {
    const state = useSettingsStore.getState()
    const settings: UserSettings = {
      agents: { claude: { ...state.agents.claude }, codex: { ...state.agents.codex } },
      language: state.language,
      themeId: state.themeId,
      appearance: state.appearance,
      windowBackgroundMaterial: state.windowBackgroundMaterial,
      interfaceFontSizePx: state.interfaceFontSizePx,
      tileFontSizePx: state.tileFontSizePx,
      showGrid: state.showGrid,
      snapToGrid: state.snapToGrid,
      gridSize: state.gridSize,
      updateDiagnosticsEnabled: state.updateDiagnosticsEnabled,
      updateDiagnosticsMigrationComplete: state.updateDiagnosticsMigrationComplete,
      browser: { homeUrl: state.browser.homeUrl },
      terminal: {
        attentionEnabled: state.terminal.attentionEnabled,
        agentAlertsEnabled: state.terminal.agentAlertsEnabled,
        themeId: state.terminal.themeId,
      },
      notifications: {
        attentionDelayEnabled: state.notifications.attentionDelayEnabled,
        desktopAlertsEnabled: state.notifications.desktopAlertsEnabled,
      },
      tiles: {
        creationAvailability: {
          ...DEFAULT_USER_SETTINGS.tiles.creationAvailability,
          ...state.tiles.creationAvailability,
        },
      },
      shortcuts: { ...state.shortcuts },
    }
    window.electron.settings.save(settings)
  }, 500)
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_USER_SETTINGS,
  loaded: false,
  activeWindowBackgroundMaterial: 'none',
  windowBackgroundMaterialRequiresRestart: false,

  setAppearance: (mode) => {
    set({ appearance: mode })
    scheduleSave()
  },

  setLanguage: (language) => {
    set({ language })
    void i18n.changeLanguage(language)
    scheduleSave()
  },

  setInterfaceFontSizePx: (size) => {
    set({ interfaceFontSizePx: clampFontSizePx(size) })
    scheduleSave()
  },

  setTileFontSizePx: (size) => {
    set({ tileFontSizePx: clampFontSizePx(size) })
    scheduleSave()
  },

  setShowGrid: (show) => {
    set({ showGrid: show })
    scheduleSave()
  },

  setSnapToGrid: (snap) => {
    set({ snapToGrid: snap })
    scheduleSave()
  },

  setGridSize: (size) => {
    set({ gridSize: Math.max(8, Math.min(80, Math.round(size))) })
    scheduleSave()
  },

  setUpdateDiagnosticsEnabled: (enabled) => {
    set({ updateDiagnosticsEnabled: enabled })
    scheduleSave()
  },

  setBrowserHomeUrl: (url) => {
    set((state) => ({ browser: { ...state.browser, homeUrl: url.trim() || DEFAULT_USER_SETTINGS.browser.homeUrl } }))
    scheduleSave()
  },

  setTerminalAttentionEnabled: (enabled) => {
    set((state) => ({ terminal: { ...state.terminal, attentionEnabled: enabled } }))
    scheduleSave()
  },

  setAgentAlertsEnabled: (enabled) => {
    set((state) => ({ terminal: { ...state.terminal, agentAlertsEnabled: enabled } }))
    void window.electron.terminal.setAgentAlertsEnabled(enabled)
    scheduleSave()
  },

  setAgentEnabled: (provider, enabled) => {
    set((state) => ({ agents: { ...state.agents, [provider]: { enabled } } }))
    scheduleSave()
  },

  setTerminalThemeId: (themeId) => {
    set((state) => ({ terminal: { ...state.terminal, themeId } }))
    scheduleSave()
  },

  setNotificationAttentionDelayEnabled: (enabled) => {
    set((state) => ({ notifications: { ...state.notifications, attentionDelayEnabled: enabled } }))
    scheduleSave()
  },

  setDesktopAlertsEnabled: (enabled) => {
    set((state) => ({ notifications: { ...state.notifications, desktopAlertsEnabled: enabled } }))
    scheduleSave()
  },

  setTileCreationAvailable: (type, available) => {
    set((state) => ({
      tiles: {
        ...state.tiles,
        creationAvailability: {
          ...DEFAULT_USER_SETTINGS.tiles.creationAvailability,
          ...state.tiles.creationAvailability,
          [type]: available,
        },
      },
    }))
    scheduleSave()
  },

  setNewAgentSessionShortcut: (shortcut) => {
    const normalized = normalizeAccelerator(shortcut) ?? DEFAULT_USER_SETTINGS.shortcuts.newAgentSession
    set((state) => ({ shortcuts: { ...state.shortcuts, newAgentSession: normalized } }))
    scheduleSave()
  },

  applySettings: async (settings) => {
    const newAgentSessionShortcut = normalizeAccelerator(settings.shortcuts?.newAgentSession)
    const normalized = normalizeUserSettings({
      ...settings,
      shortcuts: {
        newAgentSession: newAgentSessionShortcut ?? DEFAULT_USER_SETTINGS.shortcuts.newAgentSession,
      },
      browser: {
        homeUrl: settings.browser.homeUrl.trim() || DEFAULT_USER_SETTINGS.browser.homeUrl,
      },
    })

    await window.electron.settings.save(normalized)
    set({
      ...normalized,
      browser: { ...normalized.browser },
      terminal: { ...normalized.terminal },
      notifications: { ...normalized.notifications },
      tiles: {
        creationAvailability: { ...normalized.tiles.creationAvailability },
      },
      shortcuts: { ...normalized.shortcuts },
    })
    await i18n.changeLanguage(normalized.language)
    void window.electron.terminal.setAgentAlertsEnabled(normalized.terminal.agentAlertsEnabled)
    const materialState = await window.electron.window.setBackgroundMaterial(normalized.windowBackgroundMaterial)
    set({
      activeWindowBackgroundMaterial: materialState.active,
      windowBackgroundMaterialRequiresRestart: materialState.requiresRestart,
    })
  },

  loadSettings: async () => {
    try {
      const settings = await window.electron.settings.load()
      if (settings) {
        const newAgentSessionShortcut = normalizeAccelerator(settings.shortcuts?.newAgentSession)
        const normalized = normalizeUserSettings({
          ...settings,
          shortcuts: {
            newAgentSession: newAgentSessionShortcut ?? DEFAULT_USER_SETTINGS.shortcuts.newAgentSession,
          },
        })
        const materialState = await window.electron.window.setBackgroundMaterial(normalized.windowBackgroundMaterial)
        set({
          agents: { claude: { ...normalized.agents.claude }, codex: { ...normalized.agents.codex } },
          language: normalized.language,
          themeId: normalized.themeId,
          appearance: normalized.appearance,
          windowBackgroundMaterial: normalized.windowBackgroundMaterial,
          activeWindowBackgroundMaterial: materialState.active,
          windowBackgroundMaterialRequiresRestart: materialState.requiresRestart,
          interfaceFontSizePx: normalized.interfaceFontSizePx,
          tileFontSizePx: normalized.tileFontSizePx,
          showGrid: normalized.showGrid,
          snapToGrid: normalized.snapToGrid,
          gridSize: normalized.gridSize,
          updateDiagnosticsEnabled: normalized.updateDiagnosticsEnabled,
          updateDiagnosticsMigrationComplete: normalized.updateDiagnosticsMigrationComplete,
          browser: {
            homeUrl: normalized.browser.homeUrl,
          },
          terminal: {
            attentionEnabled: normalized.terminal.attentionEnabled,
            agentAlertsEnabled: normalized.terminal.agentAlertsEnabled,
            themeId: normalized.terminal.themeId,
          },
          notifications: {
            attentionDelayEnabled: normalized.notifications.attentionDelayEnabled,
            desktopAlertsEnabled: normalized.notifications.desktopAlertsEnabled,
          },
          tiles: {
            creationAvailability: {
              ...DEFAULT_USER_SETTINGS.tiles.creationAvailability,
              ...normalized.tiles.creationAvailability,
            },
          },
          shortcuts: { ...normalized.shortcuts },
          loaded: true,
        })
        void window.electron.terminal.setAgentAlertsEnabled(normalized.terminal.agentAlertsEnabled)
      } else {
        const materialState = await window.electron.window.getBackgroundMaterialState()
        set({
          loaded: true,
          activeWindowBackgroundMaterial: materialState.active,
          windowBackgroundMaterialRequiresRestart: materialState.requiresRestart,
        })
      }
    } catch (err) {
      console.error('[settingsStore] Failed to load settings:', err)
      set({ loaded: true })
    }
  },

  saveSettings: () => {
    const state = get()
    const settings: UserSettings = {
      agents: { claude: { ...state.agents.claude }, codex: { ...state.agents.codex } },
      language: state.language,
      themeId: state.themeId,
      appearance: state.appearance,
      windowBackgroundMaterial: state.windowBackgroundMaterial,
      interfaceFontSizePx: state.interfaceFontSizePx,
      tileFontSizePx: state.tileFontSizePx,
      showGrid: state.showGrid,
      snapToGrid: state.snapToGrid,
      gridSize: state.gridSize,
      updateDiagnosticsEnabled: state.updateDiagnosticsEnabled,
      updateDiagnosticsMigrationComplete: state.updateDiagnosticsMigrationComplete,
      browser: { homeUrl: state.browser.homeUrl },
      terminal: {
        attentionEnabled: state.terminal.attentionEnabled,
        agentAlertsEnabled: state.terminal.agentAlertsEnabled,
        themeId: state.terminal.themeId,
      },
      notifications: {
        attentionDelayEnabled: state.notifications.attentionDelayEnabled,
        desktopAlertsEnabled: state.notifications.desktopAlertsEnabled,
      },
      tiles: {
        creationAvailability: {
          ...DEFAULT_USER_SETTINGS.tiles.creationAvailability,
          ...state.tiles.creationAvailability,
        },
      },
      shortcuts: { ...state.shortcuts },
    }
    window.electron.settings.save(settings)
  },
}))
