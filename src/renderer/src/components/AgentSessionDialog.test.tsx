import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { DOMImplementation } from '@xmldom/xmldom'
import React from 'react'
import type { AgentSessionCreateInput } from '@shared/types'

type TestEventListener = (event: TestEvent) => void

const document = new DOMImplementation().createDocument(null, 'html', null) as any
const ElementClass = document.createElement('div').constructor
const elementPrototype = ElementClass.prototype as any
const nodePrototype = Object.getPrototypeOf(elementPrototype) as any
const documentPrototype = Object.getPrototypeOf(document) as any
const listenerStore = Symbol('listeners')

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

  preventDefault(): void { this.defaultPrevented = true }
  stopPropagation(): void { this.cancelBubble = true }
  stopImmediatePropagation(): void { this.cancelBubble = true }
}

function patchEventTarget(prototype: any): void {
  prototype.addEventListener = function addEventListener(type: string, listener: TestEventListener): void {
    const listeners = this[listenerStore] ?? new Map<string, TestEventListener[]>()
    listeners.set(type, [...(listeners.get(type) ?? []), listener])
    this[listenerStore] = listeners
  }
  prototype.removeEventListener = function removeEventListener(type: string, listener: TestEventListener): void {
    const listeners = this[listenerStore]
    if (listeners) listeners.set(type, (listeners.get(type) ?? []).filter((item: TestEventListener) => item !== listener))
  }
  prototype.dispatchEvent = function dispatchEvent(event: TestEvent): boolean {
    event.target = this
    let currentTarget: any = this
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
patchEventTarget(globalThis as any)
elementPrototype.focus = function focus(): void {}
elementPrototype.blur = function blur(): void {}

const originalCreateElement = document.createElement.bind(document)
document.createElement = ((tagName: string) => {
  const element = originalCreateElement(tagName) as any
  element.style = {
    removeProperty: (property: string) => { delete element.style[property] },
    setProperty: (property: string, value: string) => { element.style[property] = value },
  }
  element.ownerDocument = document
  element.getBoundingClientRect = () => ({ width: 1000, height: 700, top: 0, left: 0, right: 1000, bottom: 700 })
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
document.oninput = null
Object.defineProperty(globalThis, 'document', { value: document, configurable: true, writable: true })
Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true, writable: true })
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' }, configurable: true, writable: true })
Object.assign(globalThis, {
  Element: ElementClass,
  Event: TestEvent,
  HTMLElement: ElementClass,
  HTMLButtonElement: ElementClass,
  HTMLInputElement: ElementClass,
  HTMLIFrameElement: class {},
  HTMLSelectElement: ElementClass,
  HTMLTextAreaElement: ElementClass,
  MouseEvent: TestEvent,
  KeyboardEvent: TestEvent,
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
const ReactDOM = await import('react-dom/client')
const translationCopy: Record<string, string> = {
  'agentsView.provider': 'Provider',
  'agentsView.newSession': 'New session',
  'agentsView.closeDialog': 'Close dialog',
  'agentsView.prompt': 'Prompt',
  'agentsView.promptPlaceholder': 'Enter starts the session',
  'agentsView.worktree': 'Run in a git worktree',
  'agentsView.worktreeUnavailable': 'Git worktrees are unavailable for this workspace.',
  'agentsView.createSession': 'Create session',
  'agentsView.creatingSession': 'Creating session…',
  'common.cancel': 'Cancel',
}
const reactI18nextPath = require.resolve('react-i18next')
require.cache[reactI18nextPath] = {
  exports: {
    useTranslation: () => ({ t: (key: string) => translationCopy[key] ?? key }),
  },
  filename: reactI18nextPath,
  id: reactI18nextPath,
  loaded: true,
} as NodeModule
const { AgentSessionDialog } = loadWithJiti<typeof import('./AgentSessionDialog')>('./AgentSessionDialog.tsx')

const createdResult = { workspaceId: 'workspace-a', tileId: 'agent-a', provider: 'claude' as const }
let payloads: AgentSessionCreateInput[] = []
let closeCount = 0
let createdCount = 0
Object.defineProperty(globalThis, 'electron', {
  configurable: true,
  value: {
    agents: {
      createSession: async (input: AgentSessionCreateInput) => {
        payloads.push(input)
        return createdResult
      },
    },
  },
})

function renderDialog(worktreeAvailable = true): { container: any; root: { unmount: () => void } } {
  payloads = []
  closeCount = 0
  createdCount = 0
  const container = document.createElement('div')
  const root = ReactDOM.createRoot(container)
  root.render(
    <AgentSessionDialog
      open
      workspaceId="workspace-a"
      provider="claude"
      worktreeAvailable={worktreeAvailable}
      onClose={() => { closeCount += 1 }}
      onCreated={() => { createdCount += 1 }}
    />,
  )
  return { container, root }
}

function findElement(container: any, tagName: string): any {
  return container.getElementsByTagName(tagName)[0] ?? null
}

function dispatch(element: any, type: string, init: Record<string, unknown> = {}): void {
  element.dispatchEvent(new TestEvent(type, { bubbles: true, cancelable: true, ...init }))
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20))
}

test('sends on Enter, keeps Shift+Enter from sending, and leaves worktree off by default', async () => {
  const { container, root } = renderDialog()

  try {
    await settle()
    const prompt = findElement(container, 'textarea')
    const checkbox = findElement(container, 'input')
    assert.equal(checkbox.checked, false)
    prompt.value = 'Summarize this repository'

    dispatch(prompt, 'keydown', { key: 'Enter', shiftKey: true })
    await settle()
    assert.equal(payloads.length, 0)

    dispatch(prompt, 'keydown', { key: 'Enter', shiftKey: false })
    await settle()
    assert.equal(payloads.length, 1)
    assert.deepEqual(payloads[0], {
      workspaceId: 'workspace-a',
      prompt: 'Summarize this repository',
      worktree: false,
    })
    assert.equal(createdCount, 1)
    assert.equal(closeCount, 1)
  } finally {
    root.unmount()
  }
})
