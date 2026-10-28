import { useEffect } from 'react'
import { useSettingsStore } from '@/store/settingsStore'
import {
  DEFAULT_INTERFACE_FONT_STACK,
  DEFAULT_MONO_FONT_STACK,
  buildFontStack,
  clampFontSizePx,
  normalizeFontFamily,
} from '@shared/userSettings'

function setPxVar(style: CSSStyleDeclaration, name: string, value: number): void {
  style.setProperty(name, `${clampFontSizePx(value)}px`)
}

/** Overrides the stylesheet stack only when a family is chosen, so the bundled default stays in index.css. */
function setFontFamilyVar(style: CSSStyleDeclaration, name: string, family: string, fallbackStack: string): void {
  if (normalizeFontFamily(family)) style.setProperty(name, buildFontStack(family, fallbackStack))
  else style.removeProperty(name)
}

export function useFontSize() {
  const interfaceFontSizePx = useSettingsStore((s) => s.interfaceFontSizePx)
  const tileFontSizePx = useSettingsStore((s) => s.tileFontSizePx)
  const interfaceFontFamily = useSettingsStore((s) => s.interfaceFontFamily)
  const monoFontFamily = useSettingsStore((s) => s.monoFontFamily)

  useEffect(() => {
    const style = document.documentElement.style
    setPxVar(style, '--interface-font-base', interfaceFontSizePx)
    setPxVar(style, '--tile-font-base', tileFontSizePx)
  }, [interfaceFontSizePx, tileFontSizePx])

  useEffect(() => {
    const style = document.documentElement.style
    setFontFamilyVar(style, '--font-body', interfaceFontFamily, DEFAULT_INTERFACE_FONT_STACK)
    setFontFamilyVar(style, '--font-mono', monoFontFamily, DEFAULT_MONO_FONT_STACK)
  }, [interfaceFontFamily, monoFontFamily])

  return { interfaceFontSizePx, tileFontSizePx }
}
