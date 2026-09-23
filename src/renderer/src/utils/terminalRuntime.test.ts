import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  TerminalCreateOptions,
  TerminalCreateResult,
  TerminalExitEvent,
} from '@shared/types'
import type { TerminalSessionIdentity, TerminalSessionTarget } from '@shared/terminalSessionIdentity'
import {
  createTerminalRuntime,
  type FitAddonLike,
  type ResizeObserverLike,
  type TerminalLike,
  type TerminalRuntime,
  type TerminalRuntimeCreateOptions,
  type TerminalRuntimeDependencies,
  type TerminalRuntimeViewOptions,
  type TerminalFitSchedulerLike,
} from './terminalRuntime'
import type { TerminalFitDimensions, TerminalFitResult } from './terminalFitScheduler'
import { createTerminalFitScheduler } from './terminalFitScheduler'

class FakeElement {
  readonly children: FakeElement[] = []
  readonly style: Record<string, string> = {}
  parentElement: FakeElement | null = null
  isConnected = true
  private readonly focusListeners = new Set<() => void>()

  constructor(private readonly xtermElement = false) {}

  replaceChildren(...children: FakeElement[]): void {
    for (const child of this.children) child.parentElement = null
    this.children.length = 0
    for (const child of children) this.appendChild(child)
  }

  appendChild(child: FakeElement): FakeElement {
    child.parentElement?.removeChild(child)
    child.parentElement = this
    this.children.push(child)
    return child
  }

  removeChild(child: FakeElement): FakeElement {
    const index = this.children.indexOf(child)
    if (index >= 0) this.children.splice(index, 1)
    if (child.parentElement === this) child.parentElement = null
    return child
  }

  remove(): void {
    this.parentElement?.removeChild(this)
  }

  querySelector(selector: string): FakeElement | null {
    if (selector !== '.xterm') return null
    return this.xtermElement ? this : this.children.find((child) => child.xtermElement) ?? null
  }

  addEventListener(type: string, listener: () => void): void {
    if (type === 'focus') this.focusListeners.add(listener)
  }

  removeEventListener(type: string, listener: () => void): void {
    if (type === 'focus') this.focusListeners.delete(listener)
  }

  dispatchFocus(): void {
    for (const listener of [...this.focusListeners]) listener()
  }
}

interface FakeTerminalEvents {
  readonly events: string[]
}

class FakeTerminal implements TerminalLike {
  readonly options: { fontSize?: number; theme?: unknown } = {}
  readonly textarea = new FakeElement() as unknown as Element
  readonly writes: string[] = []
  readonly refreshCalls: Array<{ start: number; end: number }> = []
  readonly inputCallbacks: Array<(data: string) => void> = []
  readonly titleCallbacks: Array<(title: string) => void> = []
  readonly pendingReplayCallbacks: Array<() => void> = []
  readonly loadedAddons: unknown[] = []
  readonly pastedData: string[] = []
  readonly events: string[]
  cols = 80
  rows = 24
  openedIn: HTMLElement | null = null
  focusCalls = 0
  disposeCalls = 0
  hasSelectionCalls = 0
  getSelectionCalls = 0
  selectAllCalls = 0
  selection = ''

  constructor(
    events: FakeTerminalEvents,
    private readonly openError?: Error,
    initialDimensions?: { cols: number; rows: number },
  ) {
    this.events = events.events
    if (initialDimensions) {
      this.cols = initialDimensions.cols
      this.rows = initialDimensions.rows
    }
  }

  loadAddon(addon: unknown): void {
    this.loadedAddons.push(addon)
    this.events.push('terminal:loadAddon')
  }

  open(container: HTMLElement): void {
    if (this.openError) throw this.openError
    this.openedIn = container
    this.events.push('terminal:open')
  }

  write(data: string, callback?: () => void): void {
    this.writes.push(data)
    this.events.push(`terminal:write:${data}`)
    if (callback) this.pendingReplayCallbacks.push(callback)
  }

  completeReplay(): void {
    const callback = this.pendingReplayCallbacks.shift()
    if (!callback) throw new Error('expected a pending replay callback')
    callback()
  }

  refresh(start: number, end: number): void {
    this.refreshCalls.push({ start, end })
    this.events.push(`terminal:refresh:${start}-${end}`)
  }

  dispose(): void {
    this.disposeCalls += 1
    this.events.push('terminal:dispose')
  }

  focus(): void {
    this.focusCalls += 1
    this.events.push('terminal:focus')
    const textarea = this.textarea as unknown as FakeElement
    textarea.dispatchFocus()
  }

  hasSelection(): boolean {
    this.hasSelectionCalls += 1
    return this.selection.length > 0
  }

  getSelection(): string {
    this.getSelectionCalls += 1
    return this.selection
  }

  selectAll(): void {
    this.selectAllCalls += 1
    this.events.push('terminal:selectAll')
  }

  paste(data: string): void {
    this.pastedData.push(data)
    this.events.push(`terminal:paste:${data}`)
  }

  onData(callback: (data: string) => void): () => void {
    this.inputCallbacks.push(callback)
    return () => {
      const index = this.inputCallbacks.indexOf(callback)
      if (index >= 0) this.inputCallbacks.splice(index, 1)
    }
  }

  onTitleChange(callback: (title: string) => void): () => void {
    this.titleCallbacks.push(callback)
    return () => {
      const index = this.titleCallbacks.indexOf(callback)
      if (index >= 0) this.titleCallbacks.splice(index, 1)
    }
  }

  emitInput(data: string): void {
    for (const callback of [...this.inputCallbacks]) callback(data)
  }

  emitTitle(title: string): void {
    for (const callback of [...this.titleCallbacks]) callback(title)
  }
}

class FakeFitAddon implements FitAddonLike {
  fitCalls = 0
  fitMutations = 0
  dimensions: TerminalFitDimensions | undefined = { cols: 100, rows: 30 }
  attachedTerminal: FakeTerminal | null = null

  fit(): void {
    this.fitCalls += 1
    const proposed = this.dimensions
    const terminal = this.attachedTerminal
    if (!proposed || !terminal) return
    if (proposed.cols <= 0 || proposed.rows <= 0) return
    if (terminal.cols !== proposed.cols || terminal.rows !== proposed.rows) {
      terminal.cols = proposed.cols
      terminal.rows = proposed.rows
      this.fitMutations += 1
    }
  }

  proposeDimensions(): TerminalFitDimensions | undefined {
    return this.dimensions
  }
}

interface FitRequest {
  readonly fitAddon: FitAddonLike
  readonly resize: (cols: number, rows: number) => void
  readonly complete?: (result: TerminalFitResult) => void
  readonly getTerminalSize?: () => TerminalFitDimensions | null | undefined
}

class FakeFitScheduler implements TerminalFitSchedulerLike {
  readonly requests: FitRequest[] = []
  private lastDimensions: TerminalFitDimensions | null = null

  setKnownDimensions(dimensions: TerminalFitDimensions): void {
    if (dimensions && dimensions.cols > 0 && dimensions.rows > 0) {
      this.lastDimensions = { cols: Math.floor(dimensions.cols), rows: Math.floor(dimensions.rows) }
    }
  }

  notifyResizeFailure(dimensions: TerminalFitDimensions): void {
    if (!dimensions) return
    if (this.lastDimensions
      && this.lastDimensions.cols === Math.floor(dimensions.cols)
      && this.lastDimensions.rows === Math.floor(dimensions.rows)) {
      this.lastDimensions = null
    }
  }

  requestFit(
    fitAddon: FitAddonLike,
    resize: (cols: number, rows: number) => void,
    complete?: (result: TerminalFitResult) => void,
    getTerminalSize?: () => TerminalFitDimensions | null | undefined,
  ): void {
    if (this.requests.length > 0) return
    this.requests.push({ fitAddon, resize, complete, getTerminalSize })
  }

  cancelPending(): void {
    this.requests.length = 0
  }

  flush(): TerminalFitResult | null {
    const request = this.requests.shift()
    if (!request) return null

    const dimensions = request.fitAddon.proposeDimensions()
    let result: TerminalFitResult = 'unmeasurable'
    if (dimensions && dimensions.cols > 0 && dimensions.rows > 0) {
      request.fitAddon.fit()
      let effective: TerminalFitDimensions | null = null
      try {
        const terminalSize = request.getTerminalSize?.()
        if (terminalSize && terminalSize.cols > 0 && terminalSize.rows > 0) {
          effective = { cols: Math.floor(terminalSize.cols), rows: Math.floor(terminalSize.rows) }
        }
      } catch {
        effective = null
      }
      if (!effective) {
        const postFit = request.fitAddon.proposeDimensions()
        if (postFit && postFit.cols > 0 && postFit.rows > 0) {
          effective = { cols: Math.floor(postFit.cols), rows: Math.floor(postFit.rows) }
        }
      }
      if (!effective) {
        request.complete?.('unmeasurable')
        return 'unmeasurable'
      }
      const normalized = effective
      if (this.lastDimensions
        && this.lastDimensions.cols === normalized.cols
        && this.lastDimensions.rows === normalized.rows) {
        result = 'unchanged'
      } else {
        this.lastDimensions = normalized
        request.resize(normalized.cols, normalized.rows)
        result = 'fitted'
      }
    }
    request.complete?.(result)
    return result
  }
}

class FakeResizeObserver implements ResizeObserverLike {
  readonly observed: HTMLElement[] = []
  disconnected = false

  constructor(readonly callback: () => void) {}

  observe(target: HTMLElement): void {
    this.observed.push(target)
  }

  disconnect(): void {
    this.disconnected = true
  }

  notify(): void {
    if (!this.disconnected) this.callback()
  }
}

interface BridgeHarness {
  readonly create: (target: TerminalSessionTarget, options: TerminalCreateOptions) => Promise<TerminalCreateResult>
  readonly attach: (identity: TerminalSessionIdentity) => Promise<TerminalCreateResult>
  readonly write: (identity: TerminalSessionIdentity, data: string) => Promise<void>
  readonly resize: (identity: TerminalSessionIdentity, cols: number, rows: number) => Promise<void>
  readonly destroy: (identity: TerminalSessionIdentity) => Promise<void>
  readonly detach: (identity: TerminalSessionIdentity) => Promise<void>
  readonly acknowledgeAgentAlert: (identity: TerminalSessionIdentity) => Promise<void>
  readonly onData: (identity: TerminalSessionIdentity, callback: (data: string) => void) => () => void
  readonly onExit: (identity: TerminalSessionIdentity, callback: (event: TerminalExitEvent) => void) => () => void
  readonly onAgentAlert: (tileId: string, callback: (state: unknown) => void) => () => void
  readonly emitData: (data: string) => void
  readonly emitExit: (event: TerminalExitEvent) => void
  readonly dataCallbacks: Array<{ identity: TerminalSessionIdentity; callback: (data: string) => void }>
  readonly exitCallbacks: Array<{ identity: TerminalSessionIdentity; callback: (event: TerminalExitEvent) => void }>
  readonly resizeCalls: Array<{ identity: TerminalSessionIdentity; cols: number; rows: number }>
  readonly writeCalls: Array<{ identity: TerminalSessionIdentity; data: string }>
  readonly destroyCalls: TerminalSessionIdentity[]
  readonly detachCalls: TerminalSessionIdentity[]
  readonly acknowledgeCalls: TerminalSessionIdentity[]
}

interface RuntimeHarness {
  readonly target: TerminalSessionTarget
  readonly identity: TerminalSessionIdentity
  readonly events: string[]
  readonly terminals: FakeTerminal[]
  readonly fitAddons: FakeFitAddon[]
  readonly schedulers: FakeFitScheduler[]
  readonly observers: FakeResizeObserver[]
  readonly hosts: FakeElement[]
  readonly parkingRoot: FakeElement
  readonly bridge: BridgeHarness
  readonly options: TerminalRuntimeCreateOptions
  readonly createResult: TerminalCreateResult
  attachResult: TerminalCreateResult
  readonly terminalWrites: string[]
  readonly terminalCreations: Array<{ cols: number; rows: number }>
  readonly completeReplay: () => void
  readonly flushFit: () => TerminalFitResult | null
  readonly notifyResize: () => void
  readonly resolveFonts: () => void
  readonly host: () => HTMLElement
}

function makeIdentity(target: TerminalSessionTarget, generation = 1): TerminalSessionIdentity {
  return { ...target, generation }
}

function makeResult(
  target: TerminalSessionTarget,
  overrides: Partial<TerminalCreateResult> = {},
): TerminalCreateResult {
  return {
    cols: 80,
    rows: 24,
    buffer: '',
    identity: makeIdentity(target),
    ...overrides,
  }
}

function viewOptions(overrides: Partial<TerminalRuntimeViewOptions> = {}): TerminalRuntimeViewOptions {
  return {
    visible: false,
    edgeToEdge: false,
    autoFocus: false,
    fontSize: 14,
    themeId: 'yira-default',
    notificationsMuted: false,
    workspaceRootPath: '',
    onFocus: () => {},
    ...overrides,
  }
}

function createRuntimeHarness(overrides: {
  createResult?: Partial<TerminalCreateResult>
  attachResult?: Partial<TerminalCreateResult>
  createElementError?: Error
  createTerminalError?: Error
  openError?: Error
  attachError?: Error
} = {}): RuntimeHarness {
  const target = { workspaceId: 'workspace-a', tileId: 'tile-a' }
  const events: string[] = []
  const createResult = makeResult(target, overrides.createResult)
  const identity = createResult.identity
  let attachResult = makeResult(target, { identity, ...overrides.attachResult })
  const terminals: FakeTerminal[] = []
  const fitAddons: FakeFitAddon[] = []
  const schedulers: FakeFitScheduler[] = []
  const observers: FakeResizeObserver[] = []
  const hosts: FakeElement[] = []
  const parkingRoot = new FakeElement()
  const fontResolvers: Array<() => void> = []
  const dataCallbacks: BridgeHarness['dataCallbacks'] = []
  const exitCallbacks: BridgeHarness['exitCallbacks'] = []
  const resizeCalls: BridgeHarness['resizeCalls'] = []
  const writeCalls: BridgeHarness['writeCalls'] = []
  const destroyCalls: TerminalSessionIdentity[] = []
  const detachCalls: TerminalSessionIdentity[] = []
  const acknowledgeCalls: TerminalSessionIdentity[] = []

  const bridge: BridgeHarness = {
    create: async (createdTarget, _options) => {
      events.push('bridge:create')
      assert.deepEqual(createdTarget, target)
      return createResult
    },
    attach: async (attachedIdentity) => {
      events.push('bridge:attach')
      assert.deepEqual(attachedIdentity, identity)
      if (overrides.attachError) throw overrides.attachError
      return attachResult
    },
    write: async (writeIdentity, data) => {
      writeCalls.push({ identity: writeIdentity, data })
    },
    resize: async (resizeIdentity, cols, rows) => {
      resizeCalls.push({ identity: resizeIdentity, cols, rows })
    },
    destroy: async (destroyIdentity) => {
      destroyCalls.push(destroyIdentity)
    },
    detach: async (detachIdentity) => {
      detachCalls.push(detachIdentity)
    },
    acknowledgeAgentAlert: async (acknowledgeIdentity) => {
      acknowledgeCalls.push(acknowledgeIdentity)
    },
    onData: (listenerIdentity, callback) => {
      events.push('bridge:onData')
      const entry = { identity: listenerIdentity, callback }
      dataCallbacks.push(entry)
      return () => {
        const index = dataCallbacks.indexOf(entry)
        if (index >= 0) dataCallbacks.splice(index, 1)
      }
    },
    onExit: (listenerIdentity, callback) => {
      events.push('bridge:onExit')
      const entry = { identity: listenerIdentity, callback }
      exitCallbacks.push(entry)
      return () => {
        const index = exitCallbacks.indexOf(entry)
        if (index >= 0) exitCallbacks.splice(index, 1)
      }
    },
    onAgentAlert: (_tileId, _callback) => {
      events.push('bridge:onAgentAlert')
      return () => {}
    },
    emitData: (data) => {
      for (const entry of [...dataCallbacks]) entry.callback(data)
    },
    emitExit: (event) => {
      for (const entry of [...exitCallbacks]) entry.callback(event)
    },
    dataCallbacks,
    exitCallbacks,
    resizeCalls,
    writeCalls,
    destroyCalls,
    detachCalls,
    acknowledgeCalls,
  }

  const terminalCreations: Array<{ cols: number; rows: number }> = []
  const createElement = (): HTMLDivElement => {
    if (overrides.createElementError) throw overrides.createElementError
    return new FakeElement() as unknown as HTMLDivElement
  }
  const createTerminal = ({ cols, rows }: { cols: number; rows: number }): TerminalLike => {
    events.push(`terminal:create:${cols}x${rows}`)
    terminalCreations.push({ cols, rows })
    if (overrides.createTerminalError) throw overrides.createTerminalError
    const terminal = new FakeTerminal({ events }, overrides.openError, { cols, rows })
    terminals.push(terminal)
    for (const addon of fitAddons) addon.attachedTerminal = terminal
    return terminal
  }
  const createFitAddon = (): FitAddonLike => {
    const addon = new FakeFitAddon()
    addon.attachedTerminal = terminals[terminals.length - 1] ?? null
    fitAddons.push(addon)
    return addon
  }
  const createResizeObserver = (callback: () => void): ResizeObserverLike => {
    const observer = new FakeResizeObserver(callback)
    observers.push(observer)
    return observer
  }
  const dependencies: TerminalRuntimeDependencies = {
    bridge: bridge as unknown as Window['electron']['terminal'],
    createElement,
    createTerminal,
    createFitAddon,
    createResizeObserver,
    getParkingRoot: () => parkingRoot as unknown as HTMLElement,
    whenFontsReady: () => new Promise<void>((resolve) => fontResolvers.push(resolve)),
    onActivity: (activityTarget) => events.push(`activity:${activityTarget.workspaceId}:${activityTarget.tileId}`),
    onClearActivity: (clearTarget) => events.push(`clear:${clearTarget.workspaceId}:${clearTarget.tileId}`),
    onTitle: (titleTarget, title) => events.push(`title:${titleTarget.tileId}:${title}`),
    reportError: (errorTarget, operation) => events.push(`error:${errorTarget.tileId}:${operation}`),
    createFitScheduler: () => {
      const scheduler = new FakeFitScheduler()
      schedulers.push(scheduler)
      return scheduler
    },
  }

  const options: TerminalRuntimeCreateOptions = {
    target,
    createOptions: { shellProfileId: 'bash' },
    dependencies,
    viewOptions: viewOptions(),
  }

  const harness: RuntimeHarness = {
    target,
    identity,
    events,
    terminals,
    fitAddons,
    schedulers,
    observers,
    hosts,
    parkingRoot,
    bridge,
    options,
    createResult,
    get attachResult() {
      return attachResult
    },
    set attachResult(result) {
      attachResult = result
    },
    get terminalWrites() {
      return terminals[0]?.writes ?? []
    },
    terminalCreations,
    completeReplay: () => {
      const terminal = terminals[0]
      if (!terminal) throw new Error('terminal was not created')
      terminal.completeReplay()
    },
    flushFit: () => schedulers[0]?.flush() ?? null,
    notifyResize: () => {
      for (const observer of [...observers]) observer.notify()
    },
    resolveFonts: () => {
      const resolvers = fontResolvers.splice(0)
      for (const resolve of resolvers) resolve()
    },
    host: () => {
      const host = new FakeElement()
      hosts.push(host)
      return host as unknown as HTMLElement
    },
  }
  return harness
}

async function createReadyRuntime(harness: RuntimeHarness): Promise<TerminalRuntime> {
  const runtime = await createTerminalRuntime(harness.options)
  harness.completeReplay()
  return runtime
}

test('creates xterm with PTY dimensions before the initial replay', async () => {
  const harness = createRuntimeHarness({
    createResult: { cols: 132, rows: 41, buffer: 'created-buffer' },
    attachResult: { buffer: 'attached-buffer' },
  })

  const runtime = await createTerminalRuntime(harness.options)

  assert.deepEqual(harness.terminalCreations, [{ cols: 132, rows: 41 }])
  assert.deepEqual(harness.events.slice(0, 7), [
    'bridge:create',
    'terminal:create:132x41',
    'terminal:loadAddon',
    'terminal:open',
    'bridge:onData',
    'bridge:onExit',
    'bridge:onAgentAlert',
  ])
  assert.equal(harness.events[7], 'bridge:attach')
  assert.equal(harness.events.indexOf('terminal:write:attached-buffer') > 7, true)

  harness.completeReplay()
  assert.deepEqual(harness.terminals[0].writes, ['attached-buffer'])
  assert.equal(harness.terminals[0].writes.includes('created-buffer'), false)
  await runtime.dispose(false)
})

test('sanitizes the retained buffer before the initial replay', async () => {
  const harness = createRuntimeHarness({
    attachResult: { buffer: 'before\x1b[6nafter' },
  })

  const runtime = await createTerminalRuntime(harness.options)
  harness.completeReplay()

  assert.deepEqual(harness.terminals[0].writes, ['beforeafter'])
  await runtime.dispose(false)
})

test('exposes selection and paste operations on the persistent xterm instance', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const terminal = harness.terminals[0]
  terminal.selection = 'selected text'

  assert.equal(runtime.hasSelection(), true)
  assert.equal(runtime.getSelection(), 'selected text')
  runtime.selectAll()
  runtime.paste('pasted text')

  runtime.park(harness.parkingRoot as unknown as HTMLElement)
  assert.equal(runtime.hasSelection(), true)
  assert.equal(runtime.getSelection(), 'selected text')
  runtime.selectAll()
  runtime.paste('pasted while parked')

  assert.equal(harness.terminals.length, 1)
  assert.equal(terminal.hasSelectionCalls, 2)
  assert.equal(terminal.getSelectionCalls, 2)
  assert.equal(terminal.selectAllCalls, 2)
  assert.deepEqual(terminal.pastedData, ['pasted text', 'pasted while parked'])

  await runtime.dispose(false)
  assert.equal(runtime.hasSelection(), false)
  assert.equal(runtime.getSelection(), '')
  runtime.selectAll()
  runtime.paste('ignored after dispose')
  assert.equal(terminal.selectAllCalls, 2)
  assert.deepEqual(terminal.pastedData, ['pasted text', 'pasted while parked'])
})

test('detaches without destroying when create returns an identity for another target', async () => {
  const harness = createRuntimeHarness({
    createResult: {
      identity: {
        workspaceId: 'wrong-workspace',
        tileId: 'tile-a',
        generation: 7,
      },
    },
  })

  await assert.rejects(
    createTerminalRuntime(harness.options),
    /inconsistent session identity/,
  )

  assert.deepEqual(harness.bridge.destroyCalls, [])
  assert.deepEqual(harness.bridge.detachCalls, [harness.createResult.identity])
  assert.equal(harness.terminals.length, 0)
})

test('detaches the durable session when xterm allocation fails', async () => {
  const allocationError = new Error('xterm allocation failed')
  const harness = createRuntimeHarness({ createTerminalError: allocationError })

  await assert.rejects(
    createTerminalRuntime(harness.options),
    allocationError,
  )

  assert.deepEqual(harness.bridge.destroyCalls, [])
  assert.deepEqual(harness.bridge.detachCalls, [harness.identity])
  assert.equal(harness.terminals.length, 0)
})

test('disposes xterm and detaches when xterm open fails', async () => {
  const openError = new Error('xterm open failed')
  const harness = createRuntimeHarness({ openError })

  await assert.rejects(
    createTerminalRuntime(harness.options),
    openError,
  )

  assert.deepEqual(harness.bridge.destroyCalls, [])
  assert.deepEqual(harness.bridge.detachCalls, [harness.identity])
  assert.equal(harness.terminals[0].disposeCalls, 1)
  assert.equal(harness.bridge.dataCallbacks.length, 0)
  assert.equal(harness.bridge.exitCallbacks.length, 0)
})

test('disposes listeners and detaches when renderer attach fails', async () => {
  const attachError = new Error('renderer attach failed')
  const harness = createRuntimeHarness({ attachError })

  await assert.rejects(
    createTerminalRuntime(harness.options),
    attachError,
  )

  assert.deepEqual(harness.bridge.destroyCalls, [])
  assert.deepEqual(harness.bridge.detachCalls, [harness.identity])
  assert.equal(harness.terminals[0].disposeCalls, 1)
  assert.equal(harness.bridge.dataCallbacks.length, 0)
  assert.equal(harness.bridge.exitCallbacks.length, 0)
  assert.equal(harness.terminals[0].inputCallbacks.length, 0)
  assert.equal(harness.terminals[0].titleCallbacks.length, 0)
})

test('detaches without destroying when attach returns an inconsistent identity', async () => {
  const harness = createRuntimeHarness({
    attachResult: {
      identity: {
        workspaceId: 'wrong-workspace',
        tileId: 'tile-a',
        generation: 7,
      },
    },
  })

  await assert.rejects(
    createTerminalRuntime(harness.options),
    /inconsistent session identity/,
  )

  assert.deepEqual(harness.bridge.destroyCalls, [])
  assert.deepEqual(harness.bridge.detachCalls, [harness.identity])
  assert.equal(harness.terminals[0].disposeCalls, 1)
  assert.equal(harness.bridge.dataCallbacks.length, 0)
  assert.equal(harness.bridge.exitCallbacks.length, 0)
})

test('keeps one xterm instance and one replay while parked output continues', async () => {
  const harness = createRuntimeHarness({
    attachResult: { buffer: 'initial' },
  })
  const runtime = await createReadyRuntime(harness)
  const firstHost = harness.host()
  const secondHost = harness.host()

  runtime.attachHost(firstHost, viewOptions({ visible: true }))
  harness.flushFit()
  runtime.park(harness.parkingRoot as unknown as HTMLElement)
  harness.bridge.emitData('background')
  runtime.attachHost(secondHost, viewOptions({ visible: true }))

  assert.equal(harness.terminals.length, 1)
  assert.deepEqual(harness.terminals[0].writes, ['initial', 'background'])
  assert.equal(harness.terminals[0].pendingReplayCallbacks.length, 0)
  assert.equal(harness.parkingRoot.children.length, 0)
  assert.equal((secondHost as unknown as FakeElement).children[0], harness.terminals[0].openedIn)
  await runtime.dispose(false)
})

test('does not fit or resize while the runtime is hidden', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const hiddenHost = harness.host()

  runtime.attachHost(hiddenHost, viewOptions({ visible: false }))
  harness.flushFit()
  runtime.park(harness.parkingRoot as unknown as HTMLElement)
  harness.bridge.emitData('hidden-output')

  assert.equal(harness.fitAddons[0].fitCalls, 0)
  assert.deepEqual(harness.bridge.resizeCalls, [])
  assert.deepEqual(harness.terminals[0].writes, ['', 'hidden-output'])
  await runtime.dispose(false)
})

async function settleFit(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

test('fits a measurable host and refreshes every terminal row', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const host = harness.host()

  runtime.attachHost(host, viewOptions({ visible: true }))
  assert.equal(harness.schedulers[0].requests.length, 1)
  harness.flushFit()
  await settleFit()

  assert.equal(harness.fitAddons[0].fitCalls, 1)
  assert.deepEqual(harness.bridge.resizeCalls.map(({ cols, rows }) => ({ cols, rows })), [{ cols: 100, rows: 30 }])
  assert.deepEqual(harness.terminals[0].refreshCalls, [{ start: 0, end: 29 }])
  await runtime.dispose(false)
})

test('keeps an unmeasurable fit dirty and retries after ResizeObserver', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const host = harness.host()
  harness.fitAddons[0].dimensions = undefined

  runtime.attachHost(host, viewOptions({ visible: true }))
  assert.equal(harness.flushFit(), 'unmeasurable')
  assert.deepEqual(harness.bridge.resizeCalls, [])

  harness.fitAddons[0].dimensions = { cols: 110, rows: 33 }
  harness.notifyResize()
  assert.equal(harness.schedulers[0].requests.length, 1)
  harness.flushFit()
  await settleFit()

  assert.deepEqual(harness.bridge.resizeCalls.map(({ cols, rows }) => ({ cols, rows })), [{ cols: 110, rows: 33 }])
  assert.deepEqual(harness.terminals[0].refreshCalls.at(-1), { start: 0, end: 32 })
  await runtime.dispose(false)
})

test('does not send PTY resize when fitted dimensions do not change', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const firstHost = harness.host()
  const secondHost = harness.host()

  runtime.attachHost(firstHost, viewOptions({ visible: true }))
  harness.flushFit()
  await settleFit()
  runtime.attachHost(secondHost, viewOptions({ visible: true }))
  harness.flushFit()
  await settleFit()

  assert.equal(harness.fitAddons[0].fitCalls, 2)
  assert.equal(harness.fitAddons[0].fitMutations, 1)
  assert.equal(harness.bridge.resizeCalls.length, 1)
  assert.equal(harness.terminals[0].refreshCalls.length, 1)
  await runtime.dispose(false)
})

test('ignores callbacks from a disposed identity', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const staleDataCallback = harness.bridge.dataCallbacks[0].callback
  const staleExitCallback = harness.bridge.exitCallbacks[0].callback
  const staleInputCallback = harness.terminals[0].inputCallbacks[0]

  await runtime.dispose(false)
  staleDataCallback('stale-output')
  staleExitCallback({ exitCode: 130 })
  staleInputCallback('stale-input')

  assert.deepEqual(harness.terminals[0].writes, [''])
  assert.deepEqual(harness.bridge.writeCalls, [])
  assert.equal(runtime.getSnapshot().exitEvent, null)
})

test('preserves remote exit state while parked and after host reattachment', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const exitEvent = { exitCode: 255, signal: 1 }

  harness.bridge.emitExit(exitEvent)
  assert.deepEqual(runtime.getSnapshot().exitEvent, exitEvent)
  runtime.park(harness.parkingRoot as unknown as HTMLElement)
  const snapshotWhileParked = runtime.getSnapshot()
  runtime.attachHost(harness.host(), viewOptions({ visible: true }))

  assert.deepEqual(snapshotWhileParked.exitEvent, exitEvent)
  assert.deepEqual(runtime.getSnapshot().exitEvent, exitEvent)
  await runtime.dispose(false)
})

test('does not resize or write after the PTY exit event', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  runtime.attachHost(harness.host(), viewOptions({ visible: true }))

  harness.bridge.emitExit({ exitCode: 130, signal: 2 })
  harness.flushFit()
  harness.terminals[0].emitInput('input after exit')
  await Promise.resolve()
  await settleFit()

  assert.deepEqual(harness.bridge.resizeCalls, [])
  assert.deepEqual(harness.bridge.writeCalls, [])
  assert.deepEqual(harness.terminals[0].refreshCalls, [{ start: 0, end: 29 }])
  assert.deepEqual(runtime.getSnapshot().exitEvent, { exitCode: 130, signal: 2 })
  await runtime.dispose(false)
})

test('dispose(true) destroys the current PTY and dispose(false) only detaches it', async () => {
  const destroyHarness = createRuntimeHarness()
  const destroyRuntime = await createReadyRuntime(destroyHarness)
  await destroyRuntime.dispose(true)

  assert.deepEqual(destroyHarness.bridge.destroyCalls, [destroyHarness.identity])
  assert.deepEqual(destroyHarness.bridge.detachCalls, [])
  assert.equal(destroyHarness.terminals[0].disposeCalls, 1)
  assert.equal(destroyHarness.bridge.dataCallbacks.length, 0)
  assert.equal(destroyHarness.bridge.exitCallbacks.length, 0)

  const detachHarness = createRuntimeHarness()
  const detachRuntime = await createReadyRuntime(detachHarness)
  await detachRuntime.dispose(false)

  assert.deepEqual(detachHarness.bridge.destroyCalls, [])
  assert.deepEqual(detachHarness.bridge.detachCalls, [detachHarness.identity])
  assert.equal(detachHarness.terminals[0].disposeCalls, 1)
})

test('reuses one terminal instance for alternate-screen and synchronized-output fixtures', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const alternateScreen = '\x1b[?1049halternate\x1b[?1049l'
  const synchronizedOutput = '\x1b[?2026hframe\x1b[?2026l'

  runtime.park(harness.parkingRoot as unknown as HTMLElement)
  harness.bridge.emitData(alternateScreen)
  harness.bridge.emitData(synchronizedOutput)
  runtime.attachHost(harness.host(), viewOptions({ visible: true }))

  assert.equal(harness.terminals.length, 1)
  assert.equal(harness.terminals[0].writes.filter((data) => data === alternateScreen).length, 1)
  assert.equal(harness.terminals[0].writes.filter((data) => data === synchronizedOutput).length, 1)
  await runtime.dispose(false)
})

test('uses the latest mutable focus callback and acknowledges the current identity', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  let firstFocusCalls = 0
  let secondFocusCalls = 0
  const host = harness.host()

  runtime.attachHost(host, viewOptions({ visible: true, onFocus: () => { firstFocusCalls += 1 } }))
  runtime.attachHost(host, viewOptions({ visible: true, onFocus: () => { secondFocusCalls += 1 } }))
  runtime.focus()

  assert.equal(firstFocusCalls, 0)
  assert.equal(secondFocusCalls, 1)
  assert.deepEqual(harness.bridge.acknowledgeCalls, [harness.identity])
  await runtime.dispose(false)
})

test('non-geometric updateView keeps DOM, observer, fit and theme untouched', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const host = harness.host()
  const fakeHost = host as unknown as FakeElement
  let replaceCalls = 0
  const originalReplace = fakeHost.replaceChildren.bind(fakeHost)
  fakeHost.replaceChildren = (...children: FakeElement[]): void => {
    replaceCalls += 1
    originalReplace(...children)
  }

  runtime.attachHost(host, viewOptions({ visible: true }))
  harness.flushFit()
  await settleFit()
  harness.resolveFonts()
  await Promise.resolve()
  await settleFit()

  const terminal = harness.terminals[0]
  const themeBefore = terminal.options.theme
  const observersBefore = harness.observers.length
  const fitCallsBefore = harness.fitAddons[0].fitCalls
  const refreshBefore = terminal.refreshCalls.length
  const resizeBefore = harness.bridge.resizeCalls.length
  replaceCalls = 0

  runtime.updateView(viewOptions({
    visible: true,
    onFocus: () => {},
    onOpenBrowserTile: () => {},
    notificationsMuted: true,
    workspaceRootPath: '/new-root',
  }))
  harness.resolveFonts()
  await Promise.resolve()
  await settleFit()

  assert.equal(replaceCalls, 0)
  assert.equal(harness.observers.length, observersBefore)
  assert.equal(harness.schedulers[0].requests.length, 0)
  assert.equal(harness.fitAddons[0].fitCalls, fitCallsBefore)
  assert.equal(terminal.refreshCalls.length, refreshBefore)
  assert.deepEqual(harness.bridge.resizeCalls.length, resizeBefore)
  assert.equal(terminal.options.theme, themeBefore)

  harness.bridge.emitData('muted-output')
  assert.equal(harness.events.includes('activity:workspace-a:tile-a'), false)
  await runtime.dispose(false)
})

test('non-geometric update during pending fit preserves the scheduled work', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const host = harness.host()
  const fakeHost = host as unknown as FakeElement
  let replaceCalls = 0
  const originalReplace = fakeHost.replaceChildren.bind(fakeHost)
  fakeHost.replaceChildren = (...children: FakeElement[]): void => {
    replaceCalls += 1
    originalReplace(...children)
  }

  runtime.attachHost(host, viewOptions({ visible: true }))
  assert.equal(harness.schedulers[0].requests.length, 1)
  const observersBefore = harness.observers.length
  replaceCalls = 0

  runtime.updateView(viewOptions({ visible: true, notificationsMuted: true }))
  assert.equal(harness.schedulers[0].requests.length, 1)
  assert.equal(harness.observers.length, observersBefore)
  assert.equal(replaceCalls, 0)

  harness.flushFit()
  await settleFit()
  assert.equal(harness.fitAddons[0].fitCalls, 1)
  assert.deepEqual(harness.bridge.resizeCalls.length, 1)
  await runtime.dispose(false)
})

test('hide cancels pending fit and show refreshes same size without PTY resize', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const host = harness.host()
  const fakeHost = host as unknown as FakeElement
  let replaceCalls = 0
  const originalReplace = fakeHost.replaceChildren.bind(fakeHost)
  fakeHost.replaceChildren = (...children: FakeElement[]): void => {
    replaceCalls += 1
    originalReplace(...children)
  }

  runtime.attachHost(host, viewOptions({ visible: true }))
  assert.equal(harness.schedulers[0].requests.length, 1)
  harness.notifyResize()
  assert.equal(harness.schedulers[0].requests.length, 1)
  replaceCalls = 0

  runtime.updateView(viewOptions({ visible: false }))
  assert.equal(harness.schedulers[0].requests.length, 0)
  assert.equal(harness.observers[0].disconnected, true)
  assert.equal(replaceCalls, 0)
  assert.equal(harness.fitAddons[0].fitCalls, 0)
  const refreshBeforeShow = harness.terminals[0].refreshCalls.length

  runtime.updateView(viewOptions({ visible: true }))
  assert.equal(harness.schedulers[0].requests.length, 1)
  assert.equal(replaceCalls, 0)
  harness.flushFit()
  await settleFit()
  assert.deepEqual(harness.bridge.resizeCalls.length, 1)
  assert.equal(harness.terminals[0].refreshCalls.length, refreshBeforeShow + 1)
  await runtime.dispose(false)
})

test('geometric fontSize and edgeToEdge changes request fit', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const host = harness.host()

  runtime.attachHost(host, viewOptions({ visible: true, fontSize: 14, edgeToEdge: false }))
  harness.flushFit()
  await settleFit()
  const resizeBefore = harness.bridge.resizeCalls.length
  const refreshBefore = harness.terminals[0].refreshCalls.length

  harness.fitAddons[0].dimensions = { cols: 120, rows: 40 }
  runtime.updateView(viewOptions({ visible: true, fontSize: 16, edgeToEdge: false }))
  assert.equal(harness.terminals[0].options.fontSize, 16)
  assert.equal(harness.schedulers[0].requests.length, 1)
  harness.flushFit()
  await settleFit()
  assert.equal(harness.bridge.resizeCalls.length, resizeBefore + 1)
  assert.equal(harness.terminals[0].refreshCalls.length, refreshBefore + 1)

  harness.fitAddons[0].dimensions = { cols: 130, rows: 42 }
  const refreshMid = harness.terminals[0].refreshCalls.length
  runtime.updateView(viewOptions({ visible: true, fontSize: 16, edgeToEdge: true }))
  assert.equal(harness.schedulers[0].requests.length, 1)
  harness.flushFit()
  await settleFit()
  assert.equal(harness.bridge.resizeCalls.length, resizeBefore + 2)
  assert.equal(harness.terminals[0].refreshCalls.length, refreshMid + 1)
  await runtime.dispose(false)
})

test('spurious observer with unchanged dimensions does not repaint', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const host = harness.host()

  runtime.attachHost(host, viewOptions({ visible: true }))
  harness.flushFit()
  await settleFit()
  const refreshBefore = harness.terminals[0].refreshCalls.length
  const resizeBefore = harness.bridge.resizeCalls.length

  harness.notifyResize()
  assert.equal(harness.schedulers[0].requests.length, 1)
  harness.flushFit()
  await settleFit()
  assert.deepEqual(harness.bridge.resizeCalls.length, resizeBefore)
  assert.equal(harness.terminals[0].refreshCalls.length, refreshBefore)
  await runtime.dispose(false)
})

test('theme change applies without fit and stays stable on repeat', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const host = harness.host()

  runtime.attachHost(host, viewOptions({ visible: true, themeId: 'yira-default' }))
  harness.flushFit()
  await settleFit()
  const fitBefore = harness.fitAddons[0].fitCalls
  const refreshBefore = harness.terminals[0].refreshCalls.length
  const themeBefore = harness.terminals[0].options.theme

  runtime.updateView(viewOptions({ visible: true, themeId: 'classic-dark' }))
  assert.notEqual(harness.terminals[0].options.theme, themeBefore)
  assert.equal(harness.schedulers[0].requests.length, 0)
  assert.equal(harness.fitAddons[0].fitCalls, fitBefore)
  assert.equal(harness.terminals[0].refreshCalls.length, refreshBefore + 1)

  const appliedTheme = harness.terminals[0].options.theme
  const refreshAfterChange = harness.terminals[0].refreshCalls.length
  runtime.updateView(viewOptions({ visible: true, themeId: 'classic-dark' }))
  assert.equal(harness.terminals[0].options.theme, appliedTheme)
  assert.equal(harness.schedulers[0].requests.length, 0)
  assert.equal(harness.fitAddons[0].fitCalls, fitBefore)
  assert.equal(harness.terminals[0].refreshCalls.length, refreshAfterChange)
  await runtime.dispose(false)
})

test('parked font and theme changes apply without double replay', async () => {
  const harness = createRuntimeHarness({ attachResult: { buffer: 'initial' } })
  const runtime = await createReadyRuntime(harness)
  const firstHost = harness.host()

  runtime.attachHost(firstHost, viewOptions({ visible: true, fontSize: 14, themeId: 'yira-default' }))
  harness.flushFit()
  await settleFit()
  const themeAfterFirstAttach = harness.terminals[0].options.theme

  runtime.attachHost(null, viewOptions({ visible: true, fontSize: 16, themeId: 'classic-dark' }))
  assert.equal(harness.terminals[0].options.fontSize, 16)
  assert.notEqual(harness.terminals[0].options.theme, themeAfterFirstAttach)

  harness.bridge.emitData('background')
  const secondHost = harness.host()
  const appliedTheme = harness.terminals[0].options.theme
  runtime.attachHost(secondHost, viewOptions({ visible: true, fontSize: 16, themeId: 'classic-dark' }))
  assert.equal(harness.terminals[0].options.fontSize, 16)
  assert.equal(harness.terminals[0].options.theme, appliedTheme)
  harness.flushFit()
  await settleFit()

  assert.equal(harness.terminals.length, 1)
  assert.deepEqual(harness.terminals[0].writes, ['initial', 'background'])
  await runtime.dispose(false)
})

test('real scheduler integrates non-geometric update, hide cancel and same-size reattach', async () => {
  const harness = createRuntimeHarness()
  const pendingFrames = new Map<number, () => void>()
  let nextFrameHandle = 1
  const realScheduler = createTerminalFitScheduler({
    requestFrame: (callback: () => void): number => {
      const handle = nextFrameHandle
      nextFrameHandle += 1
      pendingFrames.set(handle, callback)
      return handle
    },
    cancelFrame: (handle: number): void => {
      pendingFrames.delete(handle)
    },
  })
  harness.options.dependencies.createFitScheduler = (): TerminalFitSchedulerLike => realScheduler
  // Link realistic fit addon to terminal for post-fit terminal-size reads.
  const linkRealAddon = (): void => {
    const terminal = harness.terminals[0] as unknown as { cols: number; rows: number } | undefined
    const addon = harness.fitAddons[0] as unknown as { attachedTerminal: unknown } | undefined
    if (terminal && addon) addon.attachedTerminal = terminal
  }
  const runtime = await createTerminalRuntime(harness.options)
  harness.completeReplay()
  linkRealAddon()

  const runNextFrame = (): boolean => {
    const first = pendingFrames.keys().next()
    if (first.done) return false
    const handle: number = first.value
    const callback = pendingFrames.get(handle)
    pendingFrames.delete(handle)
    callback?.()
    return true
  }
  const drainFrames = (): void => {
    while (runNextFrame()) {}
  }

  const host = harness.host()
  runtime.attachHost(host, viewOptions({ visible: true }))
  assert.equal(pendingFrames.size, 1)
  const observersBefore = harness.observers.length

  runtime.updateView(viewOptions({ visible: true, notificationsMuted: true }))
  assert.equal(pendingFrames.size, 1)
  assert.equal(harness.observers.length, observersBefore)

  drainFrames()
  harness.resolveFonts()
  await Promise.resolve()
  await Promise.resolve()
  drainFrames()
  await settleFit()
  // Realistic fit mutates the fake terminal to the proposed size.
  const realTerminal = harness.terminals[0] as unknown as { cols: number; rows: number }
  realTerminal.cols = 100
  realTerminal.rows = 30
  assert.equal(harness.bridge.resizeCalls.length, 1)
  assert.equal(harness.terminals[0].refreshCalls.length, 1)

  harness.notifyResize()
  assert.equal(pendingFrames.size, 1)
  runtime.updateView(viewOptions({ visible: false }))
  assert.equal(pendingFrames.size, 0)
  drainFrames()
  await settleFit()
  assert.equal(harness.bridge.resizeCalls.length, 1)

  harness.fitAddons[0].dimensions = { cols: 100, rows: 30 }
  const refreshBeforeShow = harness.terminals[0].refreshCalls.length
  runtime.updateView(viewOptions({ visible: true }))
  drainFrames()
  harness.resolveFonts()
  await Promise.resolve()
  await Promise.resolve()
  drainFrames()
  await settleFit()
  assert.equal(harness.bridge.resizeCalls.length, 1)
  assert.equal(harness.terminals[0].refreshCalls.length, refreshBeforeShow)
  await runtime.dispose(false)
})

test('park and reattach keep single replay without resize nor repaint on same size', async () => {
  const harness = createRuntimeHarness({ attachResult: { buffer: 'initial' } })
  const runtime = await createReadyRuntime(harness)
  const firstHost = harness.host()

  runtime.attachHost(firstHost, viewOptions({ visible: true }))
  harness.flushFit()
  await settleFit()
  const resizeBefore = harness.bridge.resizeCalls.length
  const refreshBefore = harness.terminals[0].refreshCalls.length

  runtime.park(harness.parkingRoot as unknown as HTMLElement)
  harness.bridge.emitData('background')
  const secondHost = harness.host()
  runtime.attachHost(secondHost, viewOptions({ visible: true }))
  harness.flushFit()
  await settleFit()

  assert.equal(harness.terminals.length, 1)
  assert.deepEqual(harness.terminals[0].writes, ['initial', 'background'])
  assert.deepEqual(harness.bridge.resizeCalls.length, resizeBefore)
  assert.equal(harness.terminals[0].refreshCalls.length, refreshBefore)
  await runtime.dispose(false)
})

test('defers autoFocus of a new host until after fit and refresh', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const terminal = harness.terminals[0]
  const firstHost = harness.host()

  runtime.attachHost(firstHost, viewOptions({ visible: true, autoFocus: true }))
  assert.equal(terminal.focusCalls, 0)
  assert.equal(terminal.refreshCalls.length, 0)
  assert.equal(harness.schedulers[0].requests.length, 1)

  harness.flushFit()
  await settleFit()

  assert.deepEqual(harness.bridge.resizeCalls.length, 1)
  assert.equal(terminal.refreshCalls.length, 1)
  assert.equal(terminal.focusCalls, 1)
  const firstRefreshIndex = harness.events.indexOf('terminal:refresh:0-29')
  const firstFocusIndex = harness.events.indexOf('terminal:focus')
  assert.equal(firstRefreshIndex !== -1 && firstFocusIndex !== -1 && firstRefreshIndex < firstFocusIndex, true)

  const secondHost = harness.host()
  runtime.attachHost(secondHost, viewOptions({ visible: true, autoFocus: true }))
  assert.equal(terminal.focusCalls, 1)
  assert.equal(harness.schedulers[0].requests.length, 1)

  harness.flushFit()
  await settleFit()

  assert.deepEqual(harness.bridge.resizeCalls.length, 1)
  assert.equal(terminal.refreshCalls.length, 1)
  assert.equal(terminal.focusCalls, 2)
  const refreshEvents = harness.events.filter((event) => event.startsWith('terminal:refresh:'))
  const focusEvents = harness.events.filter((event) => event === 'terminal:focus')
  assert.equal(refreshEvents.length, 1)
  assert.equal(focusEvents.length, 2)
  assert.equal(harness.events.lastIndexOf('terminal:refresh:0-29') < harness.events.lastIndexOf('terminal:focus'), true)

  harness.notifyResize()
  assert.equal(harness.schedulers[0].requests.length, 1)
  harness.flushFit()
  await settleFit()

  assert.deepEqual(harness.bridge.resizeCalls.length, 1)
  assert.equal(terminal.refreshCalls.length, 1)
  assert.equal(terminal.focusCalls, 2)
  await runtime.dispose(false)
})

test('keeps attach focus pending on unmeasurable without early focus', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const terminal = harness.terminals[0]
  harness.fitAddons[0].dimensions = undefined

  runtime.attachHost(harness.host(), viewOptions({ visible: true, autoFocus: true }))
  assert.equal(terminal.focusCalls, 0)
  assert.equal(harness.flushFit(), 'unmeasurable')

  assert.deepEqual(harness.bridge.resizeCalls, [])
  assert.equal(terminal.refreshCalls.length, 0)
  assert.equal(terminal.focusCalls, 0)

  harness.fitAddons[0].dimensions = { cols: 110, rows: 33 }
  harness.notifyResize()
  assert.equal(harness.schedulers[0].requests.length, 1)
  assert.equal(harness.flushFit(), 'fitted')
  await settleFit()

  assert.deepEqual(harness.bridge.resizeCalls.map(({ cols, rows }) => ({ cols, rows })), [{ cols: 110, rows: 33 }])
  assert.equal(terminal.refreshCalls.length, 1)
  assert.equal(terminal.focusCalls, 1)
  await runtime.dispose(false)
})

test('defers focus on same-host reshow without repaint on same size and only once', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const terminal = harness.terminals[0]
  const host = harness.host()

  runtime.attachHost(host, viewOptions({ visible: true, autoFocus: true }))
  harness.flushFit()
  await settleFit()
  assert.equal(terminal.focusCalls, 1)
  const refreshAfterAttach = terminal.refreshCalls.length

  runtime.updateView(viewOptions({ visible: false }))
  assert.equal(terminal.focusCalls, 1)
  assert.equal(harness.schedulers[0].requests.length, 0)

  runtime.updateView(viewOptions({ visible: true, autoFocus: true }))
  assert.equal(terminal.focusCalls, 1)
  assert.equal(harness.schedulers[0].requests.length, 1)

  harness.flushFit()
  await settleFit()

  assert.equal(terminal.refreshCalls.length, refreshAfterAttach)
  assert.equal(terminal.focusCalls, 2)
  assert.equal(harness.events.lastIndexOf('terminal:refresh:0-29') < harness.events.lastIndexOf('terminal:focus'), true)

  harness.notifyResize()
  assert.equal(harness.schedulers[0].requests.length, 1)
  harness.flushFit()
  await settleFit()

  assert.equal(terminal.focusCalls, 2)
  await runtime.dispose(false)
})

test('defers focus on geometric fontSize change until after refresh and only once', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const terminal = harness.terminals[0]
  const host = harness.host()

  runtime.attachHost(host, viewOptions({ visible: true, autoFocus: true, fontSize: 14 }))
  harness.flushFit()
  await settleFit()
  assert.equal(terminal.focusCalls, 1)
  const resizeAfterAttach = harness.bridge.resizeCalls.length
  const refreshAfterAttach = terminal.refreshCalls.length

  harness.fitAddons[0].dimensions = { cols: 120, rows: 40 }
  runtime.updateView(viewOptions({ visible: true, autoFocus: true, fontSize: 16 }))
  assert.equal(terminal.options.fontSize, 16)
  assert.equal(terminal.focusCalls, 1)
  assert.equal(harness.schedulers[0].requests.length, 1)

  harness.flushFit()
  await settleFit()

  assert.equal(harness.bridge.resizeCalls.length, resizeAfterAttach + 1)
  assert.equal(terminal.refreshCalls.length, refreshAfterAttach + 1)
  assert.equal(terminal.focusCalls, 2)
  assert.equal(harness.events.lastIndexOf('terminal:refresh:0-39') < harness.events.lastIndexOf('terminal:focus'), true)

  harness.notifyResize()
  assert.equal(harness.schedulers[0].requests.length, 1)
  harness.flushFit()
  await settleFit()

  assert.equal(terminal.focusCalls, 2)
  await runtime.dispose(false)
})

test('same-geometry reattach does not resize PTY nor repaint all rows', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const terminal = harness.terminals[0]
  const firstHost = harness.host()

  runtime.attachHost(firstHost, viewOptions({ visible: true }))
  harness.flushFit()
  await settleFit()
  assert.equal(harness.bridge.resizeCalls.length, 1)
  assert.deepEqual(terminal.refreshCalls, [{ start: 0, end: 29 }])

  const secondHost = harness.host()
  runtime.attachHost(secondHost, viewOptions({ visible: true }))
  harness.flushFit()
  await settleFit()

  assert.equal(harness.bridge.resizeCalls.length, 1)
  assert.equal(terminal.refreshCalls.length, 1)
  assert.equal(harness.fitAddons[0].fitMutations, 1)
  await runtime.dispose(false)
})

test('same-geometry reshow does not resize PTY nor repaint all rows', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const terminal = harness.terminals[0]
  const host = harness.host()

  runtime.attachHost(host, viewOptions({ visible: true }))
  harness.flushFit()
  await settleFit()
  assert.equal(harness.bridge.resizeCalls.length, 1)
  assert.equal(terminal.refreshCalls.length, 1)

  runtime.updateView(viewOptions({ visible: false }))
  runtime.updateView(viewOptions({ visible: true }))
  harness.flushFit()
  await settleFit()

  assert.equal(harness.bridge.resizeCalls.length, 1)
  assert.equal(terminal.refreshCalls.length, 1)
  await runtime.dispose(false)
})

test('real geometry change resizes PTY once and repaints once', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const terminal = harness.terminals[0]
  const firstHost = harness.host()

  runtime.attachHost(firstHost, viewOptions({ visible: true }))
  harness.flushFit()
  await settleFit()
  assert.equal(harness.bridge.resizeCalls.length, 1)
  assert.equal(terminal.refreshCalls.length, 1)

  harness.fitAddons[0].dimensions = { cols: 120, rows: 40 }
  const secondHost = harness.host()
  runtime.attachHost(secondHost, viewOptions({ visible: true }))
  harness.flushFit()
  await settleFit()

  assert.equal(harness.bridge.resizeCalls.length, 2)
  assert.deepEqual(harness.bridge.resizeCalls[1], { identity: harness.identity, cols: 120, rows: 40 })
  assert.equal(terminal.refreshCalls.length, 2)
  assert.deepEqual(terminal.refreshCalls.at(-1), { start: 0, end: 39 })
  await runtime.dispose(false)
})

test('waits for bridge.resize before refresh and focus', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const terminal = harness.terminals[0]
  let resolveResize!: () => void
  const bridgeMutable = harness.bridge as unknown as { resize: BridgeHarness['resize'] }
  bridgeMutable.resize = (identity, cols, rows) => new Promise<void>((resolve) => {
    resolveResize = () => {
      harness.bridge.resizeCalls.push({ identity, cols, rows })
      resolve()
    }
  })

  const host = harness.host()
  runtime.attachHost(host, viewOptions({ visible: true, autoFocus: true }))
  harness.flushFit()
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(terminal.refreshCalls.length, 0)
  assert.equal(terminal.focusCalls, 0)

  resolveResize()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(terminal.refreshCalls.length, 1)
  assert.equal(terminal.focusCalls, 1)
  await runtime.dispose(false)
})

test('does not refresh or focus old host when hidden during pending resize', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const terminal = harness.terminals[0]
  let resolveResize!: () => void
  const bridgeMutable = harness.bridge as unknown as { resize: BridgeHarness['resize'] }
  bridgeMutable.resize = (identity, cols, rows) => new Promise<void>((resolve) => {
    resolveResize = () => {
      harness.bridge.resizeCalls.push({ identity, cols, rows })
      resolve()
    }
  })

  const host = harness.host()
  runtime.attachHost(host, viewOptions({ visible: true, autoFocus: true }))
  harness.flushFit()
  await Promise.resolve()

  runtime.updateView(viewOptions({ visible: false }))
  resolveResize()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(terminal.refreshCalls.length, 0)
  assert.equal(terminal.focusCalls, 0)
  await runtime.dispose(false)
})

test('does not refresh or focus replaced host when pending resize resolves', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const terminal = harness.terminals[0]
  const resolvers: Array<() => void> = []
  const bridgeMutable = harness.bridge as unknown as { resize: BridgeHarness['resize'] }
  bridgeMutable.resize = (identity, cols, rows) => new Promise<void>((resolve) => {
    resolvers.push(() => {
      harness.bridge.resizeCalls.push({ identity, cols, rows })
      resolve()
    })
  })

  const firstHost = harness.host()
  runtime.attachHost(firstHost, viewOptions({ visible: true, autoFocus: true }))
  harness.flushFit()
  await Promise.resolve()

  const secondHost = harness.host()
  runtime.attachHost(secondHost, viewOptions({ visible: true }))
  assert.equal(harness.schedulers[0].requests.length, 1)

  resolvers[0]()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(terminal.refreshCalls.length, 0)
  assert.equal(terminal.focusCalls, 0)
  await runtime.dispose(false)
})

test('reports bridge.resize failure without blocking runtime', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const terminal = harness.terminals[0]
  const bridgeMutable = harness.bridge as unknown as { resize: BridgeHarness['resize'] }
  bridgeMutable.resize = async () => {
    throw new Error('pty resize failed')
  }

  const host = harness.host()
  runtime.attachHost(host, viewOptions({ visible: true }))
  harness.flushFit()
  await settleFit()
  await settleFit()

  assert.equal(harness.events.includes('error:tile-a:resize'), true)
  assert.equal(terminal.refreshCalls.length, 0)
  assert.equal(terminal.focusCalls, 0)

  bridgeMutable.resize = async (identity, cols, rows) => {
    harness.bridge.resizeCalls.push({ identity, cols, rows })
  }
  harness.fitAddons[0].dimensions = { cols: 120, rows: 40 }
  harness.notifyResize()
  harness.flushFit()
  await settleFit()
  await settleFit()

  assert.equal(harness.bridge.resizeCalls.length, 1)
  assert.equal(terminal.refreshCalls.length, 1)
  await runtime.dispose(false)
})

test('failed resize retries same geometry and resends PTY resize', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const terminal = harness.terminals[0]
  const bridgeMutable = harness.bridge as unknown as { resize: BridgeHarness['resize'] }
  let attempts = 0
  bridgeMutable.resize = async (identity, cols, rows) => {
    attempts += 1
    if (attempts === 1) throw new Error('pty resize failed once')
    harness.bridge.resizeCalls.push({ identity, cols, rows })
  }

  const host = harness.host()
  runtime.attachHost(host, viewOptions({ visible: true, autoFocus: true }))
  harness.flushFit()
  await settleFit()
  await settleFit()

  assert.equal(attempts, 1)
  assert.equal(harness.events.includes('error:tile-a:resize'), true)
  assert.equal(terminal.refreshCalls.length, 0)
  assert.equal(terminal.focusCalls, 0)

  harness.notifyResize()
  assert.equal(harness.schedulers[0].requests.length, 1)
  harness.flushFit()
  await settleFit()
  await settleFit()

  assert.equal(attempts, 2)
  assert.equal(harness.bridge.resizeCalls.length, 1)
  assert.deepEqual(
    harness.bridge.resizeCalls.map(({ cols, rows }) => ({ cols, rows })),
    [{ cols: 100, rows: 30 }],
  )
  assert.equal(terminal.refreshCalls.length, 1)
  assert.equal(terminal.focusCalls, 1)
  await runtime.dispose(false)
})

test('first visible attach same as created repaints once, next same does not', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const terminal = harness.terminals[0]
  harness.fitAddons[0].dimensions = { cols: 80, rows: 24 }
  harness.terminals[0].cols = 80
  harness.terminals[0].rows = 24

  const firstHost = harness.host()
  runtime.attachHost(firstHost, viewOptions({ visible: true }))
  harness.flushFit()
  await settleFit()

  assert.equal(harness.bridge.resizeCalls.length, 0)
  assert.equal(terminal.refreshCalls.length, 1)

  const secondHost = harness.host()
  runtime.attachHost(secondHost, viewOptions({ visible: true }))
  harness.flushFit()
  await settleFit()

  assert.equal(harness.bridge.resizeCalls.length, 0)
  assert.equal(terminal.refreshCalls.length, 1)
  await runtime.dispose(false)
})

test('visual change while parked forces repaint on reattach with same geometry', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const terminal = harness.terminals[0]
  const firstHost = harness.host()

  runtime.attachHost(firstHost, viewOptions({ visible: true, fontSize: 14, themeId: 'yira-default', edgeToEdge: false }))
  harness.flushFit()
  await settleFit()
  assert.equal(terminal.refreshCalls.length, 1)
  const resizeBefore = harness.bridge.resizeCalls.length

  runtime.attachHost(null, viewOptions({ visible: true, fontSize: 16, themeId: 'classic-dark', edgeToEdge: true }))
  assert.equal(terminal.options.fontSize, 16)

  const secondHost = harness.host()
  runtime.attachHost(secondHost, viewOptions({ visible: true, fontSize: 16, themeId: 'classic-dark', edgeToEdge: true }))
  harness.flushFit()
  await settleFit()

  assert.equal(harness.bridge.resizeCalls.length, resizeBefore)
  assert.equal(terminal.refreshCalls.length, 2)
  await runtime.dispose(false)
})

test('new same-geometry host waits for previous resize ack without wrong repaint', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const terminal = harness.terminals[0]
  const bridgeMutable = harness.bridge as unknown as { resize: BridgeHarness['resize'] }
  let resolveFirstResize!: () => void
  let firstResizeCalls = 0
  bridgeMutable.resize = (identity, cols, rows) => new Promise<void>((resolve) => {
    firstResizeCalls += 1
    if (firstResizeCalls === 1) {
      resolveFirstResize = () => {
        harness.bridge.resizeCalls.push({ identity, cols, rows })
        resolve()
      }
      return
    }
    harness.bridge.resizeCalls.push({ identity, cols, rows })
    resolve()
  })

  const firstHost = harness.host()
  runtime.attachHost(firstHost, viewOptions({ visible: true, autoFocus: true }))
  harness.flushFit()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(terminal.refreshCalls.length, 0)
  assert.equal(terminal.focusCalls, 0)

  const secondHost = harness.host()
  runtime.attachHost(secondHost, viewOptions({ visible: true, autoFocus: true }))
  harness.flushFit()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(terminal.focusCalls, 0)
  assert.equal(terminal.refreshCalls.length, 0)

  resolveFirstResize()
  await settleFit()
  await settleFit()

  assert.equal(harness.bridge.resizeCalls.length, 1)
  assert.equal(terminal.refreshCalls.length, 1)
  assert.equal(terminal.focusCalls, 1)
  await runtime.dispose(false)
})

test('geometric resize pending across host replace paints new grid after ack', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const terminal = harness.terminals[0]
  const bridgeMutable = harness.bridge as unknown as { resize: BridgeHarness['resize'] }
  let resolvePendingResize!: () => void
  let resizeAttempts = 0
  bridgeMutable.resize = (identity, cols, rows) => new Promise<void>((resolve) => {
    resizeAttempts += 1
    if (resizeAttempts === 2) {
      resolvePendingResize = () => {
        harness.bridge.resizeCalls.push({ identity, cols, rows })
        resolve()
      }
      return
    }
    harness.bridge.resizeCalls.push({ identity, cols, rows })
    resolve()
  })

  const firstHost = harness.host()
  runtime.attachHost(firstHost, viewOptions({ visible: true }))
  harness.flushFit()
  await settleFit()
  await settleFit()
  assert.equal(harness.bridge.resizeCalls.length, 1)
  assert.equal(terminal.refreshCalls.length, 1)

  harness.fitAddons[0].dimensions = { cols: 120, rows: 40 }
  harness.notifyResize()
  assert.equal(harness.schedulers[0].requests.length, 1)
  harness.flushFit()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(terminal.refreshCalls.length, 1)

  const secondHost = harness.host()
  runtime.attachHost(secondHost, viewOptions({ visible: true }))
  harness.flushFit()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(terminal.refreshCalls.length, 1)

  resolvePendingResize()
  await settleFit()
  await settleFit()

  assert.equal(harness.bridge.resizeCalls.length, 2)
  assert.deepEqual(
    harness.bridge.resizeCalls[1],
    { identity: harness.identity, cols: 120, rows: 40 },
  )
  assert.equal(terminal.refreshCalls.length, 2)
  assert.deepEqual(terminal.refreshCalls.at(-1), { start: 0, end: 39 })
  await runtime.dispose(false)
})

test('successive resizes same host paint once after last ack', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const terminal = harness.terminals[0]
  const bridgeMutable = harness.bridge as unknown as { resize: BridgeHarness['resize'] }
  const resolvers: Array<() => void> = []
  bridgeMutable.resize = (identity, cols, rows) => new Promise<void>((resolve) => {
    resolvers.push(() => {
      harness.bridge.resizeCalls.push({ identity, cols, rows })
      resolve()
    })
  })

  const host = harness.host()
  runtime.attachHost(host, viewOptions({ visible: true, autoFocus: true }))
  harness.flushFit()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(resolvers.length, 1)
  assert.equal(terminal.refreshCalls.length, 0)
  assert.equal(terminal.focusCalls, 0)

  harness.fitAddons[0].dimensions = { cols: 120, rows: 40 }
  harness.notifyResize()
  assert.equal(harness.schedulers[0].requests.length, 1)
  harness.flushFit()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(terminal.refreshCalls.length, 0)
  assert.equal(terminal.focusCalls, 0)

  resolvers[0]()
  await settleFit()
  await settleFit()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(resolvers.length, 2)
  assert.equal(terminal.refreshCalls.length, 0)
  assert.equal(terminal.focusCalls, 0)

  resolvers[1]()
  await settleFit()
  await settleFit()

  assert.equal(harness.bridge.resizeCalls.length, 2)
  assert.deepEqual(
    harness.bridge.resizeCalls.map(({ cols, rows }) => ({ cols, rows })),
    [{ cols: 100, rows: 30 }, { cols: 120, rows: 40 }],
  )
  assert.equal(terminal.refreshCalls.length, 1)
  assert.deepEqual(terminal.refreshCalls.at(-1), { start: 0, end: 39 })
  assert.equal(terminal.focusCalls, 1)
  await runtime.dispose(false)
})
