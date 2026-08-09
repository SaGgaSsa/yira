import { create } from 'zustand'
import type { UserSettings, AppearanceMode, ConfigurableTileCreationType } from '@shared/types'
import { DEFAULT_USER_SETTINGS } from '@shared/types'
import type { TerminalThemeId } from '@shared/terminalThemes'
import { clampFontSizePx, normalizeUserSettings } from '@shared/userSettings'
import type { SupportedLanguage } from '@shared/language'
import { i18n } from '@/i18n'

export interface SettingsState extends UserSettings {
  loaded: boolean

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
  setTerminalThemeId: (themeId: TerminalThemeId) => void
  setNotificationAttentionDelayEnabled: (enabled: boolean) => void
  setTileCreationAvailable: (type: ConfigurableTileCreationType, available: boolean) => void
  setGroupsEnabled: (enabled: boolean) => void
  loadSettings: () => Promise<void>
  saveSettings: () => void
}

const autosaveTimer = { current: null as ReturnType<typeof setTimeout> | null }

function scheduleSave() {
  if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
  autosaveTimer.current = setTimeout(() => {
    const state = useSettingsStore.getState()
    const settings: UserSettings = {
      language: state.language,
      appearance: state.appearance,
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
      notifications: { attentionDelayEnabled: state.notifications.attentionDelayEnabled },
      tiles: {
        creationAvailability: {
          ...DEFAULT_USER_SETTINGS.tiles.creationAvailability,
          ...state.tiles.creationAvailability,
        },
      },
      groups: { enabled: state.groups.enabled },
    }
    window.electron.settings.save(settings)
  }, 500)
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_USER_SETTINGS,
  loaded: false,

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

  setTerminalThemeId: (themeId) => {
    set((state) => ({ terminal: { ...state.terminal, themeId } }))
    scheduleSave()
  },

  setNotificationAttentionDelayEnabled: (enabled) => {
    set((state) => ({ notifications: { ...state.notifications, attentionDelayEnabled: enabled } }))
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

  setGroupsEnabled: (enabled) => {
    set((state) => ({ groups: { ...state.groups, enabled } }))
    scheduleSave()
  },

  loadSettings: async () => {
    try {
      const settings = await window.electron.settings.load()
      if (settings) {
        const normalized = normalizeUserSettings(settings)
        set({
          language: normalized.language,
          appearance: normalized.appearance,
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
          },
          tiles: {
            creationAvailability: {
              ...DEFAULT_USER_SETTINGS.tiles.creationAvailability,
              ...normalized.tiles.creationAvailability,
            },
          },
          groups: {
            enabled: normalized.groups.enabled,
          },
          loaded: true,
        })
        void window.electron.terminal.setAgentAlertsEnabled(normalized.terminal.agentAlertsEnabled)
      } else {
        set({ loaded: true })
      }
    } catch (err) {
      console.error('[settingsStore] Failed to load settings:', err)
      set({ loaded: true })
    }
  },

  saveSettings: () => {
    const state = get()
    const settings: UserSettings = {
      language: state.language,
      appearance: state.appearance,
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
      notifications: { attentionDelayEnabled: state.notifications.attentionDelayEnabled },
      tiles: {
        creationAvailability: {
          ...DEFAULT_USER_SETTINGS.tiles.creationAvailability,
          ...state.tiles.creationAvailability,
        },
      },
      groups: { enabled: state.groups.enabled },
    }
    window.electron.settings.save(settings)
  },
}))
