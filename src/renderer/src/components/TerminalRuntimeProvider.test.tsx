import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { DOMImplementation } from '@xmldom/xmldom'
import React from 'react'
import type { TerminalCreateOptions } from '@shared/types'
import type { TerminalSessionIdentity, TerminalSessionTarget } from '@shared/terminalSessionIdentity'

type AnyRecord = Record<PropertyKey, any>
type TestListener = (event: TestEvent) => void

const document = new DOMImplementation().createDocument(null, 'html', null) as any
const ElementClass = document.createElement('div').constructor
const elementPrototype = ElementClass.prototype as AnyRecord
const nodePrototype = Object.getPrototypeOf(elementPrototype) as AnyRecord
const documentPrototype = Object.getPrototypeOf(document) as AnyRecord
const listenerStore = Symbol('listeners')

function patchEventTarget(prototype: AnyRecord): void {
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
    let currentTarget: AnyRecord | null = this
    while (currentTarget) {
      event.currentTarget = currentTarget
      for (const listener of currentTarget[listenerStore]?.get(event.type) ?? []) listener.call(currentTarget, event)
      if (!event.bubbles || event.cancelBubble) break
      currentTarget = currentTarget.parentNode ?? null
    }
    return !event.defaultPrevented
  }
}

patchEventTarget(elementPrototype)
patchEventTarget(nodePrototype)
patchEventTarget(documentPrototype)
patchEventTarget(globalThis as AnyRecord)

const originalCreateElement = document.createElement.bind(document)
document.createElement = ((tagName: string) => {
  const element = originalCreateElement(tagName) as AnyRecord
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
  const element = originalCreateElementNS(namespace, tagName) as AnyRecord
  element.style = {}
  element.ownerDocument = document
  return element
}) as typeof document.createElementNS
document.documentElement.style = {}
document.defaultView = globalThis
document.activeElement = null
document.hasFocus = () => true
document.elementFromPoint = () => null

class TestEvent {
  type: string
  bubbles: boolean
  cancelable: boolean
  defaultPrevented = false
  cancelBubble = false
  target: AnyRecord | null = null
  currentTarget: AnyRecord | null = null

  constructor(type: string, init: AnyRecord = {}) {
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
  SVGElement: ElementClass,
  Text: document.createTextNode('text').constructor,
})

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

class FakeTerminal {
  readonly rows = 24
  readonly textarea: AnyRecord | null = null
  readonly options: AnyRecord = {}
  readonly parser = { registerOscHandler: () => ({ dispose: () => {} }) }
  readonly writes: string[] = []
  private dataListener: ((data: string) => void) | undefined
  private titleListener: ((title: string) => void) | undefined

  loadAddon(_addon: unknown): void {}

  open(root: AnyRecord): void {
    const xterm = document.createElement('div') as AnyRecord
    xterm.className = 'xterm'
    root.appendChild(xterm)
  }

  write(data: string, callback?: () => void): void {
    this.writes.push(data)
    callback?.()
  }

  refresh(_start: number, _end: number): void {}
  dispose(): void {}
  focus(): void {}
  hasSelection(): boolean { return false }
  getSelection(): string { return '' }
  selectAll(): void {}
  paste(_data: string): void {}
  attachCustomKeyEventHandler(_handler: (event: AnyRecord) => boolean): void {}
  registerLinkProvider(_provider: unknown): { dispose: () => void } { return { dispose: () => {} } }
  onData(listener: (data: string) => void): { dispose: () => void } {
    this.dataListener = listener
    return { dispose: () => { this.dataListener = undefined } }
  }
  onTitleChange(listener: (title: string) => void): { dispose: () => void } {
    this.titleListener = listener
    return { dispose: () => { this.titleListener = undefined } }
  }
}

class FakeFitAddon {
  fit(): void {}
  proposeDimensions(): undefined { return undefined }
}

class FakeWebLinksAddon {
  constructor(..._args: unknown[]) {}
}

const xtermModule = require.resolve('@xterm/xterm')
const fitModule = require.resolve('@xterm/addon-fit')
const linksModule = require.resolve('@xterm/addon-web-links')
require.cache[xtermModule] = { exports: { Terminal: FakeTerminal }, filename: xtermModule, id: xtermModule, loaded: true } as NodeModule
require.cache[fitModule] = { exports: { FitAddon: FakeFitAddon }, filename: fitModule, id: fitModule, loaded: true } as NodeModule
require.cache[linksModule] = { exports: { WebLinksAddon: FakeWebLinksAddon }, filename: linksModule, id: linksModule, loaded: true } as NodeModule

const ReactDOM = await import('react-dom/client')
const {
  TerminalRuntimeProvider,
  useTerminalRuntimeContext,
} = loadWithJiti<typeof import('./TerminalRuntimeProvider')>('./TerminalRuntimeProvider.tsx')
const { TerminalRuntimeRegistry } = loadWithJiti<typeof import('../utils/terminalRuntimeRegistry')>('../utils/terminalRuntimeRegistry.ts')
const { useCanvasStore } = loadWithJiti<typeof import('../store/canvasStore')>('../store/canvasStore.ts')

const target: TerminalSessionTarget = { workspaceId: 'workspace-hidden', tileId: 'tile-terminal' }
const createOptions: TerminalCreateOptions = { shellProfileId: 'bash' }
const viewOptions = {
  visible: false,
  edgeToEdge: false,
  autoFocus: false,
  fontSize: 14,
  themeId: 'yira-default' as const,
  notificationsMuted: false,
  workspaceRootPath: '',
  onFocus: () => {},
}

function flushReact(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20))
}

function renderProvider(registry: InstanceType<typeof TerminalRuntimeRegistry<any>>, probe: () => React.ReactElement): { root: AnyRecord; container: AnyRecord } {
  const container = document.createElement('div') as AnyRecord
  const root = ReactDOM.createRoot(container as HTMLElement)
  root.render(React.createElement(TerminalRuntimeProvider, { registry, children: probe() }))
  return { root, container }
}

test('configures a connected parking root for the injected registry', async () => {
  const registry = new TerminalRuntimeRegistry<any>()
  let parkingRoot: AnyRecord | null = null
  const setParkingRoot = registry.setParkingRoot.bind(registry)
  registry.setParkingRoot = (root: HTMLElement | null) => {
    parkingRoot = root as AnyRecord | null
    setParkingRoot(root)
  }
  const { root, container } = renderProvider(registry, () => React.createElement('span'))
  await flushReact()

  assert.ok(parkingRoot)
  const observedParkingRoot = parkingRoot as AnyRecord
  assert.equal(observedParkingRoot.parentNode, container)
  assert.equal(observedParkingRoot.style.width, '1px')
  assert.equal(observedParkingRoot.style.height, '1px')
  assert.equal(observedParkingRoot.style.display, undefined)
  root.unmount()
  await flushReact()
})
test('provider disposal detaches runtimes without destroying their PTYs', async () => {
  const registry = new TerminalRuntimeRegistry<any>()
  const disposeCalls: boolean[] = []
  const runtime = {
    target,
    park: () => {},
    dispose: async (destroyPty: boolean) => { disposeCalls.push(destroyPty) },
  }
  await registry.acquire(target, async () => runtime)
  const { root } = renderProvider(registry, () => React.createElement('span'))
  await flushReact()

  root.unmount()
  await flushReact()
  assert.deepEqual(disposeCalls, [false])
})

test('rerender keeps the initial registry and does not create a runtime on mount', async () => {
  const firstRegistry = new TerminalRuntimeRegistry<any>()
  const secondRegistry = new TerminalRuntimeRegistry<any>()
  let currentContext: AnyRecord | null = null
  const bridge = {
    create: async () => { throw new Error('create must not run during provider mount') },
  }
  ;(globalThis as AnyRecord).window.electron = { terminal: bridge }

  const container = document.createElement('div') as AnyRecord
  const root = ReactDOM.createRoot(container as HTMLElement)
  const Probe = (): React.ReactElement => {
    currentContext = useTerminalRuntimeContext() as AnyRecord
    return React.createElement('span')
  }
  root.render(React.createElement(TerminalRuntimeProvider, { registry: firstRegistry, children: React.createElement(Probe) }))
  await flushReact()
  const firstContext = currentContext as AnyRecord | null
  assert.ok(firstContext)
  assert.equal(firstContext.registry, firstRegistry)

  root.render(React.createElement(TerminalRuntimeProvider, { registry: secondRegistry, children: React.createElement(Probe) }))
  await flushReact()
  const secondContext = currentContext as AnyRecord | null
  assert.ok(secondContext)
  assert.equal(secondContext.registry, firstRegistry)
  root.unmount()
  await flushReact()
})

test('hidden activity increments only the target workspace without mutating the active canvas', async () => {
  const registry = new TerminalRuntimeRegistry<any>()
  const identity: TerminalSessionIdentity = { ...target, generation: 1 }
  let onData: ((data: string) => void) | undefined
  const bridge = {
    create: async (requestedTarget: TerminalSessionTarget) => ({ cols: 80, rows: 24, buffer: '', identity: { ...requestedTarget, generation: 1 } }),
    attach: async () => ({ cols: 80, rows: 24, buffer: '', identity }),
    write: async () => {},
    resize: async () => {},
    detach: async () => {},
    destroy: async () => {},
    acknowledgeAgentAlert: async () => {},
    onData: (_sessionIdentity: TerminalSessionIdentity, callback: (data: string) => void) => {
      onData = callback
      return () => { onData = undefined }
    },
    onExit: () => () => {},
    onAgentAlert: () => () => {},
  }
  ;(globalThis as AnyRecord).window.electron = {
    terminal: bridge,
    shell: { openExternal: async () => {} },
    clipboard: { writeText: async () => {} },
  }
  useCanvasStore.getState().setWorkspace('workspace-active', 'Active')

  let currentContext: AnyRecord | null = null
  const Probe = (): React.ReactElement => {
    currentContext = useTerminalRuntimeContext() as AnyRecord
    return React.createElement('span')
  }
  const { root } = renderProvider(registry, () => React.createElement(Probe))
  await flushReact()

  const runtime = await currentContext!.createRuntime({ target, createOptions, viewOptions })
  assert.equal(runtime.target.workspaceId, 'workspace-hidden')
  assert.equal(useCanvasStore.getState().terminalAttentionGraceUntil[target.tileId], undefined)
  assert.equal(useCanvasStore.getState().terminalAttention[target.tileId], undefined)
  assert.ok(onData)
  onData!('output from hidden workspace')
  await flushReact()

  assert.deepEqual(currentContext!.workspaceAttentionCounts, { 'workspace-hidden': 1 })
  assert.equal(useCanvasStore.getState().terminalAttentionGraceUntil[target.tileId], undefined)
  assert.equal(useCanvasStore.getState().terminalAttention[target.tileId], undefined)
  root.unmount()
  await flushReact()
})
