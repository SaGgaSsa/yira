import { useLayoutEffect } from 'react'
import { useSettingsStore } from '@/store/settingsStore'
import { getAppThemeTokens } from '@shared/appThemes'

export function useTheme() {
  const appearance = useSettingsStore((s) => s.appearance)
  const themeId = useSettingsStore((s) => s.themeId)

  useLayoutEffect(() => {
    const root = document.documentElement
    const mq = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = () => {
      const light = themeId === 'default' && (appearance === 'light' || (appearance === 'system' && !mq.matches))
      root.classList.toggle('light', light)
      root.dataset.theme = themeId
      root.style.colorScheme = light ? 'light' : 'dark'
      for (const [token, value] of Object.entries(getAppThemeTokens(themeId, light))) {
        root.style.setProperty(token, value)
      }
      void window.electron.window.setTitleBarOverlayTheme(themeId === 'default' ? (light ? 'light' : 'dark') : themeId)
    }

    applyTheme()
    mq.addEventListener('change', applyTheme)
    return () => mq.removeEventListener('change', applyTheme)
  }, [appearance, themeId])

  return appearance
}
