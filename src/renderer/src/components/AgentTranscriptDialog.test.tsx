import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { DOMImplementation } from '@xmldom/xmldom'
import React from 'react'
import type {
  AgentSessionHistoryItem,
  AgentSessionTranscriptQuery,
  AgentSessionTranscriptResult,
} from '@shared/types'

type TestEventListener = (event: TestEvent) => void
type TranscriptHandler = (query: AgentSessionTranscriptQuery) => Promise<AgentSessionTranscriptResult>

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
  'agents.unknownTitle': 'Untitled session',
  'agents.claude': 'Claude',
  'agents.codex': 'Codex',
  'agents.entries': '{{count}} entries',
  'agents.closeConversation': 'Close conversation',
  'agents.loadingConversation': 'Loading conversation…',
  'agents.conversationError': 'Unable to load this conversation.',
  'agents.conversationNotFound': 'This conversation could not be found.',
  'agents.conversationEmpty': 'This conversation has no entries.',
  'agents.conversationTitle': 'Conversation',
  'agents.loadEarlier': 'Load earlier',
  'agents.truncatedEntry': 'This entry was shortened.',
  'agents.you': 'You',
  'agents.agent': 'Agent',
  'agents.resumeInAgentsView': 'Resume in Agents View',
}
const reactI18nextPath = require.resolve('react-i18next')
require.cache[reactI18nextPath] = {
  exports: {
    useTranslation: () => ({
      t: (key: string, options?: { count?: number }) => (translationCopy[key] ?? key)
        .replace('{{count}}', String(options?.count ?? 0)),
    }),
  },
  filename: reactI18nextPath,
  id: reactI18nextPath,
  loaded: true,
} as NodeModule
const { AgentTranscriptDialog } = loadWithJiti<typeof import('./AgentTranscriptDialog')>('./AgentTranscriptDialog.tsx')

const historyItem: AgentSessionHistoryItem = {
  identifier: 'session-1',
  provider: 'claude',
  startedAt: '2026-01-01T12:00:00.000Z',
  lastActivityAt: '2026-01-01T12:05:00.000Z',
  title: 'Session title',
  messageCount: 4,
}

let transcriptQueries: AgentSessionTranscriptQuery[] = []
let transcriptHandler: TranscriptHandler = async () => ({ entries: [], start: 0, total: 0, found: true })
let closeCount = 0

function renderDialog(handler: TranscriptHandler): { container: any; root: { unmount: () => void } } {
  transcriptQueries = []
  closeCount = 0
  transcriptHandler = handler
  Object.defineProperty(globalThis, 'electron', {
    configurable: true,
    value: { agents: { historyTranscript: (query: AgentSessionTranscriptQuery) => {
      transcriptQueries.push(query)
      return transcriptHandler(query)
    } } },
  })

  const container = document.createElement('div')
  const root = ReactDOM.createRoot(container)
  root.render(
    <AgentTranscriptDialog
      item={historyItem}
      workspaceId="workspace-a"
      onClose={() => { closeCount += 1 }}
      portalTarget={container}
    />,
  )
  return { container, root }
}

function findButton(container: any, label: string): any {
  return Array.from(container.getElementsByTagName('button')).find((button: any) => button.textContent.includes(label)) ?? null
}

function dispatch(element: any, type: string, init: Record<string, unknown> = {}): void {
  element.dispatchEvent(new TestEvent(type, { bubbles: true, cancelable: true, ...init }))
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.fail('Timed out waiting for transcript UI to update')
}

test('loads a chronological transcript with prompts, markdown replies, and command entries', async () => {
  const { container, root } = renderDialog(async () => ({
    entries: [
      { kind: 'prompt', text: 'Please inspect this project', timestamp: '2026-01-01T12:00:00.000Z' },
      { kind: 'command', text: '/compact', timestamp: '2026-01-01T12:01:00.000Z' },
      { kind: 'reply', text: '**Project summary**', timestamp: '2026-01-01T12:02:00.000Z' },
    ],
    start: 0,
    total: 3,
    found: true,
  }))

  try {
    await waitFor(() => container.textContent.includes('Project summary'))
    assert.deepEqual(transcriptQueries, [{ workspaceId: 'workspace-a', provider: 'claude', identifier: 'session-1' }])
    assert.equal(container.textContent.includes('Please inspect this project'), true)
    assert.equal(container.textContent.includes('/compact'), true)
    assert.equal(container.textContent.includes('Project summary'), true)
    assert.equal(container.getElementsByTagName('strong').length, 1)
  } finally {
    root.unmount()
  }
})

test('loads the earlier page before the visible entries', async () => {
  const { container, root } = renderDialog(async (query) => query.before === undefined
    ? {
      entries: [
        { kind: 'prompt', text: 'Later prompt' },
        { kind: 'reply', text: 'Later reply' },
      ],
      start: 2,
      total: 4,
      found: true,
    }
    : {
      entries: [
        { kind: 'prompt', text: 'Earlier prompt' },
        { kind: 'reply', text: 'Earlier reply' },
      ],
      start: 0,
      total: 4,
      found: true,
    })

  try {
    await waitFor(() => Boolean(findButton(container, 'Load earlier')))
    const button = findButton(container, 'Load earlier')
    assert.ok(button)
    dispatch(button, 'click')
    await waitFor(() => container.textContent.includes('Earlier prompt'))

    assert.deepEqual(transcriptQueries[1], {
      workspaceId: 'workspace-a',
      provider: 'claude',
      identifier: 'session-1',
      before: 2,
    })
    const transcriptText = container.textContent
    assert.ok(transcriptText.indexOf('Earlier prompt') < transcriptText.indexOf('Later prompt'))
  } finally {
    root.unmount()
  }
})

test('shows the not found state', async () => {
  const { container, root } = renderDialog(async () => ({ entries: [], start: 0, total: 0, found: false }))

  try {
    await waitFor(() => container.textContent.includes('This conversation could not be found.'))
    assert.equal(container.textContent.includes('This conversation could not be found.'), true)
  } finally {
    root.unmount()
  }
})

test('Escape closes the transcript dialog', async () => {
  const { container, root } = renderDialog(async () => ({ entries: [], start: 0, total: 0, found: true }))

  try {
    await waitFor(() => transcriptQueries.length === 1)
    dispatch(window, 'keydown', { key: 'Escape' })
    assert.equal(closeCount, 1)
  } finally {
    root.unmount()
  }
})

test('does not render raw HTML elements from a reply', async () => {
  const { container, root } = renderDialog(async () => ({
    entries: [{ kind: 'reply', text: 'Safe text <img src="x" onerror="alert(1)"> after' }],
    start: 0,
    total: 1,
    found: true,
  }))

  try {
    await waitFor(() => container.textContent.includes('Safe text'))
    assert.equal(container.textContent.includes('Safe text'), true)
    assert.equal(container.getElementsByTagName('img').length, 0)
  } finally {
    root.unmount()
  }
})
