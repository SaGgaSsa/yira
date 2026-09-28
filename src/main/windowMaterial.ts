import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { release } from 'os'
import type { WindowBackgroundMaterial } from '@shared/types'

const OPAQUE_BACKGROUND = '#15171a'
const TRANSPARENT_BACKGROUND = '#00000000'

let currentMaterial: WindowBackgroundMaterial = 'none'

export function supportsBackgroundMaterial(): boolean {
  if (process.platform !== 'win32') return false
  const build = Number(release().split('.')[2])
  return Number.isFinite(build) && build >= 22000
}

export function getWindowBackgroundMaterial(): WindowBackgroundMaterial {
  return currentMaterial
}

export function setWindowBackgroundMaterial(material: WindowBackgroundMaterial): void {
  currentMaterial = supportsBackgroundMaterial() ? material : 'none'
  const color = currentMaterial === 'none' ? OPAQUE_BACKGROUND : TRANSPARENT_BACKGROUND
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    window.setBackgroundMaterial(currentMaterial)
    window.setBackgroundColor(color)
  }
}

export function getWindowMaterialOptions(): Pick<BrowserWindowConstructorOptions, 'backgroundMaterial' | 'backgroundColor'> {
  if (currentMaterial === 'none') return { backgroundColor: OPAQUE_BACKGROUND }
  return { backgroundMaterial: currentMaterial, backgroundColor: TRANSPARENT_BACKGROUND }
}
