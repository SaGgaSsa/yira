import { getBrowserTileUrl, normalizeBrowserUrl } from './browserUrl'

const blank = normalizeBrowserUrl('')
if (blank !== 'about:blank') throw new Error(`blank browser URLs must normalize to about:blank, got ${blank}`)

const host = normalizeBrowserUrl('example.org')
if (host !== 'https://example.org') throw new Error(`host browser URLs must add https://, got ${host}`)

const explicit = normalizeBrowserUrl('http://localhost:3000')
if (explicit !== 'http://localhost:3000') throw new Error(`explicit browser URLs must be preserved, got ${explicit}`)

const clicked = getBrowserTileUrl('https://example.com/path?tab=1', 'https://start.example')
if (clicked !== 'https://example.com/path?tab=1') {
  throw new Error(`clicked terminal links must be preserved, got ${clicked}`)
}

const defaultUrl = getBrowserTileUrl(undefined, 'start.example')
if (defaultUrl !== 'https://start.example') {
  throw new Error(`browser home URLs must be normalized, got ${defaultUrl}`)
}
