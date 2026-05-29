import { normalizeBrowserUrl } from './browserUrl'

const blank = normalizeBrowserUrl('')
if (blank !== 'about:blank') throw new Error(`blank browser URLs must normalize to about:blank, got ${blank}`)

const host = normalizeBrowserUrl('example.org')
if (host !== 'https://example.org') throw new Error(`host browser URLs must add https://, got ${host}`)

const explicit = normalizeBrowserUrl('http://localhost:3000')
if (explicit !== 'http://localhost:3000') throw new Error(`explicit browser URLs must be preserved, got ${explicit}`)
