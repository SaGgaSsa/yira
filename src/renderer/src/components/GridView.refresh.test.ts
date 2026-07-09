import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./GridView.tsx', import.meta.url), 'utf8')

if (!source.includes('tileRefreshKeys: Record<string, number>')) {
  throw new Error('GridView must receive tile refresh keys')
}

if (!source.includes('key={`${tile.id}:${tileRefreshKeys[tile.id] ?? 0}`}')) {
  throw new Error('GridView must remount refreshed tile content')
}
