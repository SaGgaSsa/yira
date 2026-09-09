import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { DOMImplementation } from '@xmldom/xmldom'
import React from 'react'

type TestListener = (event: TestEvent) => void

const document = new DOMImplementation().createDocument(null, 'html', null) as any
const ElementClass = document.createElement('div').constructor
const elementPrototype = ElementClass.prototype as any
const nodePrototype = Object.getPrototypeOf(elementPrototype) as any
const documentPrototype = Object.getPrototypeOf(document) as any
const listenerStore = Symbol('listeners')
const pointerCaptureStore = Symbol('pointer-captures')

function patchEventTarget(prototype: any): void {
  prototype.addEventListener = function addEventListener(type: string, listener: TestListener): void {
    const listeners = this[listenerStore] ?? new Map<string, TestListener[]>()
    listeners.set(type, [...(listeners.get(type) ?? []), listener])
    this[listenerStore] = listeners
  }
  prototype.removeEventListener = function removeEventListener(type: string, listener: TestListener): void {
    const listeners = this[listenerStore]
    if (!listeners) return
    listeners.set(type, (listeners.get(type) ?? []).filter((entry: TestListener) => entry !== listener))
  }
  prototype.dispatchEvent = function dispatchEvent(event: TestEvent): boolean {
    event.target = this
    let currentTarget: any = this
    while (currentTarget) {
      event.currentTarget = currentTarget
      for (const listener of currentTarget[listenerStore]?.get(event.type) ?? []) {
        listener.call(currentTarget, event)
      }
      if (!event.bubbles || event.cancelBubble) break
      currentTarget = currentTarget.parentNode ?? null
    }
    return !event.defaultPrevented
  }
}

patchEventTarget(elementPrototype)
patchEventTarget(nodePrototype)
patchEventTarget(documentPrototype)
patchEventTarget(globalThis as any)

elementPrototype.setPointerCapture = function setPointerCapture(pointerId: number): void {
  const captures = this[pointerCaptureStore] ?? new Set<number>()
  captures.add(pointerId)
  this[pointerCaptureStore] = captures
}
elementPrototype.releasePointerCapture = function releasePointerCapture(pointerId: number): void {
  const captures = this[pointerCaptureStore] ?? new Set<number>()
  if (!captures.has(pointerId)) throw new Error(`Pointer ${pointerId} is not captured`)
  captures.delete(pointerId)
  this[pointerCaptureStore] = captures
}
elementPrototype.hasPointerCapture = function hasPointerCapture(pointerId: number): boolean {
  return this[pointerCaptureStore]?.has(pointerId) ?? false
}

const originalCreateElement = document.createElement.bind(document)
document.createElement = ((tagName: string) => {
  const element = originalCreateElement(tagName) as any
  element.style = {
    removeProperty: (property: string) => { delete element.style[property] },
    setProperty: (property: string, value: string) => { element.style[property] = value },
  }
  element.ownerDocument = document
  element.getBoundingClientRect = () => ({
    bottom: 1000,
    height: 1000,
    left: 0,
    right: 1000,
    top: 0,
    width: 1000,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  return element
}) as typeof document.createElement

const originalCreateElementNS = document.createElementNS.bind(document)
document.createElementNS = ((namespace: string, tagName: string) => {
  const element = originalCreateElementNS(namespace, tagName) as any
  element.style = {}
  element.ownerDocument = document
  return element
}) as typeof document.createElementNS
document.documentElement.style = {}
document.defaultView = globalThis
document.activeElement = null
document.elementFromPoint = () => null

class TestEvent {
  type: string
  bubbles: boolean
  cancelable: boolean
  defaultPrevented = false
  cancelBubble = false
  target: any = null
  currentTarget: any = null

  constructor(type: string, init: Record<string, unknown> = {}) {
    this.type = type
    this.bubbles = Boolean(init.bubbles)
    this.cancelable = Boolean(init.cancelable)
    Object.assign(this, init)
  }

  preventDefault(): void {
    this.defaultPrevented = true
  }

  stopPropagation(): void {
    this.cancelBubble = true
  }

  stopImmediatePropagation(): void {
    this.cancelBubble = true
  }
}

class TestPointerEvent extends TestEvent {
  pointerId: number
  clientX: number
  clientY: number
  button: number
  buttons: number

  constructor(type: string, init: Record<string, unknown> = {}) {
    super(type, init)
    this.pointerId = Number(init.pointerId ?? 1)
    this.clientX = Number(init.clientX ?? 10)
    this.clientY = Number(init.clientY ?? 10)
    this.button = Number(init.button ?? 0)
    this.buttons = Number(init.buttons ?? 1)
  }
}

Object.defineProperty(globalThis, 'document', { value: document, configurable: true, writable: true })
Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true, writable: true })
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' }, configurable: true, writable: true })
Object.assign(globalThis, {
  Element: ElementClass,
  Event: TestEvent,
  HTMLElement: ElementClass,
  HTMLIFrameElement: class {},
  MutationObserver: class {
    observe(): void {}
    disconnect(): void {}
  },
  Node: nodePrototype.constructor,
  PointerEvent: TestPointerEvent,
  SVGElement: ElementClass,
  Text: document.createTextNode('text').constructor,
})

document.addEventListener('selectionchange', () => {})

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
const ReactDOM = await import('react-dom/client')
const testIcon = () => React.createElement('span')
type TileContentLifecycle = { mountCount: number; cleanupCount: number }

const tileContentLifecycles = new WeakMap<object, TileContentLifecycle>()
const tileContentPropsByWorkspaceConfig = new WeakMap<object, Record<string, unknown>>()
const mockedModules: Record<string, Record<string, unknown>> = {
  [require.resolve('./TileContent.tsx')]: {
    TILE_META: {
      browser: { icon: testIcon, label: 'Browser' },
      files: { icon: testIcon, label: 'File' },
      note: { icon: testIcon, label: 'Note' },
      terminal: { icon: testIcon, label: 'Terminal' },
      timer: { icon: testIcon, label: 'Timer' },
    },
    TileContent: (props: Record<string, unknown>) => {
      const config = props.workspaceConfig as object
      let lifecycle = tileContentLifecycles.get(config)
      if (!lifecycle) {
        lifecycle = { mountCount: 0, cleanupCount: 0 }
        tileContentLifecycles.set(config, lifecycle)
      }
      tileContentPropsByWorkspaceConfig.set(config, props)
      React.useLayoutEffect(() => {
        lifecycle.mountCount += 1
        return () => {
          lifecycle.cleanupCount += 1
        }
      }, [])
      return React.createElement('div')
    },
  },
  [require.resolve('./TileActionButtons.tsx')]: {
    TileActionButtons: () => null,
  },
  [require.resolve('./TileCreationSelector.tsx')]: {
    TileCreationSelector: () => null,
  },
}
for (const [filename, exports] of Object.entries(mockedModules)) {
  require.cache[filename] = { exports, filename, id: filename, loaded: true } as NodeModule
}
const { GridView } = loadWithJiti<typeof import('./GridView')>('./GridView.tsx')

const tile = {
  id: 'tile-a',
  type: 'timer',
  x: 0,
  y: 0,
  width: 320,
  height: 200,
  zIndex: 1,
  timerDurationMs: 60_000,
  timerRemainingMs: 60_000,
  timerStatus: 'idle',
} as any
const rootNode = { id: 'leaf-a', type: 'leaf', tileId: tile.id } as any
const workspaceId = 'workspace-grid'
const workspaceConfig = {
  type: 'grid' as const,
  rootFolderPath: '',
  workspacePanelOpen: false,
  sourceControlViewMode: 'list' as const,
  sourceControlRepositoryPaths: [],
  agentProviders: {
    claude: { enabled: true, args: [] },
    codex: { enabled: true, args: [] },
  },
}

async function renderGridView(
  tileRefreshKeys: Record<string, number> = {},
  renderWorkspaceConfig: typeof workspaceConfig = { ...workspaceConfig },
): Promise<{
  container: any
  root: any
  moveHandle: any
  tileContentLifecycle: TileContentLifecycle
  tileContentProps: Record<string, unknown> | null
  rerender: (nextTileRefreshKeys: Record<string, number>) => Promise<void>
}> {
  const container = document.createElement('div')
  const root = ReactDOM.createRoot(container)
  const render = (nextTileRefreshKeys: Record<string, number>) => {
    root.render(React.createElement(GridView, {
      workspaceId,
      workspaceConfig: renderWorkspaceConfig,
      rootNode,
      tiles: [tile],
      tileRefreshKeys: nextTileRefreshKeys,
      focusedTileId: tile.id,
      terminalTitles: {},
      onFocusTile: () => {},
      onUpdateTile: () => {},
      onSetRootNode: () => {},
      onConfigureTile: () => {},
      onFocusTileInView: () => {},
      onDetachTile: () => {},
      onCloseTile: () => {},
      onOpenBrowserTile: () => {},
      onOpenFileTile: () => {},
      tileCreationSelectorProps: {} as any,
      workspaceRootPath: '',
    }))
  }
  const waitForRender = () => new Promise<void>((resolve) => setTimeout(resolve, 20))
  render(tileRefreshKeys)
  await waitForRender()

  const buttons = container.getElementsByTagName('button')
  let moveHandle: any = null
  for (let index = 0; index < buttons.length; index += 1) {
    if (buttons[index].getAttribute('title') === 'Move tile') {
      moveHandle = buttons[index]
      break
    }
  }
  assert.ok(moveHandle, 'the rendered grid must expose a move handle')
  return {
    container,
    root,
    moveHandle,
    tileContentLifecycle: tileContentLifecycles.get(renderWorkspaceConfig) as TileContentLifecycle,
    tileContentProps: tileContentPropsByWorkspaceConfig.get(renderWorkspaceConfig) ?? null,
    rerender: async (nextTileRefreshKeys) => {
      render(nextTileRefreshKeys)
      await waitForRender()
    },
  }
}

test('passes workspace identity and config to TileContent', async () => {
  const { root, tileContentProps } = await renderGridView({}, workspaceConfig)

  try {
    assert.ok(tileContentProps)
    assert.equal(tileContentProps.workspaceId, workspaceId)
    assert.equal(tileContentProps.workspaceConfig, workspaceConfig)
  } finally {
    root.unmount()
  }
})

test('remounts tile content when its refresh key changes', async () => {
  const { root, rerender, tileContentLifecycle } = await renderGridView()

  try {
    assert.equal(tileContentLifecycle.mountCount, 1)
    assert.equal(tileContentLifecycle.cleanupCount, 0)

    await rerender({ [tile.id]: 1 })

    assert.equal(tileContentLifecycle.mountCount, 2)
    assert.equal(tileContentLifecycle.cleanupCount, 1)
  } finally {
    root.unmount()
  }
})

test('preserves tile content when its refresh key is unchanged', async () => {
  const { root, rerender, tileContentLifecycle } = await renderGridView({ [tile.id]: 1 })

  try {
    assert.equal(tileContentLifecycle.mountCount, 1)
    assert.equal(tileContentLifecycle.cleanupCount, 0)

    await rerender({ [tile.id]: 1 })

    assert.equal(tileContentLifecycle.mountCount, 1)
    assert.equal(tileContentLifecycle.cleanupCount, 0)
  } finally {
    root.unmount()
  }
})

test('captures the pointer on the tile move handle when a drag starts', async () => {
  const { root, moveHandle } = await renderGridView()
  const pointerId = 41

  try {
    moveHandle.dispatchEvent(new TestPointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      clientX: 80,
      clientY: 90,
      pointerId,
    }))

    assert.equal(moveHandle.hasPointerCapture(pointerId), true)
  } finally {
    root.unmount()
  }
})

test('releases the captured pointer when the move drag ends', async () => {
  const { root, moveHandle } = await renderGridView()
  const pointerId = 42

  try {
    moveHandle.dispatchEvent(new TestPointerEvent('pointerdown', { bubbles: true, pointerId }))
    assert.equal(moveHandle.hasPointerCapture(pointerId), true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    window.dispatchEvent(new TestPointerEvent('pointerup', { pointerId }) as any)

    assert.equal(moveHandle.hasPointerCapture(pointerId), false)
  } finally {
    root.unmount()
  }
})

test('does not throw when pointer capture was lost before cancellation', async () => {
  const { root, moveHandle } = await renderGridView()
  const pointerId = 43

  try {
    moveHandle.dispatchEvent(new TestPointerEvent('pointerdown', { bubbles: true, pointerId }))
    assert.equal(moveHandle.hasPointerCapture(pointerId), true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    moveHandle.releasePointerCapture(pointerId)

    assert.doesNotThrow(() => {
      window.dispatchEvent(new TestPointerEvent('pointercancel', { pointerId }) as any)
    })
  } finally {
    root.unmount()
  }
})

test('releases the captured pointer when the move drag is cancelled', async () => {
  const { root, moveHandle } = await renderGridView()
  const pointerId = 44

  try {
    moveHandle.dispatchEvent(new TestPointerEvent('pointerdown', { bubbles: true, pointerId }))
    assert.equal(moveHandle.hasPointerCapture(pointerId), true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    window.dispatchEvent(new TestPointerEvent('pointercancel', { pointerId }) as any)

    assert.equal(moveHandle.hasPointerCapture(pointerId), false)
  } finally {
    root.unmount()
  }
})

test('releases the captured pointer when the grid unmounts during a drag', async () => {
  const { root, moveHandle } = await renderGridView()
  const pointerId = 45
  let unmounted = false

  try {
    moveHandle.dispatchEvent(new TestPointerEvent('pointerdown', { bubbles: true, pointerId }))
    assert.equal(moveHandle.hasPointerCapture(pointerId), true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    root.unmount()
    unmounted = true

    assert.equal(moveHandle.hasPointerCapture(pointerId), false)
  } finally {
    if (!unmounted) root.unmount()
  }
})
