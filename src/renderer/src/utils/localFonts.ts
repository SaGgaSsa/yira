interface LocalFontData {
  family: string
}

interface LocalFontAccessWindow {
  queryLocalFonts?: () => Promise<LocalFontData[]>
}

export interface InstalledFontFamilies {
  all: string[]
  monospace: string[]
}

let cachedFontFamilies: Promise<InstalledFontFamilies> | null = null

function emptyFontFamilies(): InstalledFontFamilies {
  return { all: [], monospace: [] }
}

function isMonospaceFamily(context: CanvasRenderingContext2D, family: string): boolean {
  context.font = `16px "${family}", serif`
  const narrowWidth = context.measureText('iiiiiiiiii').width
  const wideWidth = context.measureText('WWWWWWWWWW').width
  return Math.abs(narrowWidth - wideWidth) < 0.5
}

async function readInstalledFontFamilies(): Promise<InstalledFontFamilies> {
  const localWindow = window as unknown as LocalFontAccessWindow
  if (typeof localWindow.queryLocalFonts !== 'function') {
    throw new Error('Local Font Access API is unavailable')
  }

  const fonts = await localWindow.queryLocalFonts()
  const all = [...new Set(fonts.map((font) => font.family))]
    .sort((left, right) => left.localeCompare(right))
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return { all, monospace: [] }

  return {
    all,
    monospace: all.filter((family) => isMonospaceFamily(context, family)),
  }
}

/** Resolves installed families once; failures are not cached so a later call can retry. */
export function loadInstalledFontFamilies(): Promise<InstalledFontFamilies> {
  if (cachedFontFamilies) return cachedFontFamilies

  cachedFontFamilies = readInstalledFontFamilies().catch(() => {
    cachedFontFamilies = null
    return emptyFontFamilies()
  })
  return cachedFontFamilies
}
