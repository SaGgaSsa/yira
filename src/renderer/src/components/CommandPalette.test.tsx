import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom'
import React from 'react'
import type { AgentActiveSession, FileSearchEntry, WorkspaceMetadata } from '@shared/types'
import { resources } from '@/i18n/resources'
import type { CommandPaletteAction, CommandPaletteRecent } from '@/utils/commandPalette'

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
// tsx compiles required TypeScript files to CommonJS, so mocks placed in require.cache apply.
const loadModule = require as <T>(id: string) => T
const ReactDOM = await import('react-dom/client')

type TranslationTree = { [key: string]: string | TranslationTree }

// Spanish copy from the real resources, with the interpolation rules the palette relies on.
function translate(key: string, options: Record<string, unknown> = {}): string {
  const lookup = (path: string): string | undefined => {
    let node: string | TranslationTree | undefined = resources.es.translation as unknown as TranslationTree
    for (const part of path.split('.')) node = typeof node === 'object' ? node[part] : undefined
    return typeof node === 'string' ? node : undefined
  }
  const template = lookup(key) ?? key
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
const { CommandPalette } = loadModule<typeof import('./CommandPalette')>('./CommandPalette.tsx')
const { useCommandPaletteStore } = loadModule<typeof import('../store/commandPaletteStore')>(
  '../store/commandPaletteStore.ts',
)
const { actionItemKey, sessionItemKey } = loadModule<typeof import('../utils/commandPalette')>(
  '../utils/commandPalette.ts',
)

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
      agentProviders: { claude: { enabled: true, args: [] }, codex: { enabled: true, args: [] } },
    },
  }
}

const workspaces = [workspace('alpha', 'Alpha'), workspace('beta', 'Beta'), workspace('gamma', 'Gamma')]

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

function session(overrides: Partial<AgentActiveSession> = {}): AgentActiveSession {
  return {
    sessionId: 'session-a',
    tileId: 'tile-a',
    workspaceId: 'alpha',
    provider: 'claude',
    status: 'working',
    startedAt: minutesAgo(10),
    lastActivityAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const attentionSession = session({
  sessionId: 'session-input',
  tileId: 'tile-input',
  workspaceId: 'gamma',
  provider: 'codex',
  status: 'needs-input',
  title: 'Needs help',
  worktreeBranch: 'feat/x',
  startedAt: minutesAgo(5),
})
const refactorSession = session({
  sessionId: 'session-refactor',
  tileId: 'tile-refactor',
  workspaceId: 'alpha',
  title: 'Refactor alpha',
  startedAt: minutesAgo(10),
})
const secondSession = session({
  sessionId: 'session-two',
  tileId: 'tile-two',
  workspaceId: 'beta',
  title: 'Beta cleanup',
  startedAt: minutesAgo(8),
})
const thirdSession = session({
  sessionId: 'session-three',
  tileId: 'tile-three',
  workspaceId: 'alpha',
  title: 'Third task',
  startedAt: minutesAgo(6),
})
const fourthSession = session({
  sessionId: 'session-four',
  tileId: 'tile-four',
  workspaceId: 'alpha',
  title: 'Fourth task',
  startedAt: minutesAgo(4),
})
const doneSession = session({
  sessionId: 'session-done',
  tileId: 'tile-done',
  workspaceId: 'beta',
  status: 'done',
  title: 'Finished task',
  startedAt: minutesAgo(3),
})
const exitedSession = session({
  sessionId: 'session-exited',
  tileId: 'tile-exited',
  status: 'exited',
  title: 'Gone',
  startedAt: minutesAgo(1),
})

const sessions = [
  attentionSession,
  refactorSession,
  secondSession,
  thirdSession,
  fourthSession,
  doneSession,
  exitedSession,
]

const actions: CommandPaletteAction[] = [
  { id: 'open-settings', label: 'Open settings', icon: 'settings', shortcut: 'Ctrl+,' },
  { id: 'deploy', label: 'Deploy app', icon: 'terminal', detail: 'npm run deploy' },
  { id: 'open-canvas', label: 'Open canvas', icon: 'canvas' },
]

interface Calls {
  closed: number
  newSessions: Array<string | undefined>
  sessions: Array<{ sessionId: string; split: boolean }>
  workspaces: string[]
  files: string[]
  actions: string[]
  sessionActions: string[]
}

interface RenderOptions {
  recents?: CommandPaletteRecent[]
  canOpenSessionInSplit?: (session: AgentActiveSession) => boolean
  searchFiles?: ((query: string) => Promise<FileSearchEntry[]>) | null
}

function renderPalette(options: RenderOptions = {}): {
  container: any
  root: { unmount: () => void }
  calls: Calls
} {
  const store = useCommandPaletteStore.getState()
  store.reset()
  for (const recent of [...(options.recents ?? [])].reverse()) store.recordUse(recent)

  const calls: Calls = {
    closed: 0,
    newSessions: [],
    sessions: [],
    workspaces: [],
    files: [],
    actions: [],
    sessionActions: [],
  }
  const container = document.createElement('div')
  renderedContainer = container
  const root = ReactDOM.createRoot(container)
  root.render(
    <CommandPalette
      open={true}
      focusRequestId={1}
      workspaces={workspaces}
      activeWorkspaceId="alpha"
      sessions={sessions}
      actions={actions}
      newSessionDetail="yira · Claude"
      newSessionShortcut="Ctrl+N"
      searchFiles={options.searchFiles ?? null}
      canOpenSessionInSplit={options.canOpenSessionInSplit ?? (() => true)}
      getSessionActions={(target) => [
        {
          id: 'open',
          label: 'Open',
          icon: 'open',
          run: () => { calls.sessionActions.push(`${target.sessionId}:open`) },
        },
        {
          id: 'split',
          label: 'Open in split',
          icon: 'split',
          shortcut: 'Ctrl+Shift+O',
          run: () => { calls.sessionActions.push(`${target.sessionId}:split`) },
        },
        {
          id: 'close',
          label: 'Close session',
          icon: 'close',
          danger: true,
          run: () => { calls.sessionActions.push(`${target.sessionId}:close`) },
        },
        {
          id: 'pin',
          label: 'Pin session',
          icon: 'pin',
          disabled: true,
          run: () => { calls.sessionActions.push(`${target.sessionId}:pin`) },
        },
      ]}
      onClose={() => { calls.closed += 1 }}
      onNewSession={(prompt) => { calls.newSessions.push(prompt) }}
      onOpenSession={(target, sessionOptions) => {
        calls.sessions.push({ sessionId: target.sessionId, split: sessionOptions.split })
      }}
      onOpenWorkspace={(target) => { calls.workspaces.push(target.id) }}
      onOpenFile={(entry) => { calls.files.push(entry.relativePath) }}
      onRunAction={(actionId) => { calls.actions.push(actionId) }}
    />,
  )
  return { container, root, calls }
}

function findAll(container: any, tagName: string): any[] {
  return Array.from(container.getElementsByTagName(tagName)) as any[]
}

function findByAttribute(container: any, tagName: string, attribute: string): any[] {
  return findAll(container, tagName).filter((element) => element.hasAttribute(attribute))
}

function findOption(container: any, key: string): any {
  return findByAttribute(container, 'div', 'data-command-palette-item')
    .find((element) => element.getAttribute('data-command-palette-item') === key) ?? null
}

function optionKeys(container: any): string[] {
  return findByAttribute(container, 'div', 'data-command-palette-item')
    .map((element) => element.getAttribute('data-command-palette-item'))
}

function sectionIds(container: any): string[] {
  return findByAttribute(container, 'div', 'data-command-palette-section')
    .map((element) => element.getAttribute('data-command-palette-section'))
}

function findSection(container: any, id: string): any {
  return findByAttribute(container, 'div', 'data-command-palette-section')
    .find((element) => element.getAttribute('data-command-palette-section') === id) ?? null
}

function findMore(container: any): any {
  return findByAttribute(container, 'div', 'data-command-palette-more')[0] ?? null
}

function findInput(container: any): any {
  return findAll(container, 'input')[0] ?? null
}

function findListbox(container: any): any {
  return findAll(container, 'div').find((element) => element.getAttribute('role') === 'listbox') ?? null
}

function dispatch(element: any, type: string, init: Record<string, unknown> = {}): void {
  element.dispatchEvent(new TestEvent(type, { bubbles: true, cancelable: true, ...init }))
}

function typeInto(input: any, value: string): void {
  input.value = value
  dispatch(input, 'input')
}

function click(element: any): void {
  dispatch(element, 'click')
}

function pressKey(key: string, modifiers: { shiftKey?: boolean } = {}): void {
  const target = globalThis as unknown as { dispatchEvent: (event: TestEvent) => boolean }
  target.dispatchEvent(new TestEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
    ctrlKey: false,
    altKey: false,
    shiftKey: modifiers.shiftKey ?? false,
    metaKey: false,
  }))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let renderedContainer: any = null

/** Waits until the rendered markup stops changing, so slow machines get the time they need. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50))
  const serializer = new XMLSerializer()
  let previous = renderedContainer ? serializer.serializeToString(renderedContainer) : ''
  for (let elapsed = 0; elapsed < 2000; elapsed += 20) {
    await new Promise((resolve) => setTimeout(resolve, 20))
    const current = renderedContainer ? serializer.serializeToString(renderedContainer) : ''
    if (current === previous) return
    previous = current
  }
}

test('opens on the new session row and Enter starts a session', async () => {
  const { container, root, calls } = renderPalette()

  try {
    await settle()
    const input = findInput(container)
    assert.equal(input.getAttribute('placeholder'), 'Buscar sesiones, workspaces, acciones o archivos…')
    assert.deepEqual(sectionIds(container), ['top', 'attention', 'active'])

    const newSession = findOption(container, 'new-session')
    assert.ok(newSession)
    assert.equal(newSession.getAttribute('aria-selected'), 'true')
    assert.equal(findListbox(container).getAttribute('aria-activedescendant'), newSession.getAttribute('id'))
    assert.match(container.textContent, /yira · Claude/)
    assert.match(container.textContent, /Ctrl\+N/)

    pressKey('Enter')
    await settle()
    assert.deepEqual(calls.newSessions, [undefined])
    assert.equal(calls.closed, 0)
    assert.deepEqual(useCommandPaletteStore.getState().recents, [{ key: 'new-session' }])
  } finally {
    root.unmount()
  }
})

test('shows the last used action first with the last badge and runs it', async () => {
  const { container, root, calls } = renderPalette({ recents: [{ key: actionItemKey('open-settings') }] })

  try {
    await settle()
    assert.deepEqual(optionKeys(container).slice(0, 2), ['action:open-settings', 'new-session'])
    const lastUsed = findOption(container, 'action:open-settings')
    assert.match(lastUsed.textContent, /última/)
    assert.match(lastUsed.textContent, /Ctrl\+,/)
    assert.doesNotMatch(findOption(container, 'new-session').textContent, /última/)

    pressKey('Enter')
    await settle()
    assert.deepEqual(calls.actions, ['open-settings'])
    assert.equal(calls.closed, 0)
    assert.deepEqual(useCommandPaletteStore.getState().recents, [{ key: 'action:open-settings' }])
  } finally {
    root.unmount()
  }
})

test('groups attention and the first three active agents, and "Show more" expands them', async () => {
  const { container, root } = renderPalette()

  try {
    await settle()
    const attention = findSection(container, 'attention')
    assert.ok(attention)
    assert.match(attention.textContent, /Necesitan atención/)
    assert.match(attention.textContent, /Needs help/)
    assert.equal(findAll(attention, 'div').filter((element) => element.getAttribute('role') === 'option').length, 1)

    const active = findSection(container, 'active')
    assert.ok(active)
    assert.match(active.textContent, /Activos/)
    assert.equal(findAll(active, 'div').filter((element) => element.getAttribute('role') === 'option').length, 4)

    const more = findMore(container)
    assert.ok(more)
    assert.match(more.textContent, /Ver 2 más/)

    click(more)
    await settle()
    assert.equal(findMore(container), null)
    assert.equal(findAll(findSection(container, 'active'), 'div').filter((element) => element.getAttribute('role') === 'option').length, 5)
  } finally {
    root.unmount()
  }
})

test('typing filters sessions, highlights the match, and Enter opens the session', async () => {
  const { container, root, calls } = renderPalette()

  try {
    await settle()
    typeInto(findInput(container), 'refactor')
    await settle()

    assert.deepEqual(sectionIds(container), ['sessions', 'create'])
    assert.deepEqual(optionKeys(container), [sessionItemKey('session-refactor'), 'new-session-prompt'])
    const marks = findAll(findOption(container, sessionItemKey('session-refactor')), 'mark')
    assert.equal(marks.length, 1)
    assert.equal(marks[0].textContent, 'Refactor')
    assert.match(container.textContent, /Nueva sesión con «refactor» como prompt/)
    assert.match(container.textContent, /Alpha · Claude/)

    pressKey('Enter')
    await settle()
    assert.deepEqual(calls.sessions, [{ sessionId: 'session-refactor', split: false }])
    assert.equal(calls.closed, 0)
    assert.deepEqual(useCommandPaletteStore.getState().recents, [{ key: sessionItemKey('session-refactor') }])
  } finally {
    root.unmount()
  }
})

test('the action prefix limits results to actions and hides the prompt row', async () => {
  const { container, root, calls } = renderPalette()

  try {
    await settle()
    typeInto(findInput(container), '> settings')
    await settle()

    assert.deepEqual(sectionIds(container), ['actions'])
    assert.deepEqual(optionKeys(container), [actionItemKey('open-settings')])
    assert.doesNotMatch(container.textContent, /Nueva sesión con/)

    pressKey('Enter')
    await settle()
    assert.deepEqual(calls.actions, ['open-settings'])
  } finally {
    root.unmount()
  }
})

test('the prompt row starts a session with the typed prompt', async () => {
  const { container, root, calls } = renderPalette()

  try {
    await settle()
    typeInto(findInput(container), 'fix login')
    await settle()

    const promptRow = findOption(container, 'new-session-prompt')
    assert.ok(promptRow)
    assert.match(promptRow.textContent, /Nueva sesión con «fix login» como prompt/)

    click(promptRow)
    await settle()
    assert.deepEqual(calls.newSessions, ['fix login'])
    assert.deepEqual(useCommandPaletteStore.getState().recents, [{ key: 'new-session-prompt' }])
  } finally {
    root.unmount()
  }
})

test('Shift+Enter opens a session in split when the app allows it', async () => {
  const { container, root, calls } = renderPalette({ canOpenSessionInSplit: () => true })

  try {
    await settle()
    typeInto(findInput(container), 'refactor')
    await settle()

    pressKey('Enter', { shiftKey: true })
    await settle()
    assert.deepEqual(calls.sessions, [{ sessionId: 'session-refactor', split: true }])
  } finally {
    root.unmount()
  }
})

test('Shift+Enter falls back to a normal open when split is unavailable', async () => {
  const { container, root, calls } = renderPalette({ canOpenSessionInSplit: () => false })

  try {
    await settle()
    typeInto(findInput(container), 'refactor')
    await settle()

    pressKey('Enter', { shiftKey: true })
    await settle()
    assert.deepEqual(calls.sessions, [{ sessionId: 'session-refactor', split: false }])
  } finally {
    root.unmount()
  }
})

test('Tab opens session actions, Enter runs one, and Backspace returns to the list', async () => {
  const { container, root, calls } = renderPalette()

  try {
    await settle()
    pressKey('ArrowDown')
    await settle()
    assert.equal(findOption(container, sessionItemKey('session-input')).getAttribute('aria-selected'), 'true')

    pressKey('Tab')
    await settle()
    const subInput = findInput(container)
    assert.equal(subInput.value, '')
    assert.equal(subInput.getAttribute('placeholder'), 'Filtrar acciones…')
    assert.match(container.textContent, /Needs help/)
    assert.deepEqual(
      findByAttribute(container, 'div', 'data-command-palette-session-action')
        .map((element) => element.getAttribute('data-command-palette-session-action')),
      ['open', 'split', 'close', 'pin'],
    )
    assert.equal(findAll(container, 'mark').length, 0)

    pressKey('Enter')
    await settle()
    assert.deepEqual(calls.sessionActions, ['session-input:open'])
    assert.deepEqual(calls.sessions, [])
    assert.equal(calls.closed, 0)

    pressKey('Backspace')
    await settle()
    assert.equal(findInput(container).getAttribute('placeholder'), 'Buscar sesiones, workspaces, acciones o archivos…')
    assert.equal(findInput(container).value, '')
    assert.ok(findOption(container, 'new-session'))

    pressKey('Tab')
    await settle()
    assert.match(container.textContent, /Needs help/)
    pressKey('Escape')
    await settle()
    assert.equal(calls.closed, 1)
  } finally {
    root.unmount()
  }
})

test('returns to the previous search text when leaving session actions', async () => {
  const { container, root } = renderPalette()

  try {
    await settle()
    typeInto(findInput(container), 'feat')
    await settle()
    assert.deepEqual(optionKeys(container).slice(0, 1), [sessionItemKey('session-input')])

    pressKey('Tab')
    await settle()
    assert.equal(findInput(container).value, '')
    pressKey('Backspace')
    await settle()

    assert.equal(findInput(container).value, 'feat')
    assert.deepEqual(sectionIds(container), ['sessions', 'create'])
    assert.ok(findOption(container, sessionItemKey('session-input')))
  } finally {
    root.unmount()
  }
})

test('typing in the session actions page filters them', async () => {
  const { container, root, calls } = renderPalette()

  try {
    await settle()
    pressKey('ArrowDown')
    await settle()
    pressKey('Tab')
    await settle()
    typeInto(findInput(container), 'split')
    await settle()

    assert.deepEqual(
      findByAttribute(container, 'div', 'data-command-palette-session-action')
        .map((element) => element.getAttribute('data-command-palette-session-action')),
      ['split'],
    )
    pressKey('Enter')
    await settle()
    assert.deepEqual(calls.sessionActions, ['session-input:split'])
  } finally {
    root.unmount()
  }
})

test('Escape closes the palette from the main list', async () => {
  const { root, calls } = renderPalette()

  try {
    await settle()
    pressKey('Escape')
    await settle()
    assert.equal(calls.closed, 1)
  } finally {
    root.unmount()
  }
})

test('dangerous session actions are styled, and disabled ones do not run', async () => {
  const { container, root, calls } = renderPalette()

  try {
    await settle()
    pressKey('ArrowDown')
    await settle()
    pressKey('Tab')
    await settle()

    const sessionActions = findByAttribute(container, 'div', 'data-command-palette-session-action')
    const closeAction = sessionActions
      .find((element) => element.getAttribute('data-command-palette-session-action') === 'close')
    assert.ok(closeAction)
    assert.match(closeAction.textContent, /Close session/)
    const dangerLabel = findAll(closeAction, 'span')
      .find((element) => (element.getAttribute('class') ?? '').includes('text-danger'))
    assert.ok(dangerLabel)

    const disabledAction = sessionActions
      .find((element) => element.getAttribute('data-command-palette-session-action') === 'pin')
    assert.ok(disabledAction)
    assert.equal(disabledAction.getAttribute('aria-disabled'), 'true')
    assert.match(disabledAction.getAttribute('class'), /opacity-50/)
    click(disabledAction)
    await settle()
    assert.deepEqual(calls.sessionActions, [])

    click(closeAction)
    await settle()
    assert.deepEqual(calls.sessionActions, ['session-input:close'])
    assert.deepEqual(useCommandPaletteStore.getState().recents, [])
  } finally {
    root.unmount()
  }
})

test('file search waits for the debounce and discards a stale response', async () => {
  const searches: string[] = []
  const freshEntry: FileSearchEntry = { name: 'file-fresh.ts', relativePath: 'src/file-fresh.ts' }
  const staleEntry: FileSearchEntry = { name: 'file-stale.ts', relativePath: 'src/file-stale.ts' }
  let resolveStale!: (entries: FileSearchEntry[]) => void
  const stalePromise = new Promise<FileSearchEntry[]>((resolve) => { resolveStale = resolve })
  const searchFiles = (query: string): Promise<FileSearchEntry[]> => {
    searches.push(query)
    if (query === 'fi') return stalePromise
    return Promise.resolve([freshEntry])
  }

  const { container, root } = renderPalette({ searchFiles })

  try {
    await settle()
    typeInto(findInput(container), 'fi')
    await sleep(60)
    assert.deepEqual(searches, [])

    await sleep(100)
    assert.deepEqual(searches, ['fi'])
    assert.equal(findOption(container, `file:alpha:${staleEntry.relativePath}`), null)

    typeInto(findInput(container), 'file')
    await sleep(160)
    assert.deepEqual(searches, ['fi', 'file'])
    assert.ok(findOption(container, `file:alpha:${freshEntry.relativePath}`))

    resolveStale([staleEntry])
    await sleep(60)
    assert.equal(findOption(container, `file:alpha:${staleEntry.relativePath}`), null)
    assert.ok(findOption(container, `file:alpha:${freshEntry.relativePath}`))
  } finally {
    root.unmount()
  }
})
