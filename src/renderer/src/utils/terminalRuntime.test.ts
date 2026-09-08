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
  readonly rows = 24
  openedIn: HTMLElement | null = null
  focusCalls = 0
  disposeCalls = 0
  hasSelectionCalls = 0
  getSelectionCalls = 0
  selectAllCalls = 0
  selection = ''

  constructor(events: FakeTerminalEvents) {
    this.events = events.events
  }

  loadAddon(addon: unknown): void {
    this.loadedAddons.push(addon)
    this.events.push('terminal:loadAddon')
  }

  open(container: HTMLElement): void {
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
  dimensions: TerminalFitDimensions | undefined = { cols: 100, rows: 30 }

  fit(): void {
    this.fitCalls += 1
  }

  proposeDimensions(): TerminalFitDimensions | undefined {
    return this.dimensions
  }
}

interface FitRequest {
  readonly fitAddon: FitAddonLike
  readonly resize: (cols: number, rows: number) => void
  readonly complete?: (result: TerminalFitResult) => void
}

class FakeFitScheduler implements TerminalFitSchedulerLike {
  readonly requests: FitRequest[] = []
  private lastDimensions: TerminalFitDimensions | null = null

  requestFit(
    fitAddon: FitAddonLike,
    resize: (cols: number, rows: number) => void,
    complete?: (result: TerminalFitResult) => void,
  ): void {
    if (this.requests.length > 0) return
    this.requests.push({ fitAddon, resize, complete })
  }

  cancelPending(): void {
    this.requests.length = 0
  }

  flush(): TerminalFitResult | null {
    const request = this.requests.shift()
    if (!request) return null

    request.fitAddon.fit()
    const dimensions = request.fitAddon.proposeDimensions()
    let result: TerminalFitResult = 'unmeasurable'
    if (dimensions && dimensions.cols > 0 && dimensions.rows > 0) {
      const normalized = { cols: Math.floor(dimensions.cols), rows: Math.floor(dimensions.rows) }
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
} = {}): RuntimeHarness {
  const target = { workspaceId: 'workspace-a', tileId: 'tile-a' }
  const events: string[] = []
  const createResult = makeResult(target, overrides.createResult)
  const identity = createResult.identity
  let attachResult = makeResult(target, { ...overrides.attachResult, identity })
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
  const createElement = (): HTMLDivElement => new FakeElement() as unknown as HTMLDivElement
  const createTerminal = ({ cols, rows }: { cols: number; rows: number }): TerminalLike => {
    events.push(`terminal:create:${cols}x${rows}`)
    terminalCreations.push({ cols, rows })
    const terminal = new FakeTerminal({ events })
    terminals.push(terminal)
    return terminal
  }
  const createFitAddon = (): FitAddonLike => {
    const addon = new FakeFitAddon()
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

test('destroys the identity returned by create when it does not match the target', async () => {
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

  assert.deepEqual(harness.bridge.destroyCalls, [harness.createResult.identity])
  assert.equal(harness.terminals.length, 0)
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

test('fits a measurable host and refreshes every terminal row', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const host = harness.host()

  runtime.attachHost(host, viewOptions({ visible: true }))
  assert.equal(harness.schedulers[0].requests.length, 1)
  harness.flushFit()

  assert.equal(harness.fitAddons[0].fitCalls, 1)
  assert.deepEqual(harness.bridge.resizeCalls.map(({ cols, rows }) => ({ cols, rows })), [{ cols: 100, rows: 30 }])
  assert.deepEqual(harness.terminals[0].refreshCalls, [{ start: 0, end: 23 }])
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

  assert.deepEqual(harness.bridge.resizeCalls.map(({ cols, rows }) => ({ cols, rows })), [{ cols: 110, rows: 33 }])
  assert.deepEqual(harness.terminals[0].refreshCalls.at(-1), { start: 0, end: 23 })
  await runtime.dispose(false)
})

test('does not send PTY resize when fitted dimensions do not change', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createReadyRuntime(harness)
  const firstHost = harness.host()
  const secondHost = harness.host()

  runtime.attachHost(firstHost, viewOptions({ visible: true }))
  harness.flushFit()
  runtime.attachHost(secondHost, viewOptions({ visible: true }))
  harness.flushFit()

  assert.equal(harness.fitAddons[0].fitCalls, 2)
  assert.equal(harness.bridge.resizeCalls.length, 1)
  assert.equal(harness.terminals[0].refreshCalls.length, 2)
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
