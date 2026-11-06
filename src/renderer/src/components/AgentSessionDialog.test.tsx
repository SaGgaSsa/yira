import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { DOMImplementation } from '@xmldom/xmldom'
import React from 'react'
import type { BotDefinition } from '@shared/bots'
import type {
  AgentProvider,
  AgentPromptImage,
  AgentPromptImageSaveInput,
  AgentSessionCapabilities,
  AgentSessionCreateInput,
  AgentWorktreeOption,
  GitRepository,
  UserSettings,
  WorkspaceMetadata,
} from '@shared/types'

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

class TestFileReader {
  result: string | ArrayBuffer | null = null
  error: Error | null = null
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null

  readAsDataURL(file: File): void {
    this.result = `data:${file.type};base64,cHJldmlldw==`
    this.onload?.({} as ProgressEvent<FileReader>)
  }
}

Object.defineProperty(globalThis, 'FileReader', {
  configurable: true,
  value: TestFileReader,
})

const require = createRequire(import.meta.url)
const cssExtensions = require.extensions as Record<string, (module: NodeModule, filename: string) => void>
cssExtensions['.css'] = () => {}
// tsx compiles required TypeScript files to CommonJS, so mocks placed in require.cache apply.
const loadModule = require as <T>(id: string) => T
const ReactDOM = await import('react-dom/client')
const translationCopy: Record<string, string> = {
  'agentsView.claude': 'Claude',
  'agentsView.codex': 'Codex',
  'agentsView.provider': 'Provider',
  'agentsView.newAgentSession': 'New agent session',
  'agentsView.workspace': 'Workspace',
  'agentsView.unnamedWorkspace': 'Unnamed workspace',
  'agentsView.noUsableWorkspace': 'No workspace has an enabled agent.',
  'agentsView.closeDialog': 'Close dialog',
  'agentsView.prompt': 'Prompt',
  'agentsView.bot': 'Bot',
  'agentsView.noBot': 'No bot',
  'agentsView.providerSetByBot': 'set by the bot',
  'agentsView.botPromptPlaceholder': 'Instruction for {{name}} (optional)',
  'agentsView.promptPlaceholder': 'Enter starts the session',
  'agentsView.removePromptImage': 'Remove image',
  'agentsView.promptImageAlt': 'Attached image',
  'agentsView.promptImageAttachError': 'Could not attach image.',
  'agentsView.promptImageLimit': 'You can attach up to 10 images.',
  'agentsView.promptImageTooLarge': 'Each image must be 10 MB or smaller.',
  'agentsView.promptTooLong': 'The prompt has {{length}} characters. The limit is {{max}}.',
  'agentsView.promptInvalidCharacters': 'The prompt contains control characters.',
  'agentsView.worktree': 'Worktree',
  'agentsView.worktreeDescription': 'Run in a git worktree',
  'agentsView.worktreeNone': 'No worktree',
  'agentsView.worktreeSearch': 'Search branch or module',
  'agentsView.worktreeWorkspaceFolder': 'Workspace folder',
  'agentsView.worktreeNew': 'New worktree',
  'agentsView.worktreeNewDescription': 'New branch in the modules you choose',
  'agentsView.worktreeNewCount_one': 'New worktree · {{count}} module',
  'agentsView.worktreeNewCount_other': 'New worktree · {{count}} modules',
  'agentsView.worktreeModules_one': '{{count}} module',
  'agentsView.worktreeModules_other': '{{count}} modules',
  'agentsView.worktreeExisting': 'Existing worktrees',
  'agentsView.worktreeLoading': 'Looking for worktrees…',
  'agentsView.worktreeLoadError': 'Could not list the worktrees',
  'agentsView.worktreeNoneFound': 'No existing worktrees',
  'agentsView.worktreeNoMatches': 'No worktree matches the search',
  'agentsView.worktreeCreatedByYira': 'Created by Yira',
  'agentsView.worktreeNoSharedFolder': 'No shared folder: choose one module',
  'agentsView.worktreeDetached': 'Detached at {{head}}',
  'agentsView.worktreeMissing': 'Folder not found',
  'agentsView.worktreeClean': 'Clean',
  'agentsView.worktreeChanges_one': '{{count}} change',
  'agentsView.worktreeChanges_other': '{{count}} changes',
  'agentsView.worktreeSessions_one': '{{count}} session',
  'agentsView.worktreeSessions_other': '{{count}} sessions',
  'agentsView.worktreeSummaryNew': 'Creates a new branch in {{modules}} under {{path}}. When the session closes, it is removed if it has no changes or commits.',
  'agentsView.worktreeSummaryNewEmpty': 'Choose at least one module.',
  'agentsView.worktreeSummaryExisting': 'Starts in {{path}} and works on {{modules}}. Yira keeps this worktree when the session closes.',
  'agentsView.createSession': 'Create session',
  'agentsView.creatingSession': 'Creating session…',
  'common.cancel': 'Cancel',
}
const reactI18nextPath = require.resolve('react-i18next')
require.cache[reactI18nextPath] = {
  exports: {
    useTranslation: () => ({
      t: (key: string, values: Record<string, unknown> = {}) => {
        const pluralKey = typeof values.count === 'number'
          ? `${key}_${values.count === 1 ? 'one' : 'other'}`
          : null
        return (translationCopy[pluralKey ?? key] ?? translationCopy[key] ?? key)
          .replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values[name]))
      },
    }),
  },
  filename: reactI18nextPath,
  id: reactI18nextPath,
  loaded: true,
} as NodeModule
const { AgentSessionDialog, getUsableAgentWorkspaces } = loadModule<typeof import('./AgentSessionDialog')>('./AgentSessionDialog.tsx')

const enabledAgents: UserSettings['agents'] = {
  claude: { enabled: true },
  codex: { enabled: true },
}

function workspace(
  id: string,
  options: {
    name?: string
    agentProvider?: AgentProvider
    claudeEnabled?: boolean
    codexEnabled?: boolean
  } = {},
): WorkspaceMetadata {
  return {
    id,
    name: options.name ?? id,
    path: `C:\\workspaces\\${id}`,
    config: {
      type: 'canvas',
      sourceControlRepositoryPaths: [],
      workspacePanelOpen: false,
      sourceControlViewMode: 'list',
      agentProvider: options.agentProvider,
      agentProviders: {
        claude: { enabled: options.claudeEnabled ?? true, args: [] },
        codex: { enabled: options.codexEnabled ?? true, args: [] },
      },
    },
  }
}

const worktreeRepositories: GitRepository[] = [
  { relativePath: 'app', name: 'app' },
  { relativePath: 'libs/api', name: 'api' },
]
const worktreesDirectory = 'C:\\workspaces\\workspace-a\\.worktrees'

function capabilities(worktreeAvailable: boolean): AgentSessionCapabilities {
  return {
    provider: null,
    providers: [],
    worktreeAvailable,
    worktreeRepositories: worktreeAvailable ? worktreeRepositories : [],
    worktreesDirectory: worktreeAvailable ? worktreesDirectory : '',
  }
}

function worktreeOption(overrides: Partial<AgentWorktreeOption> = {}): AgentWorktreeOption {
  return {
    path: 'C:\\worktrees\\existing',
    branch: 'feat/existing',
    head: 'abc1234',
    repositories: [{ ...worktreeRepositories[0], path: 'C:\\worktrees\\existing\\app' }],
    createdByYira: true,
    changedFiles: 0,
    activeSessions: 0,
    missing: false,
    ...overrides,
  }
}

let payloads: AgentSessionCreateInput[] = []
let capabilityCalls: string[] = []
let worktreeListCalls: string[] = []
let promptImageSaveCalls: AgentPromptImageSaveInput[] = []
let promptImageSaveHandler: (input: AgentPromptImageSaveInput) => Promise<AgentPromptImage> = async () => ({
  path: `C:\\prompt-images\\image-${promptImageSaveCalls.length}.png`,
})
let capabilityHandler: (workspaceId: string) => Promise<AgentSessionCapabilities> = async () => capabilities(true)
let worktreeListHandler: (workspaceId: string) => Promise<AgentWorktreeOption[]> = async () => []
let closeCount = 0
let createdCount = 0
const createdResult = { workspaceId: 'workspace-a', tileId: 'agent-a', provider: 'claude' as const }
Object.defineProperty(globalThis, 'electron', {
  configurable: true,
  value: {
    agents: {
      createSession: async (input: AgentSessionCreateInput) => {
        payloads.push(input)
        return createdResult
      },
      sessionCapabilities: (workspaceId: string) => {
        capabilityCalls.push(workspaceId)
        return capabilityHandler(workspaceId)
      },
      listWorktrees: (workspaceId: string) => {
        worktreeListCalls.push(workspaceId)
        return worktreeListHandler(workspaceId)
      },
      savePromptImage: (input: AgentPromptImageSaveInput) => {
        promptImageSaveCalls.push(input)
        return promptImageSaveHandler(input)
      },
    },
  },
})

interface DialogOptions {
  workspaces?: WorkspaceMetadata[]
  initialWorkspaceId?: string | null
  initialPrompt?: string
  agents?: UserSettings['agents']
  bots?: BotDefinition[]
  capabilities?: (workspaceId: string) => Promise<AgentSessionCapabilities>
  worktrees?: (workspaceId: string) => Promise<AgentWorktreeOption[]>
  focusRequestId?: number
}

function renderDialog(options: DialogOptions = {}): {
  container: any
  root: { unmount: () => void; render: (children: React.ReactNode) => void }
  render: (focusRequestId: number, open?: boolean) => void
} {
  payloads = []
  capabilityCalls = []
  worktreeListCalls = []
  promptImageSaveCalls = []
  promptImageSaveHandler = async () => ({
    path: `C:\\prompt-images\\image-${promptImageSaveCalls.length}.png`,
  })
  closeCount = 0
  createdCount = 0
  capabilityHandler = options.capabilities ?? (async () => capabilities(true))
  worktreeListHandler = options.worktrees ?? (async () => [])
  const props = {
    open: true,
    workspaces: options.workspaces ?? [workspace('workspace-a', { agentProvider: 'claude' })],
    initialWorkspaceId: options.initialWorkspaceId ?? 'workspace-a',
    initialPrompt: options.initialPrompt,
    agents: options.agents ?? enabledAgents,
    bots: options.bots,
    focusRequestId: options.focusRequestId ?? 1,
    onClose: () => { closeCount += 1 },
    onCreated: () => { createdCount += 1 },
  }
  const container = document.createElement('div')
  const root = ReactDOM.createRoot(container)
  const render = (focusRequestId: number, open = true): void => {
    root.render(<AgentSessionDialog {...props} open={open} focusRequestId={focusRequestId} />)
  }
  root.render(<AgentSessionDialog {...props} />)
  return { container, root, render }
}

function findElement(container: any, tagName: string): any {
  return container.getElementsByTagName(tagName)[0] ?? null
}

function elementOrder(container: any, target: any): number {
  let order = 0
  let targetOrder = -1
  const visit = (node: any): void => {
    if (targetOrder !== -1) return
    if (node === target) {
      targetOrder = order
      return
    }
    order += 1
    const childNodes = node.childNodes
    if (!childNodes) return
    for (let index = 0; index < childNodes.length; index += 1) visit(childNodes[index])
  }

  visit(container)
  return targetOrder
}

function findWorkspaceTrigger(container: any): any {
  const buttons = container.getElementsByTagName('button')
  for (let index = 0; index < buttons.length; index += 1) {
    if (buttons[index].getAttribute('aria-haspopup') === 'listbox') return buttons[index]
  }
  return null
}

function findWorkspaceListbox(): any {
  const divs = document.body.getElementsByTagName('div')
  for (let index = 0; index < divs.length; index += 1) {
    if (divs[index].getAttribute('role') === 'listbox') return divs[index]
  }
  return null
}

function findWorkspaceOption(label: string): any {
  const divs = document.body.getElementsByTagName('div')
  for (let index = 0; index < divs.length; index += 1) {
    if (divs[index].getAttribute('role') === 'option' && divs[index].textContent === label) return divs[index]
  }
  return null
}

function findWorktreeTrigger(container: any): any {
  const buttons = container.getElementsByTagName('button')
  for (let index = 0; index < buttons.length; index += 1) {
    if ((buttons[index].getAttribute('aria-label') ?? '').startsWith('Worktree: ')) return buttons[index]
  }
  return null
}

function findWorktreeListbox(): any {
  const divs = document.body.getElementsByTagName('div')
  for (let index = 0; index < divs.length; index += 1) {
    if (
      divs[index].getAttribute('role') === 'listbox'
      && divs[index].getAttribute('aria-label') === 'Worktree'
    ) return divs[index]
  }
  return null
}

function findWorktreeMenuOption(text: string): any {
  const listbox = findWorktreeListbox()
  if (!listbox) return null
  const divs = listbox.getElementsByTagName('div')
  for (let index = 0; index < divs.length; index += 1) {
    if (
      divs[index].getAttribute('role') === 'option'
      && (divs[index].textContent ?? '').includes(text)
    ) return divs[index]
  }
  return null
}

function findWorktreeSearchInput(): any {
  const listbox = findWorktreeListbox()
  if (!listbox) return null
  const inputs = listbox.getElementsByTagName('input')
  for (let index = 0; index < inputs.length; index += 1) {
    if (inputs[index].getAttribute('placeholder') === 'Search branch or module') return inputs[index]
  }
  return null
}

function findWorktreeCheckboxes(): any[] {
  const listbox = findWorktreeListbox()
  if (!listbox) return []
  return (Array.from(listbox.getElementsByTagName('input')) as any[])
    .filter((input) => input.type === 'checkbox')
}

async function openWorktreePicker(container: any): Promise<void> {
  dispatch(findWorktreeTrigger(container), 'click')
  await settle()
}

function findRadio(container: any, label: string): any {
  const buttons = container.getElementsByTagName('button')
  for (let index = 0; index < buttons.length; index += 1) {
    if (buttons[index].getAttribute('role') === 'radio' && buttons[index].textContent === label) return buttons[index]
  }
  return null
}

function bot(id: string, options: Partial<BotDefinition> = {}): BotDefinition {
  return {
    id,
    name: id,
    icon: 'bug',
    color: 'sky',
    provider: 'codex',
    model: '',
    description: '',
    role: 'Review carefully',
    workspaces: { mode: 'all' },
    tools: [],
    callable: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...options,
  }
}

function findBotGroup(container: any): any {
  const divs = container.getElementsByTagName('div')
  for (let index = 0; index < divs.length; index += 1) {
    if (divs[index].getAttribute('aria-label') === 'Bot') return divs[index]
  }
  return null
}

function findBotRadio(container: any, label: string): any {
  const buttons = findBotGroup(container)?.getElementsByTagName('button')
  if (!buttons) return null
  for (let index = 0; index < buttons.length; index += 1) {
    if (buttons[index].textContent === label) return buttons[index]
  }
  return null
}

function findCreateButton(container: any): any {
  const buttons = container.getElementsByTagName('button')
  for (let index = 0; index < buttons.length; index += 1) {
    if (buttons[index].textContent === 'Create session') return buttons[index]
  }
  return null
}

function dispatch(element: any, type: string, init: Record<string, unknown> = {}): void {
  element.dispatchEvent(new TestEvent(type, { bubbles: true, cancelable: true, ...init }))
}

function makeClipboardImage(mimeType: string, bytes: number[]): File {
  const buffer = Uint8Array.from(bytes).buffer
  return {
    type: mimeType,
    size: bytes.length,
    arrayBuffer: async () => buffer,
  } as unknown as File
}

function pasteClipboardImages(textarea: any, files: File[]): TestEvent {
  const event = new TestEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: {
      items: files.map((file) => ({
        kind: 'file',
        type: file.type,
        getAsFile: () => file,
      })),
      files,
    },
  })
  textarea.dispatchEvent(event)
  return event
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50))
}

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition() && Date.now() < deadline) await settle()
}

async function chooseWorkspace(container: any, label: string): Promise<void> {
  dispatch(findWorkspaceTrigger(container), 'click')
  await settle()
  dispatch(findWorkspaceOption(label), 'click')
  await settle()
}

test('selects only workspaces whose agent is enabled globally and in that workspace', () => {
  const usable = getUsableAgentWorkspaces([
    workspace('both', { agentProvider: 'claude' }),
    workspace('global-disabled', { agentProvider: 'claude', claudeEnabled: false, codexEnabled: false }),
    workspace('workspace-enabled', { agentProvider: 'claude' }),
    workspace('no-agent'),
    workspace('codex-agent', { agentProvider: 'codex' }),
  ], {
    claude: { enabled: true },
    codex: { enabled: false },
  })

  assert.deepEqual(usable.map(({ workspace: entry, providers }) => ({ id: entry.id, providers })), [
    { id: 'both', providers: ['claude'] },
    { id: 'workspace-enabled', providers: ['claude'] },
  ])
})

test('preselects the initial workspace and its configured usable provider', async () => {
  const { container, root } = renderDialog({
    workspaces: [workspace('workspace-a', { agentProvider: 'claude' }), workspace('workspace-b', { agentProvider: 'codex' })],
    initialWorkspaceId: 'workspace-b',
  })

  try {
    await settle()
    assert.equal(findWorkspaceTrigger(container).getAttribute('aria-label'), 'Workspace: workspace-b')
    assert.equal(findWorkspaceTrigger(container).getAttribute('aria-expanded'), 'false')
    assert.equal(findRadio(container, 'Codex')?.getAttribute('aria-checked'), 'true')
    await waitFor(() => capabilityCalls.length >= 1)
    assert.deepEqual(capabilityCalls, ['workspace-b'])
  } finally {
    root.unmount()
  }
})

test('opens with the initial prompt text', async () => {
  const { container, root } = renderDialog({ initialPrompt: 'Text from a note' })

  try {
    await settle()
    const prompt = findElement(container, 'textarea')
    assert.equal(prompt.value, 'Text from a note')
  } finally {
    root.unmount()
  }
})

test('changing workspaces updates provider choices and requests new capabilities', async () => {
  const { container, root } = renderDialog({
    workspaces: [
      workspace('workspace-a', { agentProvider: 'claude' }),
      workspace('workspace-b', { agentProvider: 'codex', claudeEnabled: false }),
    ],
  })

  try {
    await settle()
    assert.ok(findRadio(container, 'Claude'))
    dispatch(findWorkspaceTrigger(container), 'click')
    await settle()
    assert.equal(findWorkspaceListbox()?.getAttribute('role'), 'listbox')
    dispatch(findWorkspaceOption('workspace-b'), 'click')
    await settle()

    assert.equal(findWorkspaceTrigger(container).getAttribute('aria-label'), 'Workspace: workspace-b')
    assert.equal(container.textContent.includes('Codex'), true)
    const divs = container.getElementsByTagName('div')
    assert.equal(Array.from({ length: divs.length }, (_, index) => divs[index])
      .some((element) => element.getAttribute('role') === 'radiogroup'), false)
    await waitFor(() => capabilityCalls.length >= 2)
    assert.deepEqual(capabilityCalls, ['workspace-a', 'workspace-b'])
  } finally {
    root.unmount()
  }
})

test('the workspace menu lists only usable workspaces passed to the dialog', async () => {
  const { container, root } = renderDialog({
    workspaces: [
      workspace('available', { name: 'Available workspace', agentProvider: 'claude' }),
      workspace('disabled', { name: 'Disabled workspace', agentProvider: 'claude', claudeEnabled: false, codexEnabled: false }),
      workspace('not-configured', { name: 'No agent workspace' }),
    ],
  })

  try {
    await settle()
    dispatch(findWorkspaceTrigger(container), 'click')
    await settle()
    const listbox = findWorkspaceListbox()
    const options = listbox.getElementsByTagName('div')
    const labels = Array.from({ length: options.length }, (_, index) => options[index])
      .filter((option: any) => option.getAttribute('role') === 'option')
      .map((option: any) => option.textContent)

    assert.deepEqual(labels, ['Available workspace'])
  } finally {
    root.unmount()
  }
})

test('renders the prompt before the control toolbar', async () => {
  const { container, root } = renderDialog()

  try {
    await settle()
    const prompt = findElement(container, 'textarea')
    const workspaceTrigger = findWorkspaceTrigger(container)
    assert.ok(elementOrder(container, prompt) < elementOrder(container, workspaceTrigger))
  } finally {
    root.unmount()
  }
})

test('Escape closes the workspace menu without closing the dialog', async () => {
  const { container, root } = renderDialog()

  try {
    await settle()
    dispatch(findWorkspaceTrigger(container), 'click')
    await settle()
    dispatch(findWorkspaceListbox(), 'keydown', { key: 'Escape' })
    await settle()

    assert.equal(findWorkspaceListbox(), null)
    assert.equal(findWorkspaceTrigger(container).getAttribute('aria-expanded'), 'false')
    assert.equal(closeCount, 0)
  } finally {
    root.unmount()
  }
})

test('keyboard opens, moves through, and chooses a workspace', async () => {
  const { container, root } = renderDialog({
    workspaces: [
      workspace('workspace-a', { agentProvider: 'claude' }),
      workspace('workspace-b', { agentProvider: 'claude' }),
    ],
  })

  try {
    await settle()
    dispatch(findWorkspaceTrigger(container), 'keydown', { key: 'ArrowDown' })
    await settle()
    const listbox = findWorkspaceListbox()

    assert.equal(findWorkspaceTrigger(container).getAttribute('aria-expanded'), 'true')
    dispatch(listbox, 'keydown', { key: 'ArrowDown' })
    await settle()
    assert.equal(listbox.getAttribute('aria-activedescendant'), findWorkspaceOption('workspace-b').getAttribute('id'))
    dispatch(listbox, 'keydown', { key: 'Enter' })
    await settle()

    assert.equal(findWorkspaceTrigger(container).getAttribute('aria-label'), 'Workspace: workspace-b')
    assert.equal(findWorkspaceListbox(), null)
  } finally {
    root.unmount()
  }
})

test('the Claude and Codex segmented provider control remains selectable', async () => {
  const { container, root } = renderDialog()

  try {
    await settle()
    assert.equal(findRadio(container, 'Claude')?.getAttribute('aria-checked'), 'true')
    assert.equal(findRadio(container, 'Codex')?.getAttribute('aria-checked'), 'false')
    dispatch(findRadio(container, 'Codex'), 'click')
    await settle()

    assert.equal(findRadio(container, 'Claude')?.getAttribute('aria-checked'), 'false')
    assert.equal(findRadio(container, 'Codex')?.getAttribute('aria-checked'), 'true')
  } finally {
    root.unmount()
  }
})

test('sends the selected workspace, provider, prompt, and worktree setting', async () => {
  const { container, root } = renderDialog({
    workspaces: [workspace('workspace-a', { agentProvider: 'claude' })],
  })

  try {
    await settle()
    const prompt = findElement(container, 'textarea')
    const worktreeTrigger = findWorktreeTrigger(container)
    assert.equal(worktreeTrigger.getAttribute('aria-label'), 'Worktree: No worktree')
    assert.equal(worktreeTrigger.getAttribute('title'), 'Run in a git worktree')
    prompt.value = 'Summarize this repository'
    dispatch(prompt, 'input')
    dispatch(worktreeTrigger, 'click')
    await settle()
    const newWorktreeOption = findWorktreeMenuOption('New worktree')
    assert.ok(newWorktreeOption)
    dispatch(newWorktreeOption, 'click')
    await settle()
    assert.equal(findWorktreeListbox() !== null, true)
    assert.equal(worktreeTrigger.getAttribute('aria-label'), 'Worktree: New worktree · 2 modules')

    dispatch(prompt, 'keydown', { key: 'Enter', shiftKey: true })
    await settle()
    assert.equal(payloads.length, 0)

    dispatch(prompt, 'keydown', { key: 'Enter', shiftKey: false })
    await settle()
    assert.deepEqual(payloads[0], {
      workspaceId: 'workspace-a',
      provider: 'claude',
      prompt: 'Summarize this repository',
      worktree: true,
    })
    assert.equal(createdCount, 1)
    assert.equal(closeCount, 1)
  } finally {
    root.unmount()
  }
})

test('starts a session in an existing worktree', async () => {
  const existing = worktreeOption({
    path: 'C:\\worktrees\\feature',
    branch: 'feat/feature',
    changedFiles: 2,
    activeSessions: 1,
  })
  const { container, root } = renderDialog({ worktrees: async () => [existing] })

  try {
    await settle()
    await openWorktreePicker(container)
    assert.equal(findWorktreeListbox()?.getAttribute('aria-label'), 'Worktree')
    const option = findWorktreeMenuOption(existing.path)
    assert.ok(option)
    assert.equal(option.textContent.includes('2 changes · 1 session'), true)
    dispatch(option, 'click')
    await settle()

    assert.equal(findWorktreeListbox(), null)
    assert.equal(
      findWorktreeTrigger(container).getAttribute('aria-label'),
      'Worktree: feat/feature · app',
    )
    assert.equal(container.textContent.includes(`Starts in ${existing.path} and works on app.`), true)

    dispatch(findElement(container, 'form'), 'submit')
    await settle()
    assert.deepEqual(payloads[0], {
      workspaceId: 'workspace-a',
      provider: 'claude',
      worktree: false,
      existingWorktreePath: existing.path,
    })
  } finally {
    root.unmount()
  }
})

test('starts a new worktree with the chosen modules', async () => {
  const { container, root } = renderDialog()

  try {
    await settle()
    await openWorktreePicker(container)
    dispatch(findWorktreeMenuOption('New worktree'), 'click')
    await settle()

    const checkboxes = findWorktreeCheckboxes()
    assert.equal(checkboxes.length, 2)
    checkboxes[1].checked = false
    dispatch(checkboxes[1], 'click')
    await settle()

    assert.equal(
      findWorktreeTrigger(container).getAttribute('aria-label'),
      'Worktree: New worktree · 1 module',
    )
    assert.equal(
      container.textContent.includes(`Creates a new branch in app under ${worktreesDirectory}.`),
      true,
    )

    dispatch(findElement(container, 'form'), 'submit')
    await settle()
    assert.deepEqual(payloads[0], {
      workspaceId: 'workspace-a',
      provider: 'claude',
      worktree: true,
      worktreeRepositories: ['app'],
    })
  } finally {
    root.unmount()
  }
})

test('requires at least one module for a new worktree', async () => {
  const { container, root } = renderDialog()

  try {
    await settle()
    await openWorktreePicker(container)
    dispatch(findWorktreeMenuOption('New worktree'), 'click')
    await settle()

    const firstCheckbox = findWorktreeCheckboxes()[0]
    firstCheckbox.checked = false
    dispatch(firstCheckbox, 'click')
    await settle()
    const secondCheckbox = findWorktreeCheckboxes()[1]
    secondCheckbox.checked = false
    dispatch(secondCheckbox, 'click')
    await settle()

    assert.equal(findCreateButton(container).hasAttribute('disabled'), true)
    assert.equal(container.textContent.includes('Choose at least one module.'), true)

    dispatch(findElement(container, 'form'), 'submit')
    await settle()
    dispatch(findElement(container, 'textarea'), 'keydown', { key: 'Enter' })
    await settle()
    assert.equal(payloads.length, 0)
  } finally {
    root.unmount()
  }
})

test('does not select a worktree whose folder is missing', async () => {
  const missing = worktreeOption({ path: 'C:\\worktrees\\gone', missing: true })
  const { container, root } = renderDialog({ worktrees: async () => [missing] })

  try {
    await settle()
    await openWorktreePicker(container)
    const option = findWorktreeMenuOption(missing.path)
    assert.ok(option)
    assert.equal(option.getAttribute('aria-disabled'), 'true')
    assert.equal(option.textContent.includes('Folder not found'), true)

    dispatch(option, 'click')
    await settle()
    assert.ok(findWorktreeListbox())
    assert.equal(findWorktreeTrigger(container).getAttribute('aria-label'), 'Worktree: No worktree')
  } finally {
    root.unmount()
  }
})

test('filters existing worktrees by branch or module', async () => {
  const alpha = worktreeOption({
    path: 'C:\\worktrees\\alpha',
    branch: 'feat/alpha',
    repositories: [{ relativePath: 'app', name: 'app', path: 'C:\\worktrees\\alpha\\app' }],
  })
  const beta = worktreeOption({
    path: 'C:\\worktrees\\beta',
    branch: 'fix/beta',
    repositories: [{ relativePath: 'libs/api', name: 'api', path: 'C:\\worktrees\\beta\\libs\\api' }],
  })
  const { container, root } = renderDialog({ worktrees: async () => [alpha, beta] })

  try {
    await settle()
    await openWorktreePicker(container)
    assert.ok(findWorktreeMenuOption(alpha.path))
    assert.ok(findWorktreeMenuOption(beta.path))

    const search = findWorktreeSearchInput()
    search.value = 'API'
    dispatch(search, 'input')
    await settle()
    assert.equal(findWorktreeMenuOption(alpha.path), null)
    assert.ok(findWorktreeMenuOption(beta.path))
    assert.ok(findWorktreeMenuOption('Workspace folder'))
    assert.ok(findWorktreeMenuOption('New worktree'))

    search.value = 'nothing-here'
    dispatch(search, 'input')
    await settle()
    assert.equal(findWorktreeMenuOption(alpha.path), null)
    assert.equal(findWorktreeMenuOption(beta.path), null)
    assert.equal(
      findWorktreeListbox().textContent.includes('No worktree matches the search'),
      true,
    )
  } finally {
    root.unmount()
  }
})

test('ignores a late worktree list response after reopening', async () => {
  let resolveFirst: (options: AgentWorktreeOption[]) => void = () => undefined
  const firstResponse = new Promise<AgentWorktreeOption[]>((resolve) => { resolveFirst = resolve })
  const late = worktreeOption({ path: 'C:\\worktrees\\late', branch: 'feat/late' })
  const current = worktreeOption({ path: 'C:\\worktrees\\current', branch: 'feat/current' })
  let listCalls = 0
  const { container, root } = renderDialog({
    worktrees: async () => {
      listCalls += 1
      return listCalls === 1 ? firstResponse : [current]
    },
  })

  try {
    await settle()
    await openWorktreePicker(container)
    dispatch(findWorktreeListbox(), 'keydown', { key: 'Escape' })
    await settle()
    await openWorktreePicker(container)
    assert.ok(findWorktreeMenuOption(current.path))

    resolveFirst([late])
    await settle()
    assert.equal(findWorktreeMenuOption(late.path), null)
    assert.ok(findWorktreeMenuOption(current.path))
  } finally {
    root.unmount()
  }
})

test('Enter in the worktree search chooses the highlighted row', async () => {
  const { container, root } = renderDialog()

  try {
    await settle()
    await openWorktreePicker(container)
    const listbox = findWorktreeListbox()
    assert.ok(listbox)
    const search = findElement(listbox, 'input')
    search.dispatchEvent(new TestEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' }))
    await settle()
    search.dispatchEvent(new TestEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }))
    await settle()

    assert.equal(
      findWorktreeTrigger(container).getAttribute('aria-label'),
      'Worktree: New worktree · 2 modules',
    )
  } finally {
    root.unmount()
  }
})

test('choosing New worktree again keeps the unchecked modules', async () => {
  const { container, root } = renderDialog()

  try {
    await settle()
    await openWorktreePicker(container)
    dispatch(findWorktreeMenuOption('New worktree'), 'click')
    await settle()
    const checkboxes = findWorktreeCheckboxes()
    checkboxes[1].checked = false
    dispatch(checkboxes[1], 'click')
    await settle()

    dispatch(findWorktreeMenuOption('New worktree'), 'click')
    await settle()

    assert.equal(
      findWorktreeTrigger(container).getAttribute('aria-label'),
      'Worktree: New worktree · 1 module',
    )
  } finally {
    root.unmount()
  }
})

test('Escape closes the worktree picker without closing the dialog', async () => {
  const { container, root } = renderDialog()

  try {
    await settle()
    await openWorktreePicker(container)
    const listbox = findWorktreeListbox()
    assert.ok(listbox)
    const event = new TestEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' })
    listbox.dispatchEvent(event)
    await settle()

    assert.equal(event.defaultPrevented, true)
    assert.equal(findWorktreeListbox(), null)
    assert.equal(findWorktreeTrigger(container).getAttribute('aria-expanded'), 'false')
    assert.equal(closeCount, 0)
  } finally {
    root.unmount()
  }
})

test('Alt+Enter inserts a line break instead of starting the session', async () => {
  const { container, root } = renderDialog({
    workspaces: [workspace('workspace-a', { agentProvider: 'claude' })],
  })

  try {
    await settle()
    const prompt = findElement(container, 'textarea')
    prompt.value = 'First line'
    dispatch(prompt, 'input')
    await settle()
    prompt.selectionStart = prompt.value.length
    prompt.selectionEnd = prompt.value.length
    prompt.setRangeText = (text: string, start: number, end: number) => {
      prompt.value = prompt.value.slice(0, start) + text + prompt.value.slice(end)
    }

    dispatch(prompt, 'keydown', { key: 'Enter', altKey: true })
    await settle()
    assert.equal(payloads.length, 0)
    assert.equal(prompt.value, 'First line\n')

    prompt.value = 'First line\nSecond line'
    dispatch(prompt, 'input')
    dispatch(prompt, 'keydown', { key: 'Enter' })
    await settle()
    assert.equal(payloads[0]?.prompt, 'First line\nSecond line')
  } finally {
    root.unmount()
  }
})

test('starts a session without a prompt when the prompt is empty', async () => {
  const { container, root } = renderDialog({
    workspaces: [workspace('workspace-a', { agentProvider: 'claude' })],
  })

  try {
    await settle()
    assert.equal(findCreateButton(container).hasAttribute('disabled'), false)
    const prompt = findElement(container, 'textarea')
    prompt.value = '  '
    dispatch(prompt, 'input')
    dispatch(prompt, 'keydown', { key: 'Enter', shiftKey: false })
    await settle()
    assert.deepEqual(payloads[0], {
      workspaceId: 'workspace-a',
      provider: 'claude',
      worktree: false,
    })
    assert.equal(createdCount, 1)
  } finally {
    root.unmount()
  }
})

function findAlert(container: any): any {
  const paragraphs = container.getElementsByTagName('p')
  for (let index = 0; index < paragraphs.length; index += 1) {
    if (paragraphs[index].getAttribute('role') === 'alert') return paragraphs[index]
  }
  return null
}

test('shows why a prompt is invalid and does not start the session', async () => {
  const { container, root } = renderDialog({
    workspaces: [workspace('workspace-a', { agentProvider: 'claude' })],
  })

  try {
    await settle()
    const prompt = findElement(container, 'textarea')
    prompt.value = 'x'.repeat(20_001)
    dispatch(prompt, 'input')
    await settle()
    assert.match(findAlert(container)?.textContent ?? '', /20[,.]?001 characters\. The limit is 20[,.]?000/)
    assert.equal(prompt.getAttribute('aria-invalid'), 'true')
    assert.equal(findCreateButton(container).hasAttribute('disabled'), true)

    prompt.value = 'Fix \u001b[31mthis\u001b[0m'
    dispatch(prompt, 'input')
    await settle()
    assert.match(findAlert(container)?.textContent ?? '', /control characters/)
    dispatch(prompt, 'keydown', { key: 'Enter', shiftKey: false })
    await settle()
    assert.equal(payloads.length, 0)

    prompt.value = 'Fix this'
    dispatch(prompt, 'input')
    await settle()
    assert.equal(findAlert(container), null)
    assert.equal(findCreateButton(container).hasAttribute('disabled'), false)
  } finally {
    root.unmount()
  }
})

test('pastes multiple prompt images, removes one, and sends the remaining path', async () => {
  const { container, root } = renderDialog()

  try {
    await settle()
    const prompt = findElement(container, 'textarea')
    const pasteEvent = pasteClipboardImages(prompt, [
      makeClipboardImage('image/png', [1, 2, 3]),
      makeClipboardImage('image/jpeg', [4, 5, 6]),
    ])
    await waitFor(() => promptImageSaveCalls.length === 2)

    const previews = container.getElementsByTagName('img')
    assert.equal(pasteEvent.defaultPrevented, true)
    assert.equal(prompt.value, '[Image #1] [Image #2] ')
    assert.equal(previews.length, 2)
    assert.equal(previews[0].getAttribute('alt'), 'Attached image 1')
    assert.equal(promptImageSaveCalls[0].mimeType, 'image/png')
    assert.deepEqual(Array.from(promptImageSaveCalls[0].data), [1, 2, 3])

    const buttons = container.getElementsByTagName('button')
    let removeButton: any = null
    for (let index = 0; index < buttons.length; index += 1) {
      if (buttons[index].getAttribute('aria-label') === 'Remove image 1') {
        removeButton = buttons[index]
        break
      }
    }
    assert.ok(removeButton)
    dispatch(removeButton, 'click')
    await settle()

    assert.equal(container.getElementsByTagName('img').length, 1)
    assert.equal(prompt.value, '[Image #2]')
    dispatch(prompt, 'keydown', { key: 'Enter' })
    await settle()
    assert.deepEqual(payloads[0], {
      workspaceId: 'workspace-a',
      provider: 'claude',
      prompt: '[Image #2]',
      images: [{ number: 2, path: 'C:\\prompt-images\\image-2.png' }],
      worktree: false,
    })
  } finally {
    root.unmount()
  }
})

test('pasting text does not save an image or prevent the default paste', async () => {
  const { container, root } = renderDialog()

  try {
    await settle()
    const prompt = findElement(container, 'textarea')
    const pasteEvent = new TestEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: {
        items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
        files: [],
      },
    })
    prompt.dispatchEvent(pasteEvent)
    await settle()

    assert.equal(pasteEvent.defaultPrevented, false)
    assert.equal(promptImageSaveCalls.length, 0)
    assert.equal(container.getElementsByTagName('img').length, 0)
  } finally {
    root.unmount()
  }
})

test('hides the worktree control while checking capabilities and when unavailable', async () => {
  let resolveCapabilities: (value: AgentSessionCapabilities) => void = () => undefined
  const pendingCapabilities = new Promise<AgentSessionCapabilities>((resolve) => { resolveCapabilities = resolve })
  const { container, root } = renderDialog({ capabilities: () => pendingCapabilities })

  try {
    await settle()
    assert.equal(findWorktreeTrigger(container), null)

    resolveCapabilities(capabilities(false))
    await settle()
    assert.equal(findWorktreeTrigger(container), null)
    assert.equal(container.textContent.includes('Git worktrees are unavailable for this workspace.'), false)

    const prompt = findElement(container, 'textarea')
    prompt.value = 'Create a task without a worktree'
    dispatch(prompt, 'input')
    dispatch(prompt, 'keydown', { key: 'Enter', shiftKey: false })
    await settle()
    assert.equal(payloads[0]?.worktree, false)
  } finally {
    root.unmount()
  }
})

test('falls back from an unusable initial workspace and disables submit when none are usable', async () => {
  const fallback = renderDialog({
    workspaces: [
      workspace('unusable', { claudeEnabled: false, codexEnabled: false }),
      workspace('usable', { agentProvider: 'codex' }),
    ],
    initialWorkspaceId: 'unusable',
  })

  try {
    await settle()
    assert.equal(findWorkspaceTrigger(fallback.container).getAttribute('aria-label'), 'Workspace: usable')
    assert.equal(findRadio(fallback.container, 'Codex')?.getAttribute('aria-checked'), 'true')
  } finally {
    fallback.root.unmount()
  }

  const empty = renderDialog({
    workspaces: [workspace('unusable', { claudeEnabled: false, codexEnabled: false })],
  })
  try {
    await settle()
    const prompt = findElement(empty.container, 'textarea')
    prompt.value = 'Create a task'
    dispatch(prompt, 'input')
    await settle()
    assert.equal(findCreateButton(empty.container).hasAttribute('disabled'), true)
    assert.equal(findWorkspaceTrigger(empty.container), null)
    assert.match(empty.container.textContent, /No workspace has an enabled agent\./)
  } finally {
    empty.root.unmount()
  }
})

test('ignores a late worktree capability response from the previous workspace', async () => {
  let resolvePrevious: (value: AgentSessionCapabilities) => void = () => undefined
  const previousResponse = new Promise<AgentSessionCapabilities>((resolve) => { resolvePrevious = resolve })
  const { container, root } = renderDialog({
    workspaces: [workspace('workspace-a', { agentProvider: 'claude' }), workspace('workspace-b', { agentProvider: 'claude' })],
    capabilities: (workspaceId) => workspaceId === 'workspace-a'
      ? previousResponse
      : Promise.resolve(capabilities(false)),
  })

  try {
    await settle()
    await chooseWorkspace(container, 'workspace-b')
    await settle()
    assert.equal(findWorktreeTrigger(container), null)

    resolvePrevious(capabilities(true))
    await settle()
    assert.equal(findWorktreeTrigger(container), null)
  } finally {
    root.unmount()
  }
})

test('a repeated open request keeps the prompt and only re-focuses it', async () => {
  const { container, root, render } = renderDialog()
  try {
    await settle()
    const prompt = findElement(container, 'textarea')
    prompt.value = 'Keep this prompt'
    dispatch(prompt, 'input')
    await settle()

    render(2)
    await settle()
    assert.equal(findElement(container, 'textarea').value, 'Keep this prompt')
  } finally {
    root.unmount()
  }
})

test('starts a session with the chosen bot and its provider', async () => {
  const { container, root } = renderDialog({
    bots: [bot('reviewer', { name: 'Reviewer', description: 'Reviews diffs', provider: 'codex' })],
  })

  try {
    await settle()
    const prompt = findElement(container, 'textarea')
    assert.equal(findBotRadio(container, 'No bot')?.getAttribute('aria-checked'), 'true')
    assert.equal(prompt.getAttribute('placeholder'), 'Enter starts the session')
    dispatch(findBotRadio(container, 'Reviewer'), 'click')
    await settle()

    assert.equal(findBotRadio(container, 'Reviewer')?.getAttribute('aria-checked'), 'true')
    assert.equal(findRadio(container, 'Claude'), null)
    assert.equal(container.textContent.includes('set by the bot'), true)
    assert.equal(container.textContent.includes('Reviews diffs'), true)
    assert.equal(prompt.getAttribute('placeholder'), 'Instruction for Reviewer (optional)')

    dispatch(findElement(container, 'form'), 'submit')
    await settle()
    assert.deepEqual(payloads[0], {
      workspaceId: 'workspace-a',
      provider: 'codex',
      botId: 'reviewer',
      worktree: false,
    })
  } finally {
    root.unmount()
  }
})

test('does not offer bots restricted to other workspaces', async () => {
  const { container, root } = renderDialog({
    bots: [bot('elsewhere', { name: 'Elsewhere', workspaces: { mode: 'selected', workspaceIds: ['otro'] } })],
  })

  try {
    await settle()
    assert.equal(findBotGroup(container), null)
    assert.equal(container.textContent.includes('Elsewhere'), false)
  } finally {
    root.unmount()
  }
})

test('does not show the bot row when there are no bots', async () => {
  const { container, root } = renderDialog()

  try {
    await settle()
    assert.equal(findBotGroup(container), null)
    assert.equal(container.textContent.includes('No bot'), false)
  } finally {
    root.unmount()
  }
})
