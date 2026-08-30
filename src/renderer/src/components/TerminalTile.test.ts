import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import type { CanvasState, TileState } from '@shared/types'
import { useCanvasStore } from '@/store/canvasStore'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
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
const {
  handleTerminalAgentAlert,
  handleTerminalOutput,
  getRemoteTerminalExitEvent,
  RemoteTerminalReconnectNotice,
  restartTerminalAfterExit,
  registerTerminalInputFocusListener,
  shouldRegisterTerminalMarkdownLinks,
} = loadWithJiti<typeof import('./TerminalTile')>('./TerminalTile.tsx')

const preloadSource = await readFile(resolve(repositoryRoot, 'src/preload/index.ts'), 'utf8')
const electronTypesSource = await readFile(resolve(repositoryRoot, 'src/renderer/src/electron.d.ts'), 'utf8')
const terminalTileSource = await readFile(resolve(repositoryRoot, 'src/renderer/src/components/TerminalTile.tsx'), 'utf8')

if (!preloadSource.includes('terminalSessionDataChannel') || !preloadSource.includes('terminalSessionExitChannel')) {
  throw new Error('terminal preload listeners must use canonical identity channel helpers')
}
if (preloadSource.includes('`terminal:data:${tileId}`') || preloadSource.includes('`terminal:exit:${tileId}`')) {
  throw new Error('terminal preload listeners must not build channels from tile ids')
}
if (!preloadSource.includes("ipcRenderer.invoke('terminal:attach', identity)")) {
  throw new Error('terminal preload must attach a session after registering listeners')
}
if (!electronTypesSource.includes('create: (target: TerminalSessionTarget')) {
  throw new Error('terminal create must accept a workspace-scoped target')
}
if (!electronTypesSource.includes('write: (identity: TerminalSessionIdentity')) {
  throw new Error('terminal write must require a complete session identity')
}
for (const operation of ['resize', 'destroy', 'detach', 'acknowledgeAgentAlert', 'onData', 'onExit']) {
  if (!electronTypesSource.includes(`${operation}: (identity: TerminalSessionIdentity`)) {
    throw new Error(`terminal ${operation} must require a complete session identity`)
  }
}
if (!terminalTileSource.includes('sessionIdentityRef')) {
  throw new Error('TerminalTile must retain its session identity in a ref')
}
if (!terminalTileSource.includes('workspaceId: activeWorkspaceId')) {
  throw new Error('TerminalTile must create sessions with the active workspace id')
}
if (terminalTileSource.includes('term.reset()') || terminalTileSource.includes('term.clear()')) {
  throw new Error('terminal exit finalization must not reset or clear xterm')
}

const hiddenReconnectNotice = renderToStaticMarkup(
  createElement(RemoteTerminalReconnectNotice, {
    visible: false,
    reconnecting: false,
    onReconnect: () => undefined,
  }),
)
if (hiddenReconnectNotice !== '') {
  throw new Error('connected terminals must not show the SSH reconnect notice')
}

const reconnectNotice = renderToStaticMarkup(
  createElement(RemoteTerminalReconnectNotice, {
    visible: true,
    reconnecting: false,
    onReconnect: () => undefined,
  }),
)
if (!reconnectNotice.includes('SSH connection closed') || !reconnectNotice.includes('Reconnect')) {
  throw new Error('disconnected SSH terminals must show a reconnect action')
}
if (!reconnectNotice.includes('role="status"') || !reconnectNotice.includes('aria-live="polite"')) {
  throw new Error('the SSH reconnect notice must announce its dynamic status accessibly')
}

const reconnectSteps: string[] = []
await restartTerminalAfterExit(
  async () => {
    reconnectSteps.push('destroy')
  },
  () => {
    reconnectSteps.push('restart')
  },
)
if (reconnectSteps.join(',') !== 'destroy,restart') {
  throw new Error('SSH reconnect must destroy the exited session before starting a replacement')
}

let reconnectAttempt = 0
let replacements = 0
await restartTerminalAfterExit(
  async () => {
    reconnectAttempt += 1
    if (reconnectAttempt === 1) throw new Error('destroy failed')
  },
  () => {
    replacements += 1
  },
).catch(() => undefined)
await restartTerminalAfterExit(
  async () => {
    reconnectAttempt += 1
  },
  () => {
    replacements += 1
  },
)
if (reconnectAttempt !== 2 || replacements !== 1) {
  throw new Error('a failed SSH reconnect must allow a later retry without starting two replacements')
}

const retainedExit = { exitCode: 255, signal: 0 }
if (getRemoteTerminalExitEvent('remote-ssh', retainedExit) !== retainedExit) {
  throw new Error('reattached SSH terminals must retain an exit that happened while hidden')
}
if (getRemoteTerminalExitEvent(undefined, retainedExit) !== null) {
  throw new Error('local terminals must not show the SSH reconnect notice')
}

const registrationPolicyCases = [
  ['local terminal with workspace root and callback', undefined, '/workspace', true, true],
  ['remote SSH terminal', 'remote-ssh', '/workspace', true, false],
  ['local terminal without workspace root', undefined, '', true, false],
  ['local terminal with whitespace workspace root', undefined, '  ', true, false],
  ['local terminal without file callback', undefined, '/workspace', false, false],
] as const

for (const [label, connection, workspaceRootPath, hasOpenFileTile, expected] of registrationPolicyCases) {
  if (shouldRegisterTerminalMarkdownLinks(connection, workspaceRootPath, hasOpenFileTile) !== expected) {
    throw new Error(`Markdown link registration policy mismatch: ${label}`)
  }
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
