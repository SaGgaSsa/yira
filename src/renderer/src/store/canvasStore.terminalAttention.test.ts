import { useCanvasStore } from './canvasStore'
import type { CanvasState } from '@shared/types'

const state: CanvasState = {
  tiles: [
    { id: 'terminal', type: 'terminal', x: 0, y: 0, width: 900, height: 400, zIndex: 1 },
  ],
  groups: [],
  viewport: { tx: 0, ty: 0, zoom: 1 },
  nextZIndex: 2,
  focusedTileId: null,
  viewMode: 'canvas',
  fullviewActiveTileId: null,
  splitViewState: {
    leftTileIds: [],
    rightTileIds: [],
    activeLeftTileId: null,
    activeRightTileId: null,
    focusedPanel: 'left',
    orientation: 'vertical',
  },
}

useCanvasStore.getState().restoreState(state)
useCanvasStore.getState().registerTerminalCreated('terminal', 1_000)

const graceMarked = useCanvasStore.getState().markTerminalOutput('terminal', 2_999)
if (graceMarked) throw new Error('terminal output inside startup grace must not mark attention')
if (useCanvasStore.getState().terminalAttention.terminal) throw new Error('startup grace must not create attention state')

const firstMarked = useCanvasStore.getState().markTerminalOutput('terminal', 3_001)
if (!firstMarked) throw new Error('first output after startup grace must mark attention')
if (useCanvasStore.getState().terminalAttention.terminal?.count !== 1) throw new Error('first marked output must count 1')

const sameBurstMarked = useCanvasStore.getState().markTerminalOutput('terminal', 4_500)
if (sameBurstMarked) throw new Error('same burst output must update state without requesting a new mark')
if (useCanvasStore.getState().terminalAttention.terminal?.count !== 1) throw new Error('same burst output must not increment count')

const secondBurstMarked = useCanvasStore.getState().markTerminalOutput('terminal', 6_501)
if (!secondBurstMarked) throw new Error('output after burst pause must request a new mark')
if (useCanvasStore.getState().terminalAttention.terminal?.count !== 2) throw new Error('second burst must increment count')

useCanvasStore.getState().clearTerminalAttention('terminal')
if (useCanvasStore.getState().terminalAttention.terminal) throw new Error('clear must remove terminal attention state')

useCanvasStore.getState().markTerminalOutput('terminal', 9_000)
useCanvasStore.getState().removeTile('terminal')
if (useCanvasStore.getState().terminalAttention.terminal) throw new Error('removing a tile must remove terminal attention state')

useCanvasStore.getState().restoreState({
  ...state,
  tiles: [
    { id: 'terminal', type: 'terminal', x: 0, y: 0, width: 900, height: 400, zIndex: 1, notificationsMuted: true },
  ],
})
useCanvasStore.getState().registerTerminalCreated('terminal', 10_000)
const mutedMarked = useCanvasStore.getState().markTerminalOutput('terminal', 13_000)
if (mutedMarked) throw new Error('muted terminal output must not request attention')
if (useCanvasStore.getState().terminalAttention.terminal) throw new Error('muted terminal output must not create attention state')
