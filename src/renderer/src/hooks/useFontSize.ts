import { useEffect } from 'react'
import { useSettingsStore } from '@/store/settingsStore'

const FONT_SIZES = {
  small: '14px',
  medium: '16px',
  large: '18px',
}

export function useFontSize() {
  const fontSize = useSettingsStore((s) => s.fontSize)

  useEffect(() => {
    document.documentElement.style.fontSize = FONT_SIZES[fontSize]
  }, [fontSize])

  return fontSize
}
