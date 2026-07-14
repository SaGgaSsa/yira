export function normalizeBrowserUrl(raw: string): string {
  const value = raw.trim()
  if (!value) return 'about:blank'
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)) return value
  return `https://${value}`
}

export function getBrowserTileUrl(url: string | undefined, homeUrl: string): string {
  return normalizeBrowserUrl(url ?? homeUrl)
}
