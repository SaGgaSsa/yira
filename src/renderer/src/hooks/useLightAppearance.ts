import { useEffect, useState } from 'react'

// Tracks the resolved light/dark mode that useTheme applies to <html>.
export function useLightAppearance(): boolean {
  const [light, setLight] = useState(() => document.documentElement.classList.contains('light'))

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setLight(root.classList.contains('light')))
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    setLight(root.classList.contains('light'))
    return () => observer.disconnect()
  }, [])

  return light
}
