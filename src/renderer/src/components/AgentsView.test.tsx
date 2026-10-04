import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { DOMImplementation } from '@xmldom/xmldom'
import React from 'react'
import type { AgentActiveSession, WorkspaceConfig } from '@shared/types'

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
Object.defineProperty(globalThis, 'document', { value: document, configurable: true, writable: true })
Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true, writable: true })
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' }, configurable: true, writable: true })
Object.assign(globalThis, {
  Element: ElementClass,
  Event: TestEvent,
  HTMLElement: ElementClass,
  HTMLButtonElement: ElementClass,
  HTMLIFrameElement: class {},
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
const terminalMock = ({ session }: { session: AgentActiveSession }) => React.createElement('div', {
  'data-terminal-session': session.tileId,
})
const translationCopy: Record<string, string> = {
  'agentsView.title': 'Agents',
  'agentsView.sessionCount': '{{count}} sessions',
  'agentsView.newSession': 'New session',
  'agentsView.emptyTitle': 'No agent sessions in this view',
  'agentsView.emptyDescription': 'Start a session to see its live terminal here.',
  'agentsView.newAgentSession': 'New agent session',
  'agentsView.agentSession': 'Agent Session',
  'agentsView.unknownTitle': 'Untitled session',
  'agentsView.closeSession': 'Close session',
  'agentsView.maximizeSession': 'Maximize session',
  'agentsView.restoreSession': 'Restore session',
  'agentsView.statusWorking': 'Working',
  'agentsView.statusNeedsInput': 'Needs input',
  'agentsView.statusDone': 'Done',
  'agentsView.statusExited': 'Exited',
}
const reactI18nextPath = require.resolve('react-i18next')
require.cache[reactI18nextPath] = {
  exports: {
    useTranslation: () => ({
      t: (key: string, options?: { count?: number }) => (
        translationCopy[key]?.replace('{{count}}', String(options?.count ?? '')) ?? key
      ),
    }),
  },
  filename: reactI18nextPath,
  id: reactI18nextPath,
  loaded: true,
} as NodeModule
require.cache[require.resolve('./AgentSessionTerminal.tsx')] = {
  exports: { AgentSessionTerminal: terminalMock },
  filename: require.resolve('./AgentSessionTerminal.tsx'),
  id: require.resolve('./AgentSessionTerminal.tsx'),
  loaded: true,
} as NodeModule
const { AgentsView } = loadWithJiti<typeof import('./AgentsView')>('./AgentsView.tsx')

const workspaceConfig: WorkspaceConfig = {
  type: 'canvas',
  sourceControlRepositoryPaths: [],
  workspacePanelOpen: false,
  sourceControlViewMode: 'list',
  agentProviders: {
    claude: { enabled: true, args: [] },
    codex: { enabled: true, args: [] },
  },
}

function session(overrides: Partial<AgentActiveSession> = {}): AgentActiveSession {
  return {
    sessionId: 'session-a',
    tileId: 'agent-a',
    workspaceId: 'workspace-a',
    provider: 'claude',
    status: 'working',
    startedAt: '2026-01-01T00:00:00.000Z',
    lastActivityAt: '2026-01-01T00:00:00.000Z',
    surface: 'agents-view',
    title: 'Implement the feature',
    ...overrides,
  }
}

function createView(
  sessions: AgentActiveSession[],
  callbacks: {
    onCloseSession?: (value: AgentActiveSession) => void
    onFocusSession?: (id: string) => void
    onMaximizedSessionChange?: (id: string | null) => void
    shortcutLabel?: string
  } = {},
): { container: any; root: { unmount: () => void } } {
  const container = document.createElement('div')
  const root = ReactDOM.createRoot(container)
  function ControlledAgentsView(): React.ReactElement {
    const [maximizedSessionId, setMaximizedSessionId] = React.useState<string | null>(null)
    return (
      <AgentsView
        workspaceId="workspace-a"
        workspaceConfig={workspaceConfig}
        provider="claude"
        sessions={sessions}
        focusedSessionId={null}
        onFocusSession={callbacks.onFocusSession ?? (() => undefined)}
        maximizedSessionId={maximizedSessionId}
        onMaximizedSessionChange={(id) => {
          callbacks.onMaximizedSessionChange?.(id)
          setMaximizedSessionId(id)
        }}
        onCloseSession={callbacks.onCloseSession ?? (() => undefined)}
        onNewSession={() => undefined}
        shortcutLabel={callbacks.shortcutLabel}
      />
    )
  }
  root.render(<ControlledAgentsView />)
  return { container, root }
}

test('uses the configured shortcut label in the Agents View empty state', async () => {
  const { container, root } = createView([], { shortcutLabel: 'Alt+K' })
  try {
    await settle()
    assert.match(container.textContent, /Alt\+K/)
    assert.doesNotMatch(container.textContent, /Ctrl\+N/)
  } finally {
    root.unmount()
  }
})

function findButton(container: any, ariaLabel: string): any {
  const buttons = container.getElementsByTagName('button')
  for (let index = 0; index < buttons.length; index += 1) {
    if (buttons[index].getAttribute('aria-label') === ariaLabel) return buttons[index]
  }
  return null
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20))
}

test('renders badges for different session states and closes through the callback', async () => {
  const sessions = [
    session(),
    session({
      tileId: 'agent-b',
      provider: 'codex',
      status: 'needs-input',
      worktreeBranch: 'feature/parser',
      worktrees: [
        { path: '/worktrees/agent-b/repo-a', baseSha: 'a'.repeat(40) },
        { path: '/worktrees/agent-b/repo-b', baseSha: 'b'.repeat(40) },
        { path: '/worktrees/agent-b/repo-c', baseSha: 'c'.repeat(40) },
      ],
    }),
    session({ tileId: 'agent-c', status: 'done' }),
    session({ tileId: 'agent-d', status: 'exited' }),
  ]
  const closed: AgentActiveSession[] = []
  const { container, root } = createView(sessions, { onCloseSession: (value) => closed.push(value) })

  try {
    await settle()
    assert.match(container.textContent, /Working/)
    assert.match(container.textContent, /Needs input/)
    assert.match(container.textContent, /Done/)
    assert.match(container.textContent, /Exited/)
    assert.match(container.textContent, /feature\/parser/)
    const spans = container.getElementsByTagName('span')
    const worktreeChip = Array.from({ length: spans.length }, (_, index) => spans[index])
      .find((span) => span.getAttribute('title')?.startsWith('feature/parser'))
    assert.equal(worktreeChip?.textContent, 'feature/parser')
    assert.ok(worktreeChip?.getAttribute('title')?.endsWith('3 repos'))
    assert.ok(findButton(container, 'Close session'))

    findButton(container, 'Close session').dispatchEvent(new TestEvent('click', { bubbles: true, cancelable: true }))
    await settle()
    assert.equal(closed.length, 1)
    assert.equal(closed[0].tileId, 'agent-a')
  } finally {
    root.unmount()
  }
})

test('reports the maximized session so the app can hide the sidebar', async () => {
  const changes: Array<string | null> = []
  const { container, root } = createView([session(), session({ tileId: 'agent-b' })], {
    onMaximizedSessionChange: (id) => changes.push(id),
  })

  try {
    await settle()
    findButton(container, 'Maximize session').dispatchEvent(new TestEvent('click', { bubbles: true, cancelable: true }))
    await settle()
    assert.deepEqual(changes, ['agent-a'])

    findButton(container, 'Restore session').dispatchEvent(new TestEvent('click', { bubbles: true, cancelable: true }))
    await settle()
    assert.deepEqual(changes, ['agent-a', null])
  } finally {
    root.unmount()
  }
})

test('renders the empty state and its Ctrl+N shortcut', async () => {
  const { container, root } = createView([])
  try {
    await settle()
    assert.match(container.textContent, /No agent sessions in this view/)
    assert.match(container.textContent, /New agent session/)
    assert.match(container.textContent, /Ctrl\+N/)
  } finally {
    root.unmount()
  }
})
