import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { DOMImplementation } from '@xmldom/xmldom'
import React from 'react'
import type {
  AgentActiveSession,
  AgentSessionCapabilities,
  WorkspaceMetadata,
} from '@shared/types'
import { resources } from '@/i18n/resources'

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
  const normalizedTagName = tagName.toLowerCase()
  element.style = {
    removeProperty: (property: string) => { delete element.style[property] },
    setProperty: (property: string, value: string) => { element.style[property] = value },
  }
  element.ownerDocument = document
  element.getBoundingClientRect = () => ({ width: 1000, height: 700, top: 0, left: 0, right: 1000, bottom: 700 })
  if (normalizedTagName === 'option') {
    Object.defineProperty(element, 'value', {
      get: () => element.getAttribute('value') ?? element.textContent,
      set: (value: string) => element.setAttribute('value', value),
      configurable: true,
    })
    element.selected = false
  }
  if (normalizedTagName === 'select') {
    Object.defineProperty(element, 'options', {
      get: () => element.getElementsByTagName('option'),
      configurable: true,
    })
    Object.defineProperty(element, 'value', {
      get: () => Array.from({ length: element.options.length }, (_, index) => element.options[index])
        .find((option: any) => option.selected)?.value ?? '',
      set: (value: string) => {
        for (let index = 0; index < element.options.length; index += 1) {
          element.options[index].selected = element.options[index].value === value
        }
      },
      configurable: true,
    })
  }
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
const body = originalCreateElement('body')
document.documentElement.appendChild(body)
Object.defineProperty(document, 'body', { value: body, configurable: true })
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

type TranslationTree = { [key: string]: string | TranslationTree }

// Spanish copy from the real resources, with the plural and interpolation rules the palette relies on.
function translate(key: string, options: Record<string, unknown> = {}): string {
  const lookup = (path: string): string | undefined => {
    let node: string | TranslationTree | undefined = resources.es.translation as unknown as TranslationTree
    for (const part of path.split('.')) node = typeof node === 'object' ? node[part] : undefined
    return typeof node === 'string' ? node : undefined
  }
  const count = typeof options.count === 'number' ? options.count : undefined
  const pluralKey = count === undefined ? undefined : `${key}_${count === 1 ? 'one' : 'other'}`
  const template = (pluralKey ? lookup(pluralKey) : undefined) ?? lookup(key) ?? key
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options[name] ?? ''))
}

const reactI18nextPath = require.resolve('react-i18next')
require.cache[reactI18nextPath] = {
  exports: {
    useTranslation: () => ({ t: translate }),
  },
  filename: reactI18nextPath,
  id: reactI18nextPath,
  loaded: true,
} as NodeModule
const { ActivityPalette } = loadWithJiti<typeof import('./ActivityPalette')>('./ActivityPalette.tsx')
const { useAgentsView } = loadWithJiti<typeof import('../hooks/useAgentsView')>('../hooks/useAgentsView.ts')

const enabledAgents = { claude: { enabled: true }, codex: { enabled: true } }

function workspace(id: string, name = id): WorkspaceMetadata {
  return {
    id,
    name,
    path: `C:\\workspaces\\${id}`,
    config: {
      type: 'canvas',
      sourceControlRepositoryPaths: [],
      workspacePanelOpen: false,
      sourceControlViewMode: 'list',
      agentProvider: 'claude',
      agentProviders: { claude: { enabled: true, args: [] }, codex: { enabled: true, args: [] } },
    },
  }
}

function session(overrides: Partial<AgentActiveSession> = {}): AgentActiveSession {
  return {
    sessionId: 'session-a',
    tileId: 'tile-a',
    workspaceId: 'alpha',
    provider: 'claude',
    status: 'working',
    startedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    lastActivityAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

Object.defineProperty(globalThis, 'electron', {
  configurable: true,
  value: {
    agents: {
      createSession: async () => ({ workspaceId: 'alpha', tileId: 'created', provider: 'claude' }),
      sessionCapabilities: async (): Promise<AgentSessionCapabilities> => ({ provider: null, providers: [], worktreeAvailable: false }),
      sessionsSnapshot: async () => ({ sessions: [] }),
      subscribeSessions: async () => false,
      unsubscribeSessions: async () => true,
      onSessionsChanged: () => () => {},
    },
  },
})

const workspaces = [workspace('alpha', 'Alpha'), workspace('beta', 'Beta'), workspace('gamma', 'Gamma')]
const activeSessions = [
  session({ sessionId: 'alpha-working', tileId: 'tile-alpha', workspaceId: 'alpha', title: 'Refactor' }),
  session({ sessionId: 'alpha-done', tileId: 'tile-alpha-done', workspaceId: 'alpha', status: 'done', title: 'Finished task' }),
  session({ sessionId: 'beta-exited', tileId: 'tile-beta', workspaceId: 'beta', status: 'exited' }),
  session({
    sessionId: 'gamma-input',
    tileId: 'tile-gamma',
    workspaceId: 'gamma',
    status: 'needs-input',
    surface: 'agents-view',
    provider: 'codex',
    worktreeBranch: 'feat/x',
  }),
  session({ sessionId: 'gamma-working', tileId: 'tile-gamma-2', workspaceId: 'gamma', provider: 'codex' }),
]

interface Calls {
  closed: number
  newSession: number
  opened: Array<{ workspaceId: string; tileId: string }>
}

function renderActivityStep(sessions: AgentActiveSession[] = activeSessions): {
  container: any
  root: { unmount: () => void }
  calls: Calls
} {
  const calls: Calls = { closed: 0, newSession: 0, opened: [] }
  const container = document.createElement('div')
  const root = ReactDOM.createRoot(container)
  root.render(
    <ActivityPalette
      step="activity"
      fromActivity={false}
      workspaces={workspaces}
      sessionWorkspaces={workspaces}
      sessions={sessions}
      agents={enabledAgents}
      initialWorkspaceId="alpha"
      focusRequestId={1}
      shortcutLabel="Ctrl+N"
      onClose={() => { calls.closed += 1 }}
      onNewSession={() => { calls.newSession += 1 }}
      onBack={() => undefined}
      onCreated={() => undefined}
      onOpenAgent={(target, agent) => { calls.opened.push({ workspaceId: target.id, tileId: agent.tileId }) }}
    />,
  )
  return { container, root, calls }
}

interface HarnessHandle {
  view: ReturnType<typeof useAgentsView> | null
}

function renderWithHook(): { container: any; root: { unmount: () => void }; handle: HarnessHandle } {
  const handle: HarnessHandle = { view: null }
  function Harness(): React.ReactElement {
    const view = useAgentsView({
      workspaceId: 'alpha',
      workspaceConfig: workspaces[0].config,
      agents: enabledAgents,
      newSessionShortcut: 'Ctrl+N',
    })
    handle.view = view
    return (
      <ActivityPalette
        step={view.activityPaletteStep}
        fromActivity={view.sessionDialogFromActivity}
        workspaces={workspaces}
        sessionWorkspaces={workspaces}
        sessions={activeSessions}
        agents={enabledAgents}
        initialWorkspaceId={view.sessionDialogInitialWorkspaceId}
        focusRequestId={view.sessionDialogFocusRequestId}
        shortcutLabel="Ctrl+N"
        onClose={view.closeSessionDialog}
        onNewSession={view.showNewSessionStep}
        onBack={view.backToActivity}
        onCreated={() => undefined}
        onOpenAgent={() => undefined}
      />
    )
  }
  const container = document.createElement('div')
  const root = ReactDOM.createRoot(container)
  root.render(<Harness />)
  return { container, root, handle }
}

function findByAttribute(container: any, tagName: string, attribute: string): any[] {
  return (Array.from(container.getElementsByTagName(tagName)) as any[])
    .filter((element) => element.hasAttribute(attribute))
}

function findCardIds(container: any): string[] {
  return findByAttribute(container, 'section', 'data-activity-palette-card')
    .map((element) => element.getAttribute('data-activity-palette-card'))
}

function findButton(container: any, label: string): any {
  const buttons = Array.from(container.getElementsByTagName('button')) as any[]
  return buttons.find((button) => button.getAttribute('aria-label') === label || button.textContent?.startsWith(label)) ?? null
}

function isActivityStepOpen(container: any): boolean {
  return findByAttribute(container, 'div', 'data-activity-palette').length > 0
}

function isNewSessionStepOpen(container: any): boolean {
  return findByAttribute(container, 'div', 'aria-labelledby')
    .some((element) => element.getAttribute('aria-labelledby') === 'agent-session-dialog-title')
}

function pressKey(key: string, modifiers: { ctrlKey?: boolean } = {}): void {
  const target = globalThis as unknown as { dispatchEvent: (event: TestEvent) => boolean }
  target.dispatchEvent(new TestEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
    ctrlKey: modifiers.ctrlKey ?? false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
  }))
}

function click(element: any): void {
  element.dispatchEvent(new TestEvent('click', { bubbles: true, cancelable: true }))
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50))
}

test('shows every open agent, with waiting workspaces first and done agents last', async () => {
  const { container, root } = renderActivityStep()

  try {
    await settle()
    assert.deepEqual(findCardIds(container), ['gamma', 'alpha'])
    const agentIds = findByAttribute(container, 'div', 'data-activity-palette-agent')
      .map((element) => element.getAttribute('data-activity-palette-agent'))
    assert.deepEqual(agentIds, ['gamma-input', 'gamma-working', 'alpha-working', 'alpha-done'])
    const [summary] = findByAttribute(container, 'p', 'data-activity-palette-summary')
    assert.equal(summary?.textContent, '4 agentes · 2 workspaces · 1 espera input')
    assert.match(container.textContent, /Espera input/)
    assert.match(container.textContent, /Sesión Ctrl\+N/)
    assert.match(container.textContent, /Tile/)
    assert.match(container.textContent, /⎇ feat\/x/)
    assert.match(container.textContent, /4 min/)
    assert.match(container.textContent, /Finished task/)
    assert.match(container.textContent, /Terminada/)
    assert.match(container.textContent, /1 trabajando · 1 terminada/)
    assert.doesNotMatch(container.textContent, /Beta/)
  } finally {
    root.unmount()
  }
})

test('names each agent by its prompt title, then its terminal title, then its provider', async () => {
  const { container, root } = renderActivityStep([
    session({ sessionId: 'prompted', tileId: 'tile-1', title: 'Refactor', liveTitle: 'Terminal name' }),
    session({ sessionId: 'renamed', tileId: 'tile-2', liveTitle: '✳ Fix the login flow' }),
    session({ sessionId: 'unnamed', tileId: 'tile-3' }),
  ])

  try {
    await settle()
    const rows = findByAttribute(container, 'div', 'data-activity-palette-agent')
      .map((element) => element.textContent as string)
    assert.equal(rows.length, 3)
    assert.ok(rows[0].startsWith('Refactor'), rows[0])
    assert.ok(rows[1].startsWith('✳ Fix the login flow'), rows[1])
    assert.ok(rows[2].startsWith('Claude'), rows[2])
    assert.doesNotMatch(container.textContent, /Terminal name/)
  } finally {
    root.unmount()
  }
})

test('Enter opens the selected agent and arrows move between agents and cards', async () => {
  const { root, calls } = renderActivityStep()

  try {
    await settle()
    pressKey('Enter')
    await settle()
    assert.deepEqual(calls.opened, [{ workspaceId: 'gamma', tileId: 'tile-gamma' }])
    assert.equal(calls.closed, 1)

    pressKey('ArrowRight')
    await settle()
    pressKey('Enter')
    await settle()
    assert.deepEqual(calls.opened[1], { workspaceId: 'alpha', tileId: 'tile-alpha' })

    pressKey('ArrowLeft')
    await settle()
    pressKey('ArrowDown')
    await settle()
    pressKey('Enter')
    await settle()
    assert.deepEqual(calls.opened[2], { workspaceId: 'gamma', tileId: 'tile-gamma-2' })
  } finally {
    root.unmount()
  }
})

test('shows the empty state and Enter moves on to a new session', async () => {
  const { container, root, calls } = renderActivityStep([session({ status: 'exited' })])

  try {
    await settle()
    assert.deepEqual(findCardIds(container), [])
    assert.match(container.textContent, /Ningún workspace tiene agentes abiertos\./)
    assert.ok(findButton(container, 'Nueva sesión'))
    pressKey('Enter')
    await settle()
    assert.equal(calls.newSession, 1)
    pressKey('Escape')
    await settle()
    assert.equal(calls.closed, 1)
  } finally {
    root.unmount()
  }
})

test('the shortcut opens Activity, then the new session step, and Escape goes back', async () => {
  const { container, root } = renderWithHook()

  try {
    await settle()
    assert.equal(isActivityStepOpen(container), false)

    pressKey('n', { ctrlKey: true })
    await settle()
    assert.equal(isActivityStepOpen(container), true)
    assert.equal(isNewSessionStepOpen(container), false)

    pressKey('n', { ctrlKey: true })
    await settle()
    assert.equal(isActivityStepOpen(container), false)
    assert.equal(isNewSessionStepOpen(container), true)
    assert.ok(findButton(container, 'Volver a Actividad'))

    pressKey('Escape')
    await settle()
    assert.equal(isActivityStepOpen(container), true)
    assert.equal(isNewSessionStepOpen(container), false)

    pressKey('Escape')
    await settle()
    assert.equal(isActivityStepOpen(container), false)
  } finally {
    root.unmount()
  }
})

test('the header button moves to the new session step with a way back', async () => {
  const { container, root } = renderWithHook()

  try {
    await settle()
    pressKey('n', { ctrlKey: true })
    await settle()
    click(findButton(container, 'Nueva sesión'))
    await settle()
    assert.equal(isNewSessionStepOpen(container), true)
    click(findButton(container, 'Volver a Actividad'))
    await settle()
    assert.equal(isActivityStepOpen(container), true)
  } finally {
    root.unmount()
  }
})

test('clicking a workspace title opens the new session step for that workspace', async () => {
  const { container, root, handle } = renderWithHook()

  try {
    await settle()
    pressKey('n', { ctrlKey: true })
    await settle()
    const [titleButton] = findByAttribute(container, 'button', 'data-activity-palette-new-session')
    assert.ok(titleButton)
    const targetId = titleButton.getAttribute('data-activity-palette-new-session')
    assert.notEqual(targetId, 'alpha')
    click(titleButton)
    await settle()
    assert.equal(isNewSessionStepOpen(container), true)
    assert.equal(handle.view?.sessionDialogInitialWorkspaceId, targetId)
    assert.ok(findButton(container, 'Volver a Actividad'))
  } finally {
    root.unmount()
  }
})

test('opening the new session step directly has no way back and Escape closes it', async () => {
  const { container, root, handle } = renderWithHook()

  try {
    await settle()
    handle.view?.openNewSessionDialog()
    await settle()
    assert.equal(isNewSessionStepOpen(container), true)
    assert.equal(findButton(container, 'Volver a Actividad'), null)

    pressKey('Escape')
    await settle()
    assert.equal(isNewSessionStepOpen(container), false)
    assert.equal(isActivityStepOpen(container), false)
  } finally {
    root.unmount()
  }
})
