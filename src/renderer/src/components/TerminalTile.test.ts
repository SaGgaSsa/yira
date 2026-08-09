import { createRequire } from 'node:module'
import type { CanvasState, TileState } from '@shared/types'
import { useCanvasStore } from '@/store/canvasStore'

const require = createRequire(import.meta.url)
const cssExtensions = require.extensions as Record<string, (module: NodeModule, filename: string) => void>
cssExtensions['.css'] = () => {}
const { transformSync } = require('esbuild') as typeof import('esbuild')

const loadWithJiti = require('jiti')(__filename, {
  extensions: ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.json'],
  transform: ({ source, filename }: { source: string; filename: string }) => ({
    code: transformSync(source, {
      loader: filename.endsWith('.tsx') ? 'tsx' : filename.endsWith('.ts') ? 'ts' : 'js',
      format: 'cjs',
      platform: 'node',
      target: 'node22',
    }).code,
  }),
}) as (id: string) => typeof import('./TerminalTile')
const { handleTerminalOutput } = loadWithJiti('./TerminalTile.tsx')

const terminalTile: TileState = {
  id: 'terminal',
  type: 'terminal',
  x: 0,
  y: 0,
  width: 900,
  height: 400,
  zIndex: 1,
}

const canvasState: CanvasState = {
  tiles: [terminalTile],
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

interface MockTerminal {
  textarea: Element
  writes: string[]
  write: (data: string) => void
}

function createMockTerminal(): MockTerminal {
  return {
    textarea: {} as Element,
    writes: [],
    write(data) {
      this.writes.push(data)
    },
  }
}

function resetCanvas(tile: TileState = terminalTile): void {
  useCanvasStore.getState().restoreState({ ...canvasState, tiles: [tile] })
  useCanvasStore.getState().registerTerminalCreated(tile.id, 0)
}

function runOutput(
  terminal: MockTerminal,
  options: {
    attentionEnabled?: boolean
    notificationsMuted?: boolean
    isWindowFocused?: boolean
    activeElement?: Element | null
  } = {},
): void {
  handleTerminalOutput({
    data: 'output',
    term: terminal,
    attentionEnabled: options.attentionEnabled ?? true,
    notificationsMuted: options.notificationsMuted ?? false,
    isWindowFocused: options.isWindowFocused ?? false,
    activeElement: options.activeElement ?? null,
    markActivity: () => {
      useCanvasStore.getState().markTerminalOutput('terminal')
    },
    clearActivity: () => {
      useCanvasStore.getState().clearTerminalAttention('terminal')
    },
  })
}

const realDateNow = Date.now
try {
  let now = 5_000
  Date.now = () => now

  resetCanvas()
  const unattendedTerminal = createMockTerminal()
  runOutput(unattendedTerminal)
  if (unattendedTerminal.writes.length !== 1) throw new Error('unattended terminal output must be written to xterm')
  if (useCanvasStore.getState().terminalAttention.terminal?.count !== 1) {
    throw new Error('unattended terminal output must create an activity badge')
  }

  now = 7_001
  runOutput(unattendedTerminal)
  if (useCanvasStore.getState().terminalAttention.terminal?.count !== 2) {
    throw new Error('unattended terminal output after a burst pause must increment the activity badge')
  }

  resetCanvas({ ...terminalTile, notificationsMuted: true })
  const mutedTerminal = createMockTerminal()
  runOutput(mutedTerminal, { notificationsMuted: true })
  if (useCanvasStore.getState().terminalAttention.terminal) {
    throw new Error('muted terminal output must not create activity')
  }

  resetCanvas()
  const focusedTerminal = createMockTerminal()
  runOutput(focusedTerminal)
  if (!useCanvasStore.getState().terminalAttention.terminal) {
    throw new Error('focused-terminal clear setup must create activity first')
  }
  runOutput(focusedTerminal, { isWindowFocused: true, activeElement: focusedTerminal.textarea })
  if (useCanvasStore.getState().terminalAttention.terminal) {
    throw new Error('focusing the xterm textarea must clear the activity badge')
  }

  let nativeRequests = 0
  let scheduledAttention = 0
  const previousWindow = (globalThis as { window?: unknown }).window
  const previousSetTimeout = globalThis.setTimeout
  ;(globalThis as { window?: unknown }).window = {
    electron: {
      notifications: {
        requestAttention: () => {
          nativeRequests += 1
        },
      },
    },
  }
  globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
    scheduledAttention += 1
    return previousSetTimeout(...args)
  }) as typeof setTimeout

  try {
    resetCanvas()
    runOutput(createMockTerminal())
  } finally {
    globalThis.setTimeout = previousSetTimeout
    ;(globalThis as { window?: unknown }).window = previousWindow
  }

  if (nativeRequests !== 0) throw new Error('terminal output must not request native attention')
  if (scheduledAttention !== 0) throw new Error('terminal output must not schedule native attention')
} finally {
  Date.now = realDateNow
}
