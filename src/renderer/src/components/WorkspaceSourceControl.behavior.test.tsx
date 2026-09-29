import assert from 'node:assert/strict'
import test from 'node:test'
import { DOMImplementation } from '@xmldom/xmldom'
import React from 'react'
import { I18nextProvider } from 'react-i18next'
import type { GitStatusResult } from '@shared/types'
import { i18n, initializeI18n } from '../i18n'
import { WorkspaceSourceControl } from './WorkspaceSourceControl'

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
document.elementFromPoint = () => null

class TestEvent {
  type: string
  bubbles: boolean
  cancelable: boolean
  defaultPrevented = false
  cancelBubble = false
  target: AnyRecord | null = null
  currentTarget: AnyRecord | null = null

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

document.addEventListener('selectionchange', () => {})

await initializeI18n('en')

const workspaceId = 'workspace-source-control'
const repositoryPath = '.'
const status: GitStatusResult = {
  isRepository: true,
  branch: 'main',
  upstream: 'origin/main',
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [{ path: 'README.md', status: 'modified' }],
}
const historyFailure = new Error('history service unavailable')

function serializedMarkup(container: AnyRecord): string {
  return container.toString()
}

async function waitFor(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.fail(`timed out waiting for DOM update: ${serializedMarkup(currentContainer!)}`)
}

let currentContainer: AnyRecord | null = null

function findCommitsButton(container: AnyRecord): AnyRecord {
  const buttons = container.getElementsByTagName('button')
  for (let index = 0; index < buttons.length; index += 1) {
    if (buttons[index].getAttribute('aria-controls')?.startsWith('source-control-commits')) return buttons[index]
  }
  assert.fail('source control must render the commits accordion button')
}

test('keeps healthy Git status visible when history loading fails', async () => {
  let statusCalls = 0
  let historyCalls = 0
  const bridge = {
    git: {
      discoverRepositories: async () => [{ relativePath: repositoryPath, name: 'workspace' }],
      status: async () => {
        statusCalls += 1
        return status
      },
      history: async () => {
        historyCalls += 1
        throw historyFailure
      },
      stage: async () => undefined,
      unstage: async () => undefined,
      commit: async () => undefined,
      sync: async () => undefined,
    },
    workspace: {
      update: async () => null,
    },
    shell: {
      openExternal: async () => undefined,
    },
  }
  const previousElectron = (globalThis as AnyRecord).window.electron
  ;(globalThis as AnyRecord).window.electron = bridge
  const container = document.createElement('div') as any
  currentContainer = container
  const ReactDOM = await import('react-dom/client')
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(
    I18nextProvider,
    { i18n },
    React.createElement(WorkspaceSourceControl, {
      workspaceId,
      sourceControlRepositoryPaths: [repositoryPath],
      sourceControlViewMode: 'list',
      onWorkspaceUpdated: () => undefined,
      onOpenWorkspaceSettings: () => undefined,
    }),
  ))

  try {
    await waitFor(() => statusCalls === 1 && historyCalls === 1 && serializedMarkup(container).includes('Changes (1)'))
    const healthyMarkup = serializedMarkup(container)
    assert.match(healthyMarkup, />origin\/main · ↑0 ↓0</)
    assert.match(healthyMarkup, /Changes \(1\)/)
    assert.match(healthyMarkup, />README\.md</)
    assert.doesNotMatch(healthyMarkup, /No se pudo cargar el historial/)

    findCommitsButton(container).dispatchEvent(new TestEvent('click', { bubbles: true }))
    await waitFor(() => serializedMarkup(container).includes('No se pudo cargar el historial: history service unavailable'))
    const expandedMarkup = serializedMarkup(container)
    assert.match(expandedMarkup, /No se pudo cargar el historial: history service unavailable/)
    assert.match(expandedMarkup, /Changes \(1\)/)
    assert.match(expandedMarkup, />README\.md</)
  } finally {
    root.unmount()
    currentContainer = null
    ;(globalThis as AnyRecord).window.electron = previousElectron
  }
})
