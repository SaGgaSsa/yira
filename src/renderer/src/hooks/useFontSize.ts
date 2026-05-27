import { useEffect } from 'react'
import { useSettingsStore } from '@/store/settingsStore'
import { clampFontSizePx } from '@shared/userSettings'

function setPxVar(style: CSSStyleDeclaration, name: string, value: number): void {
  style.setProperty(name, `${clampFontSizePx(value)}px`)
}

export function useFontSize() {
  const interfaceFontSizePx = useSettingsStore((s) => s.interfaceFontSizePx)
  const tileFontSizePx = useSettingsStore((s) => s.tileFontSizePx)

  useEffect(() => {
    const style = document.documentElement.style
    setPxVar(style, '--interface-font-base', interfaceFontSizePx)
    setPxVar(style, '--tile-font-base', tileFontSizePx)
  }, [interfaceFontSizePx, tileFontSizePx])

  return { interfaceFontSizePx, tileFontSizePx }
}
