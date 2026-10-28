import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
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
const { CommandPalette } = loadModule<typeof import('./CommandPalette')>('./CommandPalette.tsx')
const { AgentSessionDialog } = loadModule<typeof import('./AgentSessionDialog')>('./AgentSessionDialog.tsx')
const { useAgentsView } = loadModule<typeof import('../hooks/useAgentsView')>('../hooks/useAgentsView.ts')
const { useCommandPaletteStore } = loadModule<typeof import('../store/commandPaletteStore')>(
  '../store/commandPaletteStore.ts',
)

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
  session({
    sessionId: 'gamma-input',
    tileId: 'tile-gamma',
    workspaceId: 'gamma',
    status: 'needs-input',
    surface: 'agents-view',
    provider: 'codex',
    worktreeBranch: 'feat/x',
  }),
]

interface HarnessHandle {
  view: ReturnType<typeof useAgentsView> | null
}

function renderWithHook(): { container: any; root: { unmount: () => void }; handle: HarnessHandle } {
  useCommandPaletteStore.getState().reset()
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
      <>
        <CommandPalette
          open={view.commandPaletteStep === 'palette'}
          focusRequestId={view.sessionDialogFocusRequestId}
          workspaces={workspaces}
          activeWorkspaceId="alpha"
          sessions={activeSessions}
          actions={[]}
          newSessionDetail="Alpha · Claude"
          newSessionShortcut="Ctrl+N"
          searchFiles={null}
          canOpenSessionInSplit={() => false}
          getSessionActions={() => []}
          onClose={view.closeSessionDialog}
          onNewSession={(prompt) => view.showNewSessionStep(undefined, prompt)}
          onOpenSession={() => undefined}
          onOpenWorkspace={() => undefined}
          onOpenFile={() => undefined}
          onRunAction={() => undefined}
        />
        <AgentSessionDialog
          open={view.commandPaletteStep === 'new-session'}
          workspaces={workspaces}
          initialWorkspaceId={view.sessionDialogInitialWorkspaceId}
          initialPrompt={view.sessionDialogInitialPrompt}
          agents={enabledAgents}
          focusRequestId={view.sessionDialogFocusRequestId}
          onClose={view.closeSessionDialog}
          onCreated={() => undefined}
          onBack={view.sessionDialogFromPalette ? view.backToPalette : undefined}
        />
      </>
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

function findButton(container: any, label: string): any {
  const buttons = Array.from(container.getElementsByTagName('button')) as any[]
  return buttons.find((button) => button.getAttribute('aria-label') === label || button.textContent?.startsWith(label)) ?? null
}

function findOption(container: any, key: string): any {
  return findByAttribute(container, 'div', 'data-command-palette-item')
    .find((element) => element.getAttribute('data-command-palette-item') === key) ?? null
}

function findInput(container: any): any {
  return (Array.from(container.getElementsByTagName('input')) as any[])[0] ?? null
}

function isPaletteOpen(container: any): boolean {
  return findByAttribute(container, 'div', 'data-command-palette-section').length > 0
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

function typeInto(input: any, value: string): void {
  input.value = value
  input.dispatchEvent(new TestEvent('input', { bubbles: true, cancelable: true }))
}

function click(element: any): void {
  element.dispatchEvent(new TestEvent('click', { bubbles: true, cancelable: true }))
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50))
}

test('the shortcut opens the palette, then the new session step, and Escape goes back', async () => {
  const { container, root } = renderWithHook()

  try {
    await settle()
    assert.equal(isPaletteOpen(container), false)

    pressKey('n', { ctrlKey: true })
    await settle()
    assert.equal(isPaletteOpen(container), true)
    assert.equal(isNewSessionStepOpen(container), false)

    pressKey('n', { ctrlKey: true })
    await settle()
    assert.equal(isPaletteOpen(container), false)
    assert.equal(isNewSessionStepOpen(container), true)
    assert.ok(findButton(container, 'Volver a la paleta'))

    pressKey('Escape')
    await settle()
    assert.equal(isPaletteOpen(container), true)
    assert.equal(isNewSessionStepOpen(container), false)

    pressKey('Escape')
    await settle()
    assert.equal(isPaletteOpen(container), false)
  } finally {
    root.unmount()
  }
})

test('Enter on the empty palette opens the new session step with a way back', async () => {
  const { container, root } = renderWithHook()

  try {
    await settle()
    pressKey('n', { ctrlKey: true })
    await settle()
    assert.ok(findOption(container, 'new-session'))

    pressKey('Enter')
    await settle()
    assert.equal(isPaletteOpen(container), false)
    assert.equal(isNewSessionStepOpen(container), true)
    assert.ok(findButton(container, 'Volver a la paleta'))
  } finally {
    root.unmount()
  }
})

test('a typed prompt opens the new session step with that prompt written', async () => {
  const { container, root, handle } = renderWithHook()

  try {
    await settle()
    pressKey('n', { ctrlKey: true })
    await settle()

    typeInto(findInput(container), 'texto')
    await settle()
    const promptRow = findOption(container, 'new-session-prompt')
    assert.ok(promptRow)
    assert.match(promptRow.textContent, /Nueva sesión con «texto» como prompt/)

    click(promptRow)
    await settle()
    assert.equal(isNewSessionStepOpen(container), true)
    assert.equal(handle.view?.sessionDialogInitialPrompt, 'texto')
    assert.ok(findButton(container, 'Volver a la paleta'))
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
    assert.equal(findButton(container, 'Volver a la paleta'), null)

    pressKey('Escape')
    await settle()
    assert.equal(isNewSessionStepOpen(container), false)
    assert.equal(isPaletteOpen(container), false)
  } finally {
    root.unmount()
  }
})
