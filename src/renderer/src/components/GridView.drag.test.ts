import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./GridView.tsx', import.meta.url), 'utf8')

if (source.includes("targetTileId === drag.sourceTileId && drag.pendingAction.type !== 'none'")) {
  throw new Error('moving over the projected source tile must clear the stale grid drag preview')
}
