import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { release } from 'os'
import type { WindowBackgroundMaterial, WindowBackgroundMaterialState } from '@shared/types'

const OPAQUE_BACKGROUND = '#15171a'
const TRANSPARENT_BACKGROUND = '#00000000'

let activeMaterial: WindowBackgroundMaterial = 'none'
let requestedMaterial: WindowBackgroundMaterial = 'none'

export function supportsWindowsBackgroundMaterial(): boolean {
  if (process.platform !== 'win32') return false
  const build = Number(release().split('.')[2])
  return Number.isFinite(build) && build >= 22000
}

export function getSupportedWindowBackgroundMaterials(): WindowBackgroundMaterial[] {
  if (supportsWindowsBackgroundMaterial()) return ['none', 'mica', 'acrylic']
  if (process.platform === 'linux') return ['none', 'translucent']
  return ['none']
}

function getEffectiveMaterial(material: WindowBackgroundMaterial): WindowBackgroundMaterial {
  return getSupportedWindowBackgroundMaterials().includes(material) ? material : 'none'
}

export function getWindowBackgroundMaterial(): WindowBackgroundMaterial {
  return activeMaterial
}

export function getWindowBackgroundMaterialState(): WindowBackgroundMaterialState {
  const supported = getSupportedWindowBackgroundMaterials()
  const effectiveRequested = getEffectiveMaterial(requestedMaterial)
  return {
    supported,
    active: activeMaterial,
    requiresRestart: process.platform === 'linux' && effectiveRequested !== activeMaterial,
  }
}

export function setWindowBackgroundMaterial(material: WindowBackgroundMaterial, initializing = false): WindowBackgroundMaterialState {
  requestedMaterial = material
  const nextMaterial = getEffectiveMaterial(material)

  if (process.platform === 'linux') {
    if (initializing) activeMaterial = nextMaterial
    return getWindowBackgroundMaterialState()
  }

  if (!initializing && nextMaterial === activeMaterial) return getWindowBackgroundMaterialState()
  activeMaterial = nextMaterial
  const color = activeMaterial === 'none' ? OPAQUE_BACKGROUND : TRANSPARENT_BACKGROUND
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    if (process.platform === 'win32') window.setBackgroundMaterial(activeMaterial as 'none' | 'mica' | 'acrylic')
    window.setBackgroundColor(color)
  }
  return getWindowBackgroundMaterialState()
}

export function getWindowMaterialOptions(): Pick<BrowserWindowConstructorOptions, 'backgroundMaterial' | 'backgroundColor' | 'transparent'> {
  if (process.platform === 'linux') {
    return activeMaterial === 'translucent'
      ? { transparent: true, backgroundColor: TRANSPARENT_BACKGROUND }
      : { backgroundColor: OPAQUE_BACKGROUND }
  }
  if (activeMaterial === 'none') return { backgroundColor: OPAQUE_BACKGROUND }
  return { backgroundMaterial: activeMaterial as 'mica' | 'acrylic', backgroundColor: TRANSPARENT_BACKGROUND }
}
