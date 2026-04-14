import { create } from 'zustand'
import type { UserSettings, AppearanceMode, FontSize } from '@shared/types'
import { DEFAULT_USER_SETTINGS } from '@shared/types'

export interface SettingsState extends UserSettings {
  loaded: boolean

  // Actions
  setAppearance: (mode: AppearanceMode) => void
  setFontSize: (size: FontSize) => void
  setShowGrid: (show: boolean) => void
  setSnapToGrid: (snap: boolean) => void
  setGridSize: (size: number) => void
  setBrowserHomeUrl: (url: string) => void
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
      fontSize: state.fontSize,
      showGrid: state.showGrid,
      snapToGrid: state.snapToGrid,
      gridSize: state.gridSize,
      browser: { homeUrl: state.browser.homeUrl },
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

  setFontSize: (size) => {
    set({ fontSize: size })
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

  loadSettings: async () => {
    try {
      const settings = await window.electron.settings.load()
      if (settings) {
        set({
          appearance: settings.appearance ?? DEFAULT_USER_SETTINGS.appearance,
          fontSize: settings.fontSize ?? DEFAULT_USER_SETTINGS.fontSize,
          showGrid: settings.showGrid ?? DEFAULT_USER_SETTINGS.showGrid,
          snapToGrid: settings.snapToGrid ?? DEFAULT_USER_SETTINGS.snapToGrid,
          gridSize: settings.gridSize ?? DEFAULT_USER_SETTINGS.gridSize,
          browser: {
            homeUrl: settings.browser?.homeUrl ?? DEFAULT_USER_SETTINGS.browser.homeUrl,
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
      fontSize: state.fontSize,
      showGrid: state.showGrid,
      snapToGrid: state.snapToGrid,
      gridSize: state.gridSize,
      browser: { homeUrl: state.browser.homeUrl },
    }
    window.electron.settings.save(settings)
  },
}))
