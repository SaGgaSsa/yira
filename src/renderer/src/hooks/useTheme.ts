import { useEffect } from 'react'
import { useSettingsStore } from '@/store/settingsStore'

export function useTheme() {
  const appearance = useSettingsStore((s) => s.appearance)

  useEffect(() => {
    const root = document.documentElement

    const applyTheme = (dark: boolean) => {
      if (dark) {
        root.classList.remove('light')
      } else {
        root.classList.add('light')
      }
    }

    if (appearance === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      applyTheme(prefersDark)

      const listener = (e: MediaQueryListEvent) => applyTheme(e.matches)
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', listener)
      return () => mq.removeEventListener('change', listener)
    }

    applyTheme(appearance === 'dark')
  }, [appearance])

  return appearance
}
