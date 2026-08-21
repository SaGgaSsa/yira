import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type { CanvasState, TileState } from '@shared/types'
import { useCanvasStore } from '@/store/canvasStore'

const require = createRequire(import.meta.url)
const cssExtensions = require.extensions as Record<string, (module: NodeModule, filename: string) => void>
cssExtensions['.css'] = () => {}
const { transformSync } = require('esbuild') as typeof import('esbuild')

const loadWithJiti = require('jiti')(fileURLToPath(import.meta.url), {
  extensions: ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.json'],
  transform: ({ source, filename }: { source: string; filename: string }) => ({
    code: transformSync(source, {
      loader: filename.endsWith('.tsx') ? 'tsx' : filename.endsWith('.ts') ? 'ts' : 'js',
      format: 'cjs',
      platform: 'node',
      target: 'node22',
    }).code,
  }),
}) as <T>(id: string) => T
const { getTileNotificationCopy } = loadWithJiti<typeof import('./TileEditorDialog')>('./TileEditorDialog.tsx')
const { registerSynchronizedOutputRefresh } = loadWithJiti<typeof import('../utils/terminalSynchronizedOutputRefresh')>('../utils/terminalSynchronizedOutputRefresh.ts')
const {
  handleTerminalAgentAlert,
  handleTerminalOutput,
  registerTerminalInputFocusListener,
  scheduleWorkspaceActivationFit,
} = loadWithJiti<typeof import('./TerminalTile')>('./TerminalTile.tsx')

if (typeof registerSynchronizedOutputRefresh !== 'function') {
  throw new Error('terminal must register a synchronized-output refresh handler')
}

const synchronizedRefreshCalls: Array<{ start: number; end: number }> = []
let synchronizedTerminalVisible = true
const synchronizedOutputState: {
  handler: ((params: (number | number[])[]) => boolean) | null
  handlerDisposed: boolean
  queuedRefresh: (() => void) | null
} = {
  handler: null,
  handlerDisposed: false,
  queuedRefresh: null,
}
const getSynchronizedRefreshCallCount = (): number => synchronizedRefreshCalls.length

const disposeSynchronizedOutputRefresh = registerSynchronizedOutputRefresh({
  parser: {
    registerCsiHandler: (identifier, handler) => {
      if (identifier.prefix !== '?' || identifier.final !== 'l') {
        throw new Error('synchronized-output refresh must observe DEC private mode resets')
      }
      synchronizedOutputState.handler = handler
      return {
        dispose: () => {
          synchronizedOutputState.handlerDisposed = true
        },
      }
    },
  },
  refresh: (start, end) => {
    synchronizedRefreshCalls.push({ start, end })
  },
  getRows: () => 30,
  isVisible: () => synchronizedTerminalVisible,
  requestFrame: (callback) => {
    synchronizedOutputState.queuedRefresh = callback
    return 1
  },
  cancelFrame: () => {
    synchronizedOutputState.queuedRefresh = null
  },
})

const synchronizedOutputHandler = synchronizedOutputState.handler
if (!synchronizedOutputHandler) throw new Error('synchronized-output refresh handler must be registered')
const synchronizedOutputHandled = synchronizedOutputHandler([2026])
if (synchronizedOutputHandled !== false) {
  throw new Error('synchronized-output refresh handler must preserve xterm mode reset handling')
}
synchronizedOutputHandler([2026])
const queuedSynchronizedRefresh = synchronizedOutputState.queuedRefresh
if (!queuedSynchronizedRefresh) throw new Error('synchronized-output completion must schedule a refresh')
if (getSynchronizedRefreshCallCount() !== 0) {
  throw new Error('synchronized-output completion must defer refresh until the next frame')
}
queuedSynchronizedRefresh()
if (getSynchronizedRefreshCallCount() !== 1) {
  throw new Error('synchronized-output completions in one frame must coalesce into one refresh')
}
if (synchronizedRefreshCalls[0]?.start !== 0 || synchronizedRefreshCalls[0]?.end !== 29) {
  throw new Error('synchronized-output completion must refresh the complete visible terminal')
}

synchronizedTerminalVisible = false
synchronizedOutputHandler([2026])
const hiddenSynchronizedRefresh = synchronizedOutputState.queuedRefresh
if (!hiddenSynchronizedRefresh) throw new Error('synchronized-output completion must still use a deferred visibility check')
hiddenSynchronizedRefresh()
if (getSynchronizedRefreshCallCount() !== 1) {
  throw new Error('synchronized-output completion must not refresh a hidden terminal')
}

disposeSynchronizedOutputRefresh()
if (!synchronizedOutputState.handlerDisposed) {
  throw new Error('synchronized-output refresh cleanup must dispose its parser handler')
}

let queuedWorkspaceFitFrames: Array<{ id: number; callback: () => void }> = []
let nextWorkspaceFitFrameId = 1
const workspaceFitState = { calls: 0 }
const getWorkspaceFitCalls = (): number => workspaceFitState.calls

const cancelWorkspaceActivationFit = scheduleWorkspaceActivationFit(
  () => {
    workspaceFitState.calls += 1
  },
  (callback) => {
    const id = nextWorkspaceFitFrameId++
    queuedWorkspaceFitFrames.push({ id, callback })
    return id
  },
  (id) => {
    queuedWorkspaceFitFrames = queuedWorkspaceFitFrames.filter((frame) => frame.id !== id)
  },
)

const firstWorkspaceFitFrame = queuedWorkspaceFitFrames.shift()
if (!firstWorkspaceFitFrame) throw new Error('workspace activation must defer the first terminal fit')
firstWorkspaceFitFrame.callback()

if (getWorkspaceFitCalls() !== 0) {
  throw new Error('workspace activation must wait for the layout stabilization frame before fitting')
}

const finalWorkspaceFitFrame = queuedWorkspaceFitFrames.shift()
if (!finalWorkspaceFitFrame) throw new Error('workspace activation must schedule a layout stabilization fit')
finalWorkspaceFitFrame.callback()

if (getWorkspaceFitCalls() !== 1) throw new Error('workspace activation must fit once after layout stabilization')

cancelWorkspaceActivationFit()

const cancelledWorkspaceFit = scheduleWorkspaceActivationFit(
  () => {
    throw new Error('cancelled workspace activation fit must not run')
  },
  (callback) => {
    const id = nextWorkspaceFitFrameId++
    queuedWorkspaceFitFrames.push({ id, callback })
    return id
  },
  (id) => {
    queuedWorkspaceFitFrames = queuedWorkspaceFitFrames.filter((frame) => frame.id !== id)
  },
)
cancelledWorkspaceFit()

if (queuedWorkspaceFitFrames.length !== 0) {
  throw new Error('cancelling workspace activation fit must remove its pending frame')
}

const cancelFinalWorkspaceFit = scheduleWorkspaceActivationFit(
  () => {
    throw new Error('cancelled workspace stabilization fit must not run')
  },
  (callback) => {
    const id = nextWorkspaceFitFrameId++
    queuedWorkspaceFitFrames.push({ id, callback })
    return id
  },
  (id) => {
    queuedWorkspaceFitFrames = queuedWorkspaceFitFrames.filter((frame) => frame.id !== id)
  },
)
const workspacePreparationFrame = queuedWorkspaceFitFrames.shift()
if (!workspacePreparationFrame) throw new Error('workspace activation must schedule a preparation frame')
workspacePreparationFrame.callback()
cancelFinalWorkspaceFit()

if (queuedWorkspaceFitFrames.length !== 0) {
  throw new Error('cancelling workspace activation fit must remove its stabilization frame')
}

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
    textarea: new EventTarget() as Element,
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

  const removeFocusListener = registerTerminalInputFocusListener({
    terminalInput: focusedTerminal.textarea,
    textarea: focusedTerminal.textarea,
    isWindowFocused: () => true,
    getActiveElement: () => focusedTerminal.textarea,
    attentionEnabled: () => true,
    clearActivity: () => {
      useCanvasStore.getState().clearTerminalAttention('terminal')
    },
  })
  focusedTerminal.textarea.dispatchEvent(new Event('focus'))
  removeFocusListener()

  if (useCanvasStore.getState().terminalAttention.terminal) {
    throw new Error('focusing the xterm textarea must clear the activity badge')
  }
  if (focusedTerminal.writes.length !== 1) {
    throw new Error('focusing the xterm textarea must clear activity without another PTY output event')
  }

  const agentAlertTerminal = createMockTerminal()
  if (typeof handleTerminalAgentAlert !== 'function') {
    throw new Error('agent alerts must be handled without appending a Yira message to the terminal')
  }
  handleTerminalAgentAlert({ provider: 'claude', event: 'completed' }, agentAlertTerminal)
  if (agentAlertTerminal.writes.length !== 0) {
    throw new Error('agent alerts must not append Yira status text to terminal output')
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

const translate = (key: string): string => key
const terminalCopy = getTileNotificationCopy('terminal', translate)
if (terminalCopy.label !== 'settings.terminalActivity') {
  throw new Error('terminal editor copy must describe activity, not native notifications')
}
if (terminalCopy.description !== 'settings.terminalActivityDescription') {
  throw new Error('terminal editor copy must describe output counters without native attention')
}

const timerCopy = getTileNotificationCopy('timer', translate)
if (timerCopy.label !== 'settings.timerNativeAttention') {
  throw new Error('timer editor copy must retain native-attention wording')
}
if (timerCopy.description !== 'settings.timerNativeAttentionDescription') {
  throw new Error('timer editor copy must explain timer native attention')
}
