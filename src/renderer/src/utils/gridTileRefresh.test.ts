import { refreshGridTileContent } from './gridTileRefresh'

const refreshed = refreshGridTileContent(
  { removed: 4, surviving: 2, detached: 9 },
  [
    { id: 'surviving', type: 'terminal' },
    { id: 'detached', type: 'terminal', floating: { detached: true } },
  ],
)

if (refreshed.surviving !== 3) {
  throw new Error('deleting a grid tile must remount surviving attached tile content')
}

if ('removed' in refreshed) {
  throw new Error('deleting a grid tile must discard the removed tile refresh key')
}

if (refreshed.detached !== 9) {
  throw new Error('deleting a grid tile must not refresh detached tile content')
}
