import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { DOMImplementation } from '@xmldom/xmldom'
import React from 'react'
import type {
  AgentProvider,
  AgentPromptImage,
  AgentPromptImageSaveInput,
  AgentSessionCapabilities,
  AgentSessionCreateInput,
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
  'agentsView.claude': 'Claude',
  'agentsView.codex': 'Codex',
  'agentsView.provider': 'Provider',
  'agentsView.newAgentSession': 'New agent session',
  'agentsView.workspace': 'Workspace',
  'agentsView.unnamedWorkspace': 'Unnamed workspace',
  'agentsView.noUsableWorkspace': 'No workspace has an enabled agent.',
  'agentsView.closeDialog': 'Close dialog',
  'agentsView.prompt': 'Prompt',
  'agentsView.promptPlaceholder': 'Enter starts the session',
  'agentsView.removePromptImage': 'Remove image',
  'agentsView.promptImageAlt': 'Attached image',
  'agentsView.promptImageAttachError': 'Could not attach image.',
  'agentsView.promptImageLimit': 'You can attach up to 10 images.',
  'agentsView.promptImageTooLarge': 'Each image must be 10 MB or smaller.',
  'agentsView.worktree': 'Worktree',
  'agentsView.worktreeDescription': 'Run in a git worktree',
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
const { AgentSessionDialog, getUsableAgentWorkspaces } = loadWithJiti<typeof import('./AgentSessionDialog')>('./AgentSessionDialog.tsx')

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

function capabilities(worktreeAvailable: boolean): AgentSessionCapabilities {
  return { provider: null, providers: [], worktreeAvailable }
}

let payloads: AgentSessionCreateInput[] = []
let capabilityCalls: string[] = []
let promptImageSaveCalls: AgentPromptImageSaveInput[] = []
let promptImageSaveHandler: (input: AgentPromptImageSaveInput) => Promise<AgentPromptImage> = async () => ({
  path: `C:\\prompt-images\\image-${promptImageSaveCalls.length}.png`,
})
let capabilityHandler: (workspaceId: string) => Promise<AgentSessionCapabilities> = async () => capabilities(true)
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
  agents?: UserSettings['agents']
  capabilities?: (workspaceId: string) => Promise<AgentSessionCapabilities>
  focusRequestId?: number
}

function renderDialog(options: DialogOptions = {}): {
  container: any
  root: { unmount: () => void; render: (children: React.ReactNode) => void }
  render: (focusRequestId: number, open?: boolean) => void
} {
  payloads = []
  capabilityCalls = []
  promptImageSaveCalls = []
  promptImageSaveHandler = async () => ({
    path: `C:\\prompt-images\\image-${promptImageSaveCalls.length}.png`,
  })
  closeCount = 0
  createdCount = 0
  capabilityHandler = options.capabilities ?? (async () => capabilities(true))
  const props = {
    open: true,
    workspaces: options.workspaces ?? [workspace('workspace-a', { agentProvider: 'claude' })],
    initialWorkspaceId: options.initialWorkspaceId ?? 'workspace-a',
    agents: options.agents ?? enabledAgents,
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

function findRadio(container: any, label: string): any {
  const buttons = container.getElementsByTagName('button')
  for (let index = 0; index < buttons.length; index += 1) {
    if (buttons[index].getAttribute('role') === 'radio' && buttons[index].textContent === label) return buttons[index]
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
    const checkbox = findElement(container, 'input')
    assert.equal(checkbox.parentNode.textContent, 'Worktree')
    assert.equal(checkbox.getAttribute('title'), 'Run in a git worktree')
    prompt.value = 'Summarize this repository'
    dispatch(prompt, 'input')
    checkbox.checked = true
    dispatch(checkbox, 'click')
    await settle()

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
    assert.equal(findElement(container, 'input'), null)

    resolveCapabilities(capabilities(false))
    await settle()
    assert.equal(findElement(container, 'input'), null)
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
    assert.equal(findElement(container, 'input'), null)

    resolvePrevious(capabilities(true))
    await settle()
    assert.equal(findElement(container, 'input'), null)
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
