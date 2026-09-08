import assert from 'node:assert/strict'
import { useCanvasStore } from './canvasStore'
import { normalizeGridWorkspaceState } from '@shared/gridWorkspaceState'
import { normalizeWorkspaceConfig } from '@shared/workspaceConfig'
import type { GridWorkspaceState, TileState } from '@shared/types'

const tile = (id: string, zIndex: number): TileState => ({
  id, type: 'terminal', x: 0, y: 0, width: 900, height: 400, zIndex,
})
const saved: GridWorkspaceState = {
  tiles: [tile('one', 1), tile('two', 2)],
  nextZIndex: 3,
  focusedTileId: 'two',
  fullviewActiveTileId: 'two',
  viewMode: 'splitview',
  gridViewState: { rootNode: null },
  splitViewState: {
    leftTileIds: ['one'],
    rightTileIds: ['two'],
    activeLeftTileId: 'one',
    activeRightTileId: 'two',
    focusedPanel: 'right',
    orientation: 'horizontal',
  },
}
const config = normalizeWorkspaceConfig({ type: 'grid' })
const persisted = normalizeGridWorkspaceState(JSON.parse(JSON.stringify(saved)) as GridWorkspaceState)
useCanvasStore.getState().restoreGridWorkspaceState('grid', 'Grid', config, persisted)
assert.equal(useCanvasStore.getState().viewMode, 'splitview')
assert.deepEqual(useCanvasStore.getState().splitViewState, saved.splitViewState)
useCanvasStore.getState().setWorkspace('grid', 'Grid', config)
assert.equal(useCanvasStore.getState().viewMode, 'splitview')

useCanvasStore.getState().addTile(tile('three', 3))
const added = useCanvasStore.getState()
assert.deepEqual(added.splitViewState.rightTileIds, ['two', 'three'])
assert.equal(added.splitViewState.activeRightTileId, 'three')
assert.ok(JSON.stringify(added.gridViewState.rootNode).includes('"tileId":"three"'))
const layout = added.gridViewState.rootNode
added.setViewMode('gridview')
assert.deepEqual(useCanvasStore.getState().gridViewState.rootNode, layout)
assert.equal(useCanvasStore.getState().splitViewState.orientation, 'horizontal')
