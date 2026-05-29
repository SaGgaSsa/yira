import { create } from 'zustand'
import type { UserSettings, AppearanceMode, ConfigurableTileCreationType } from '@shared/types'
import { DEFAULT_USER_SETTINGS } from '@shared/types'
import { clampFontSizePx, normalizeUserSettings } from '@shared/userSettings'

export interface SettingsState extends UserSettings {
  loaded: boolean

  // Actions
  setAppearance: (mode: AppearanceMode) => void
  setInterfaceFontSizePx: (size: number) => void
  setTileFontSizePx: (size: number) => void
  setShowGrid: (show: boolean) => void
  setSnapToGrid: (snap: boolean) => void
  setGridSize: (size: number) => void
  setBrowserHomeUrl: (url: string) => void
  setTerminalAttentionEnabled: (enabled: boolean) => void
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
      appearance: state.appearance,
      interfaceFontSizePx: state.interfaceFontSizePx,
      tileFontSizePx: state.tileFontSizePx,
      showGrid: state.showGrid,
      snapToGrid: state.snapToGrid,
      gridSize: state.gridSize,
      browser: { homeUrl: state.browser.homeUrl },
      terminal: { attentionEnabled: state.terminal.attentionEnabled },
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

  setBrowserHomeUrl: (url) => {
    set((state) => ({ browser: { ...state.browser, homeUrl: url.trim() || DEFAULT_USER_SETTINGS.browser.homeUrl } }))
    scheduleSave()
  },

  setTerminalAttentionEnabled: (enabled) => {
    set((state) => ({ terminal: { ...state.terminal, attentionEnabled: enabled } }))
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
          appearance: normalized.appearance,
          interfaceFontSizePx: normalized.interfaceFontSizePx,
          tileFontSizePx: normalized.tileFontSizePx,
          showGrid: normalized.showGrid,
          snapToGrid: normalized.snapToGrid,
          gridSize: normalized.gridSize,
          browser: {
            homeUrl: normalized.browser.homeUrl,
          },
          terminal: {
            attentionEnabled: normalized.terminal.attentionEnabled,
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
      appearance: state.appearance,
      interfaceFontSizePx: state.interfaceFontSizePx,
      tileFontSizePx: state.tileFontSizePx,
      showGrid: state.showGrid,
      snapToGrid: state.snapToGrid,
      gridSize: state.gridSize,
      browser: { homeUrl: state.browser.homeUrl },
      terminal: { attentionEnabled: state.terminal.attentionEnabled },
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
