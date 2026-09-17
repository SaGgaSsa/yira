import { randomBytes, timingSafeEqual } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer, type Server, type Socket } from 'node:net'
import { join } from 'node:path'

import type { SerializeAddon as SerializeAddonType } from '@xterm/addon-serialize'
import type {
  TerminalDaemonAgent,
  TerminalDaemonEndpoint,
  TerminalDaemonEvent,
  TerminalDaemonMethods,
  TerminalDaemonSnapshot,
  TerminalDaemonSpawn,
} from '@shared/terminalDaemonProtocol'
import { TERMINAL_DAEMON_MAX_FRAME_BYTES, TERMINAL_DAEMON_PROTOCOL_VERSION } from '@shared/terminalDaemonProtocol'
import {
  terminalSessionLookupKey,
  type TerminalSessionIdentity,
  type TerminalSessionTarget,
} from '@shared/terminalSessionIdentity'
import type { TerminalExitEvent } from '@shared/types'
import { AgentAlertBridge } from './agentAlertBridge'
import { SemanticAgentAlertState, type AgentAlertState } from './agentAlerts'
import { DeferredTerminalStartupCommand } from './terminalStartupCommand'

const daemonRequire = createRequire(import.meta.url)
const { SerializeAddon } = daemonRequire('@xterm/addon-serialize') as {
  SerializeAddon: new () => SerializeAddonType
}
const { Terminal: HeadlessTerminal } = daemonRequire('@xterm/headless') as {
  Terminal: new (options: Record<string, unknown>) => unknown
}

/**
 * The subset of node-pty used by the daemon.  It is intentionally exported so
 * tests can provide a small controlled PTY without loading the native module.
 */
export interface TerminalDaemonPty {
  readonly pid?: number
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(callback: (data: string) => void): unknown
  onExit(callback: (event: TerminalExitEvent) => void): unknown
  pause?: () => void
  resume?: () => void
}

export interface TerminalDaemonPtyOptions {
  name: string
  cols: number
  rows: number
  cwd: string
  env: Record<string, string>
}

export interface TerminalDaemonPtyFactory {
  spawn(
    executable: string,
    args: string[],
    options: TerminalDaemonPtyOptions,
  ): TerminalDaemonPty
}

interface TerminalDaemonTerminal {
  readonly cols: number
  readonly rows: number
  readonly onData?: (callback: (data: string) => void) => unknown
  readonly onTitleChange?: (callback: (title: string) => void) => unknown
  write(data: string, callback?: () => void): void
  resize(cols: number, rows: number): void
  loadAddon(addon: unknown): void
  dispose(): void
}

export interface TerminalDaemonTerminalFactoryOptions {
  cols: number
  rows: number
  scrollback: number
}

export type TerminalDaemonTerminalFactory =
  | ((options: TerminalDaemonTerminalFactoryOptions) => TerminalDaemonTerminal)
  | ((cols: number, rows: number) => TerminalDaemonTerminal)

export interface StartTerminalDaemonOptions {
  /** Directory that contains endpoint.json. */
  directory: string
  /** Called after the idle period when no clients and no sessions remain. */
  onIdle?: () => void
  /** Controlled PTY factory used by tests. The production entry injects node-pty. */
  ptyFactory?: TerminalDaemonPtyFactory
  /** Optional terminal factory used by tests. The default is @xterm/headless. */
  terminalFactory?: TerminalDaemonTerminalFactory
  /** Idle timeout override. The default is approximately 30 seconds. */
  idleMs?: number
  /** Optional token override for deterministic protocol tests. */
  token?: string
}

export interface TerminalDaemonHandle {
  endpoint: TerminalDaemonEndpoint
  close(): Promise<void>
}

const ENDPOINT_FILE_NAME = 'endpoint.json'
const ENDPOINT_DIRECTORY_MODE = 0o700
const ENDPOINT_FILE_MODE = 0o600
const DEFAULT_IDLE_MS = 30_000
const MAX_ID_LENGTH = 256
const MAX_EXECUTABLE_LENGTH = 4_096
const MAX_ARGUMENT_LENGTH = 64 * 1024
const MAX_ARGUMENTS = 4_096
const MAX_ENV_ENTRIES = 1_024
const MAX_ENV_VALUE_LENGTH = 128 * 1024
const MAX_ENV_BYTES = 2 * 1024 * 1024
const MAX_COMMAND_LENGTH = 2 * 1024 * 1024
const MAX_DIMENSION = 2_000
const MAX_SCROLLBACK_LINES = 5_000
const MAX_PENDING_PARSE_BYTES = 8 * 1024 * 1024
const RESUME_PARSE_BYTES = 2 * 1024 * 1024
const MAX_DATA_EVENT_BYTES = 256 * 1024
const MAX_SNAPSHOT_BYTES = 12 * 1024 * 1024
const MAX_CLIENT_QUEUE_BYTES = 32 * 1024 * 1024
const MAX_PENDING_REQUESTS = 256

const BRIDGE_ENV_KEYS = [
  'YIRA_AGENT_BRIDGE_URL',
  'YIRA_AGENT_BRIDGE_TOKEN',
  'YIRA_AGENT_TILE_ID',
] as const

const METHODS: readonly (keyof TerminalDaemonMethods)[] = [
  'ping',
  'list',
  'attach',
  'create',
  'snapshot',
  'rendererAttach',
  'rendererDetach',
  'write',
  'resize',
  'acknowledge',
  'destroy',
  'destroyCurrent',
  'destroyWorkspace',
]

type DaemonMethod = keyof TerminalDaemonMethods

interface DisposableLike {
  dispose?: () => void
}

interface NormalizedSpawn extends TerminalDaemonSpawn {
  target: TerminalSessionTarget
  args: string[]
  env: Record<string, string>
  cols: number
  rows: number
  executable: string
  cwd: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function hasControlCharacter(value: string): boolean {
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
}

function normalizeIdentifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || hasControlCharacter(value)) throw new Error(`Invalid ${label}`)
  const normalized = value.trim()
  if (!normalized || normalized.length > MAX_ID_LENGTH) throw new Error(`Invalid ${label}`)
  return normalized
}

function normalizeTarget(value: unknown): TerminalSessionTarget {
  if (!isRecord(value)) throw new Error('Invalid terminal target')
  return {
    workspaceId: normalizeIdentifier(value.workspaceId, 'terminal workspace id'),
    tileId: normalizeIdentifier(value.tileId, 'terminal tile id'),
  }
}

function lookupKeyWorkspaceId(key: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(key)
    return Array.isArray(parsed) && typeof parsed[0] === 'string' ? parsed[0] : undefined
  } catch {
    return undefined
  }
}

function normalizeGeneration(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error('Invalid terminal session generation')
  }
  return value as number
}

function normalizeIdentity(value: unknown): TerminalSessionIdentity {
  if (!isRecord(value)) throw new Error('Invalid terminal session identity')
  return {
    ...normalizeTarget(value),
    generation: normalizeGeneration(value.generation),
  }
}

function normalizePositiveDimension(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > MAX_DIMENSION) {
    throw new Error(`Invalid terminal ${label}`)
  }
  return value as number
}

function normalizeString(value: unknown, label: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > maxLength || value.includes('\u0000')) {
    throw new Error(`Invalid ${label}`)
  }
  if (!allowEmpty && !value.trim()) throw new Error(`Invalid ${label}`)
  return value
}

function normalizeTerminalInput(value: unknown): string {
  if (typeof value !== 'string' || byteLength(value) > TERMINAL_DAEMON_MAX_FRAME_BYTES) {
    throw new Error('Invalid terminal input')
  }
  return value
}

function normalizeAgent(value: unknown): TerminalDaemonAgent | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw new Error('Invalid terminal agent metadata')
  const provider = value.provider
  if (provider !== 'codex' && provider !== 'claude') throw new Error('Invalid terminal agent provider')
  return {
    provider,
    sessionId: normalizeString(value.sessionId, 'terminal agent session id', MAX_ID_LENGTH),
    startedAt: normalizeString(value.startedAt, 'terminal agent start time', MAX_ID_LENGTH),
  }
}

function normalizeEnvironment(value: unknown): Record<string, string> {
  if (!isRecord(value)) throw new Error('Invalid terminal environment')
  const keys = Object.keys(value)
  if (keys.length > MAX_ENV_ENTRIES) throw new Error('Terminal environment is too large')
  let totalBytes = 0
  const environment: Record<string, string> = {}
  for (const key of keys) {
    if (!key || key.includes('=') || hasControlCharacter(key) || key.length > MAX_ID_LENGTH) {
      throw new Error('Invalid terminal environment key')
    }
    const entry = value[key]
    if (typeof entry !== 'string' || entry.includes('\u0000') || entry.length > MAX_ENV_VALUE_LENGTH) {
      throw new Error('Invalid terminal environment value')
    }
    totalBytes += byteLength(key) + byteLength(entry)
    if (totalBytes > MAX_ENV_BYTES) throw new Error('Terminal environment is too large')
    environment[key] = entry
  }
  return environment
}

function normalizeSpawn(value: unknown): NormalizedSpawn {
  if (!isRecord(value)) throw new Error('Invalid terminal spawn')
  const target = normalizeTarget(value.target)
  const executable = normalizeString(value.executable, 'terminal executable', MAX_EXECUTABLE_LENGTH)
  if (!Array.isArray(value.args) || value.args.length > MAX_ARGUMENTS) {
    throw new Error('Invalid terminal arguments')
  }
  const args = value.args.map((arg) => normalizeString(arg, 'terminal argument', MAX_ARGUMENT_LENGTH, true))
  const cwd = normalizeString(value.cwd, 'terminal cwd', MAX_EXECUTABLE_LENGTH)
  const env = normalizeEnvironment(value.env)
  const cols = normalizePositiveDimension(value.cols, 'columns')
  const rows = normalizePositiveDimension(value.rows, 'rows')
  if (typeof value.local !== 'boolean') throw new Error('Invalid terminal locality')
  const agent = normalizeAgent(value.agent)
  const prependCommand = value.prependCommand === undefined
    ? undefined
    : normalizeString(value.prependCommand, 'terminal prepend command', MAX_COMMAND_LENGTH, true)
  const initialCommand = value.initialCommand === undefined
    ? undefined
    : normalizeString(value.initialCommand, 'terminal initial command', MAX_COMMAND_LENGTH, true)
  return {
    target,
    executable,
    args,
    cwd,
    env,
    cols,
    rows,
    local: value.local,
    ...(agent ? { agent } : {}),
    ...(prependCommand !== undefined ? { prependCommand } : {}),
    ...(initialCommand !== undefined ? { initialCommand } : {}),
  }
}

function isValidRequestId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function sameToken(value: unknown, expected: string): boolean {
  if (typeof value !== 'string') return false
  const received = Buffer.from(value, 'utf8')
  const expectedBytes = Buffer.from(expected, 'utf8')
  return received.length === expectedBytes.length && timingSafeEqual(received, expectedBytes)
}

function normalizeExitEvent(value: unknown): TerminalExitEvent {
  if (!isRecord(value) || !Number.isSafeInteger(value.exitCode)) return { exitCode: 0 }
  const signal = value.signal
  return typeof signal === 'number' && Number.isSafeInteger(signal)
    ? { exitCode: value.exitCode as number, signal }
    : { exitCode: value.exitCode as number }
}

function isPtyAlreadyExitedError(value: unknown): boolean {
  const message = value instanceof Error ? value.message : String(value)
  return /(?:pty|pseudo[- ]terminal).*already exited|already exited.*(?:pty|pseudo[- ]terminal)/i.test(message)
}

function splitTextByBytes(value: string, maxBytes: number): string[] {
  if (byteLength(value) <= maxBytes) return [value]
  const parts: string[] = []
  let start = 0
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index) ?? 0
    const character = String.fromCodePoint(codePoint)
    const characterBytes = byteLength(character)
    if (bytes > 0 && bytes + characterBytes > maxBytes) {
      parts.push(value.slice(start, index))
      start = index
      bytes = 0
    }
    bytes += characterBytes
    if (codePoint > 0xffff) index += 1
  }
  if (start < value.length) parts.push(value.slice(start))
  return parts
}

function disposeSubscription(value: unknown): void {
  if (!value || typeof value !== 'object') return
  try { (value as DisposableLike).dispose?.() } catch { /* PTY cleanup is best effort. */ }
}

function randomGenerationBase(): number {
  // Leave room for a large counter while keeping every generation a safe int.
  const limit = Number.MAX_SAFE_INTEGER - 1_000_000_000
  const random = randomBytes(6).readUIntBE(0, 6)
  return 1 + (random % limit)
}

function defaultTerminalFactory(options: TerminalDaemonTerminalFactoryOptions): TerminalDaemonTerminal {
  const terminal = new HeadlessTerminal({
    allowProposedApi: true,
    cols: options.cols,
    rows: options.rows,
    scrollback: options.scrollback,
  })
  return terminal as unknown as TerminalDaemonTerminal
}

function createTerminal(
  factory: TerminalDaemonTerminalFactory | undefined,
  options: TerminalDaemonTerminalFactoryOptions,
): TerminalDaemonTerminal {
  if (!factory) return defaultTerminalFactory(options)
  // A two-argument factory is convenient for small test doubles. The object
  // form is used by production-like tests that want scrollback configuration.
  if (factory.length >= 2) return (factory as (cols: number, rows: number) => TerminalDaemonTerminal)(options.cols, options.rows)
  return (factory as (options: TerminalDaemonTerminalFactoryOptions) => TerminalDaemonTerminal)(options)
}

class DaemonClient {
  readonly subscriptions = new Set<DaemonSession>()

  private frame = Buffer.alloc(0)

  private requestQueue = Promise.resolve()

  private pendingRequests = 0

  private closed = false

  constructor(
    readonly daemon: TerminalDaemonServer,
    readonly socket: Socket,
  ) {
    socket.setNoDelay(true)
    socket.on('data', (chunk: Buffer) => this.receive(chunk))
    socket.on('close', () => this.dispose())
    socket.on('error', () => this.dispose())
  }

  send(value: unknown): boolean {
    if (this.closed || this.socket.destroyed || !this.socket.writable) return false
    let encoded: string
    try {
      encoded = `${JSON.stringify(value)}\n`
    } catch {
      return false
    }
    if (byteLength(encoded) > TERMINAL_DAEMON_MAX_FRAME_BYTES) return false
    if (this.socket.writableLength + byteLength(encoded) > MAX_CLIENT_QUEUE_BYTES) {
      this.socket.destroy()
      return false
    }
    try {
      const accepted = this.socket.write(encoded)
      if (!accepted && this.socket.writableLength > MAX_CLIENT_QUEUE_BYTES) this.socket.destroy()
      return accepted || !this.socket.destroyed
    } catch {
      this.socket.destroy()
      return false
    }
  }

  respond(id: number, result: unknown): boolean {
    return this.send({ id, result })
  }

  respondError(id: number, error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return this.send({ id, error: message || 'Terminal daemon request failed' })
  }

  isClosed(): boolean {
    return this.closed || this.socket.destroyed
  }

  dispose(): void {
    if (this.closed) return
    this.closed = true
    for (const session of [...this.subscriptions]) session.unsubscribe(this)
    this.subscriptions.clear()
    this.daemon.removeClient(this)
  }

  close(): void {
    this.dispose()
    if (!this.socket.destroyed) this.socket.destroy()
  }

  private receive(chunk: Buffer): void {
    if (this.closed) return
    if (this.frame.length + chunk.length > TERMINAL_DAEMON_MAX_FRAME_BYTES) {
      this.close()
      return
    }
    this.frame = this.frame.length === 0 ? Buffer.from(chunk) : Buffer.concat([this.frame, chunk])
    for (;;) {
      const newline = this.frame.indexOf(0x0a)
      if (newline < 0) {
        if (this.frame.length > TERMINAL_DAEMON_MAX_FRAME_BYTES) this.close()
        return
      }
      const line = this.frame.subarray(0, newline)
      this.frame = this.frame.subarray(newline + 1)
      const trimmed = line.length > 0 && line[line.length - 1] === 0x0d
        ? line.subarray(0, line.length - 1)
        : line
      this.enqueueFrame(trimmed.toString('utf8'))
      if (this.closed) return
    }
  }

  private enqueueFrame(line: string): void {
    if (this.pendingRequests >= MAX_PENDING_REQUESTS) {
      this.close()
      return
    }
    this.pendingRequests += 1
    this.requestQueue = this.requestQueue
      .then(async () => {
        try {
          await this.daemon.handleFrame(this, line)
        } catch (error) {
          // A malformed or failed request must never terminate the daemon.
          this.respondError(0, error)
        }
      })
      .catch(() => undefined)
      .finally(() => { this.pendingRequests -= 1 })
  }
}

class DaemonSession {
  readonly subscribers = new Set<DaemonClient>()

  /** Clients whose renderer has taken ownership of terminal query replies. */
  readonly rendererClients = new Set<DaemonClient>()

  readonly identity: TerminalSessionIdentity

  readonly target: TerminalSessionTarget

  readonly pty: TerminalDaemonPty

  readonly terminal: TerminalDaemonTerminal

  readonly serializer: SerializeAddonType

  readonly spawn: NormalizedSpawn

  readonly pid: number

  readonly alertState: SemanticAgentAlertState

  private operationTail = Promise.resolve()

  private operationSerial = 0

  private completedOperationSerial = 0

  private readonly operationWaiters = new Map<number, Array<() => void>>()

  private outputQueue: string[] = []

  private receivedOutputCount = 0

  private processedOutputCount = 0

  private readonly outputWaiters = new Map<number, Array<() => void>>()

  private outputQueueBytes = 0

  private outputDrainPromise: Promise<void> | undefined

  private outputPaused = false

  private dataSubscription: unknown

  private exitSubscription: unknown

  private titleSubscription: unknown

  private terminalDataSubscription: unknown

  private startupCommand: DeferredTerminalStartupCommand | undefined

  private disposed = false

  /** Set as soon as node-pty reports exit, before queued output is drained. */
  private exitObserved = false

  private exitEvent: TerminalExitEvent | undefined

  private sequence = 0

  private title: string | undefined

  private suppressAlertQueue = false

  private localAlertRegistered = false

  private processExitHandled = false

  private processExitPromise: Promise<void> | undefined

  constructor(
    readonly daemon: TerminalDaemonServer,
    spawn: NormalizedSpawn,
    identity: TerminalSessionIdentity,
    pty: TerminalDaemonPty,
    terminal: TerminalDaemonTerminal,
    serializer: SerializeAddonType,
  ) {
    this.spawn = spawn
    this.identity = identity
    this.target = { ...spawn.target }
    this.pty = pty
    this.terminal = terminal
    this.serializer = serializer
    this.pid = typeof pty.pid === 'number' && Number.isSafeInteger(pty.pid) ? pty.pid : 0
    this.alertState = new SemanticAgentAlertState({
      onChange: (_tileId, state) => {
        if (this.suppressAlertQueue || this.disposed) return
        const alert = state ? toDaemonAlert(state) : null
        void this.enqueue(() => {
          if (!this.disposed) this.publishAlert(alert)
        }).catch(() => undefined)
      },
    })
  }

  initialize(): void {
    this.dataSubscription = this.pty.onData((data) => this.receiveData(data))
    this.exitSubscription = this.pty.onExit((event) => {
      this.exitObserved = true
      void this.enqueueProcessExit(event).catch(() => undefined)
    })

    if (typeof this.terminal.onTitleChange === 'function') {
      this.titleSubscription = this.terminal.onTitleChange((title) => {
        if (typeof title === 'string') {
          this.title = title.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, MAX_ID_LENGTH)
        }
      })
    }

    // Headless xterm may answer terminal queries (for example DSR cursor
    // queries). A ready renderer with a live xterm instance owns those replies.
    // The daemon sends them to the PTY only while no renderer is ready.
    if (typeof this.terminal.onData === 'function') {
      this.terminalDataSubscription = this.terminal.onData((data) => {
        if (this.disposed || this.rendererClients.size > 0 || !data) return
        try { this.pty.write(data) } catch { /* PTY may have exited. */ }
      })
    }
  }

  setLocalAlertRegistered(value: boolean): void {
    this.localAlertRegistered = value
  }

  isLocalAlertRegistered(): boolean {
    return this.localAlertRegistered
  }

  hasExited(): boolean {
    return this.exitObserved
  }

  subscribe(client: DaemonClient): void {
    if (this.disposed) throw new Error('Terminal session is no longer active')
    if (client.isClosed()) throw new Error('Terminal daemon client is closed')
    this.subscribers.add(client)
    client.subscriptions.add(this)
  }

  unsubscribe(client: DaemonClient): void {
    this.subscribers.delete(client)
    this.rendererClients.delete(client)
    client.subscriptions.delete(this)
  }

  async flush(): Promise<void> {
    // Capture a finite barrier. New PTY data may continue while a client asks
    // for a snapshot; waiting for silence would make snapshot and destroy
    // requests hang under a busy process.
    const operationBarrier = this.operationSerial
    const outputBarrier = this.receivedOutputCount
    const processExit = this.processExitPromise
    await Promise.all([
      this.waitForOperations(operationBarrier),
      this.waitForOutput(outputBarrier),
      ...(processExit ? [processExit] : []),
    ])
  }

  enqueue<T>(operation: () => T | PromiseLike<T>): Promise<T> {
    const serial = ++this.operationSerial
    const result = this.operationTail.then(operation)
    this.operationTail = result.then(() => undefined, () => undefined)
    void result.then(
      () => this.markOperationComplete(serial),
      () => this.markOperationComplete(serial),
    )
    return result
  }

  receiveData(data: unknown): void {
    if (this.disposed || typeof data !== 'string' || !data) return
    this.startupCommand?.onOutput(data)
    for (const part of splitTextByBytes(data, MAX_DATA_EVENT_BYTES)) {
      const partBytes = byteLength(part)
      this.outputQueue.push(part)
      this.outputQueueBytes += partBytes
      this.receivedOutputCount += 1
      if (this.outputQueueBytes >= MAX_PENDING_PARSE_BYTES && !this.outputPaused) {
        this.outputPaused = true
        try { this.pty.pause?.() } catch { /* PTY flow control is optional. */ }
      }
    }
    this.startOutputDrain()
  }

  reportAlert(alert: unknown): void {
    if (this.disposed || this.exitObserved) return
    this.alertState.report(alert)
  }

  async write(data: string): Promise<void> {
    await this.enqueue(() => {
      if (this.disposed) throw new Error('Terminal session is no longer active')
      if (this.exitObserved) return
      if (data) this.clearAlertNow()
      try {
        this.pty.write(data)
      } catch (error) {
        if (!isPtyAlreadyExitedError(error)) throw error
      }
    })
  }

  async resize(cols: number, rows: number): Promise<void> {
    await this.enqueue(() => {
      if (this.disposed) throw new Error('Terminal session is no longer active')
      if (this.exitObserved) return
      try {
        this.pty.resize(cols, rows)
      } catch (error) {
        if (!isPtyAlreadyExitedError(error)) throw error
        return
      }
      this.terminal.resize(cols, rows)
    })
  }

  async acknowledge(): Promise<void> {
    await this.enqueue(() => {
      if (this.disposed) throw new Error('Terminal session is no longer active')
      this.clearAlertNow()
    })
  }

  async snapshot(): Promise<TerminalDaemonSnapshot> {
    await this.flush()
    return this.buildSnapshotForDispatch()
  }

  async rendererAttach(client: DaemonClient): Promise<TerminalDaemonSnapshot> {
    await this.flush()
    if (client.isClosed()) throw new Error('Terminal daemon client is closed')
    this.subscribe(client)
    this.rendererClients.add(client)
    try {
      return this.buildSnapshotForDispatch()
    } catch (error) {
      this.rendererClients.delete(client)
      throw error
    }
  }

  rendererDetach(client: DaemonClient): void {
    this.rendererClients.delete(client)
  }

  async destroy(): Promise<void> {
    if (this.disposed) return
    await this.enqueue(() => {
      if (this.disposed) return
      this.clearAlertNow()
    })
    await this.flush()
    this.dispose()
    try { this.pty.kill() } catch { /* PTY may already have exited. */ }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.startupCommand?.dispose()
    this.startupCommand = undefined
    disposeSubscription(this.dataSubscription)
    disposeSubscription(this.exitSubscription)
    disposeSubscription(this.titleSubscription)
    disposeSubscription(this.terminalDataSubscription)
    this.dataSubscription = undefined
    this.exitSubscription = undefined
    this.titleSubscription = undefined
    this.terminalDataSubscription = undefined
    this.outputQueue = []
    this.outputQueueBytes = 0
    if (this.outputPaused) {
      this.outputPaused = false
      try { this.pty.resume?.() } catch { /* optional PTY flow control. */ }
    }
    for (const client of [...this.subscribers]) this.unsubscribe(client)
    try { this.serializer.dispose() } catch { /* addon cleanup is best effort. */ }
    try { this.terminal.dispose() } catch { /* terminal cleanup is best effort. */ }
    this.daemon.releaseLocalAlertTarget(this)
  }

  async startCommands(): Promise<void> {
    if (this.spawn.prependCommand?.trim()) {
      await this.enqueue(() => {
        if (!this.disposed && !this.exitObserved) this.pty.write(`${this.spawn.prependCommand}\r`)
      })
    }
    if (this.spawn.initialCommand?.trim() && !this.disposed && !this.exitObserved) {
      this.startupCommand = new DeferredTerminalStartupCommand({
        command: this.spawn.initialCommand,
        write: (data) => {
          void this.enqueue(() => {
            if (!this.disposed && !this.exitObserved) this.pty.write(data)
          }).catch(() => undefined)
        },
      })
    }
  }

  private startOutputDrain(): void {
    if (this.outputDrainPromise || this.disposed) return
    this.outputDrainPromise = (async () => {
      while (!this.disposed && this.outputQueue.length > 0) {
        const data = this.outputQueue.shift()!
        this.outputQueueBytes -= byteLength(data)
        await this.enqueue(async () => {
          if (this.disposed) return
          await this.writeHeadless(data)
          this.publishData(data)
        }).catch(() => undefined)
        this.processedOutputCount += 1
        this.resolveOutputWaiters()
        if (this.outputPaused && this.outputQueueBytes <= RESUME_PARSE_BYTES) {
          this.outputPaused = false
          try { this.pty.resume?.() } catch { /* optional PTY flow control. */ }
        }
      }
    })().catch(() => undefined).finally(() => {
      this.outputDrainPromise = undefined
      if (!this.disposed && this.outputQueue.length > 0) this.startOutputDrain()
    })
  }

  private writeHeadless(data: string): Promise<void> {
    return new Promise((resolve) => {
      let settled = false
      const complete = (): void => {
        if (settled) return
        settled = true
        resolve()
      }
      try {
        this.terminal.write(data, complete)
      } catch {
        complete()
      }
    })
  }

  private waitForOperations(target: number): Promise<void> {
    if (this.completedOperationSerial >= target) return Promise.resolve()
    return new Promise(resolve => {
      const waiters = this.operationWaiters.get(target) ?? []
      waiters.push(resolve)
      this.operationWaiters.set(target, waiters)
    })
  }

  private markOperationComplete(serial: number): void {
    this.completedOperationSerial = Math.max(this.completedOperationSerial, serial)
    for (const [target, waiters] of [...this.operationWaiters]) {
      if (target > this.completedOperationSerial) continue
      this.operationWaiters.delete(target)
      for (const resolve of waiters) resolve()
    }
  }

  private waitForOutput(target: number): Promise<void> {
    if (this.processedOutputCount >= target) return Promise.resolve()
    return new Promise(resolve => {
      const waiters = this.outputWaiters.get(target) ?? []
      waiters.push(resolve)
      this.outputWaiters.set(target, waiters)
    })
  }

  private resolveOutputWaiters(): void {
    for (const [target, waiters] of [...this.outputWaiters]) {
      if (target > this.processedOutputCount) continue
      this.outputWaiters.delete(target)
      for (const resolve of waiters) resolve()
    }
  }

  private publishData(data: string): void {
    for (const part of splitTextByBytes(data, MAX_DATA_EVENT_BYTES)) {
      this.sequence += 1
      this.broadcast({
        event: 'data',
        identity: { ...this.identity },
        sequence: this.sequence,
        data: part,
      })
    }
  }

  private publishAlert(alert: ReturnType<typeof toDaemonAlert> | null): void {
    this.sequence += 1
    this.broadcast({
      event: 'alert',
      identity: { ...this.identity },
      sequence: this.sequence,
      alert,
    })
  }

  private async handleProcessExit(value: unknown): Promise<void> {
    if (this.processExitHandled || this.disposed) return
    this.processExitHandled = true
    this.exitObserved = true
    this.exitEvent = normalizeExitEvent(value)
    this.startupCommand?.dispose()
    this.startupCommand = undefined
    this.daemon.releaseLocalAlertTarget(this)
    this.suppressAlertQueue = true
    const hadAlert = this.alertState.has(this.target.tileId)
    this.alertState.clearOnDestroy(this.target.tileId)
    this.suppressAlertQueue = false
    if (hadAlert) this.publishAlert(null)
    this.sequence += 1
    this.broadcast({
      event: 'exit',
      identity: { ...this.identity },
      sequence: this.sequence,
      exitEvent: { ...this.exitEvent },
    })
  }

  private enqueueProcessExit(event: unknown): Promise<void> {
    if (this.processExitPromise) return this.processExitPromise
    const outputBarrier = this.receivedOutputCount
    const processExit = this.waitForOutput(outputBarrier)
      .then(() => this.enqueue(() => this.handleProcessExit(event)))
      .then(() => undefined)
    this.processExitPromise = processExit
    return processExit
  }

  private clearAlertNow(): void {
    this.suppressAlertQueue = true
    const hadAlert = this.alertState.has(this.target.tileId)
    this.alertState.clearOnInput(this.target.tileId)
    this.suppressAlertQueue = false
    if (hadAlert) this.publishAlert(null)
  }

  buildSnapshotForDispatch(): TerminalDaemonSnapshot {
    const buffer = this.serializeBuffer()
    const snapshot: TerminalDaemonSnapshot = {
      identity: { ...this.identity },
      cols: this.terminal.cols,
      rows: this.terminal.rows,
      buffer,
      sequence: this.sequence,
      pid: this.pid,
      ...(this.spawn.agent ? { agent: cloneAgent(this.spawn.agent) } : {}),
      ...(this.alertState.get(this.target.tileId)
        ? { alert: toDaemonAlert(this.alertState.get(this.target.tileId)!) }
        : {}),
      ...(this.exitEvent ? { exitEvent: { ...this.exitEvent } } : {}),
    }
    return snapshot
  }

  private serializeBuffer(): string {
    let scrollback = MAX_SCROLLBACK_LINES
    let serialized = ''
    const titleSuffix = this.title === undefined ? '' : `\u001b]2;${this.title}\u0007`
    for (;;) {
      serialized = this.serializer.serialize({ scrollback })
      if (byteLength(serialized) + byteLength(titleSuffix) <= MAX_SNAPSHOT_BYTES || scrollback === 0) break
      scrollback = Math.floor(scrollback / 2)
    }
    serialized += titleSuffix
    if (byteLength(serialized) > MAX_SNAPSHOT_BYTES) {
      throw new Error('Terminal snapshot exceeds protocol limit')
    }
    return serialized
  }

  private broadcast(event: TerminalDaemonEvent): void {
    for (const client of [...this.subscribers]) {
      if (!client.send(event)) this.unsubscribe(client)
    }
  }
}

function cloneAgent(agent: TerminalDaemonAgent): TerminalDaemonAgent {
  return { ...agent }
}

function toDaemonAlert(state: AgentAlertState): NonNullable<TerminalDaemonSnapshot['alert']> {
  return {
    provider: state.provider,
    event: state.event,
    tileId: state.tileId,
  }
}

export class TerminalDaemonServer {
  private readonly options: StartTerminalDaemonOptions

  private readonly ptyFactory: TerminalDaemonPtyFactory

  private readonly terminalFactory?: TerminalDaemonTerminalFactory

  private readonly token: string

  private readonly generationBase = randomGenerationBase()

  private generationCounter = 0

  private readonly sessions = new Map<string, DaemonSession>()

  private readonly creations = new Map<string, Promise<DaemonSession>>()

  private readonly clients = new Set<DaemonClient>()

  private readonly localAlertTargets = new Map<string, Set<string>>()

  private readonly agentAlertBridge = new AgentAlertBridge({
    onAlert: (alert) => this.receiveAgentAlert(alert),
  })

  private bridgeStartPromise: Promise<unknown> | undefined

  private server: Server | undefined

  private endpointValue: TerminalDaemonEndpoint | undefined

  private endpointPath = ''

  private idleTimer: ReturnType<typeof setTimeout> | undefined

  private idleNotified = false

  private closing = false

  private closePromise: Promise<void> | undefined

  constructor(options: StartTerminalDaemonOptions, ptyFactory: TerminalDaemonPtyFactory) {
    this.options = options
    this.ptyFactory = ptyFactory
    this.terminalFactory = options.terminalFactory
    this.token = options.token ?? randomBytes(32).toString('hex')
  }

  get endpoint(): TerminalDaemonEndpoint {
    if (!this.endpointValue) throw new Error('Terminal daemon has not started')
    return { ...this.endpointValue }
  }

  async start(): Promise<TerminalDaemonHandle> {
    if (this.endpointValue && this.server) return this.handle()
    if (this.closing) throw new Error('Terminal daemon is closing')
    this.endpointPath = join(this.options.directory, ENDPOINT_FILE_NAME)
    await fs.mkdir(this.options.directory, { recursive: true, mode: ENDPOINT_DIRECTORY_MODE })
    await fs.chmod(this.options.directory, ENDPOINT_DIRECTORY_MODE)
    this.server = createServer((socket) => {
      if (this.closing) {
        socket.destroy()
        return
      }
      const client = new DaemonClient(this, socket)
      this.clients.add(client)
      this.cancelIdleTimer()
    })
    try {
      await this.listen()
      const address = this.server.address()
      if (!address || typeof address === 'string' || !Number.isSafeInteger(address.port)) {
        throw new Error('Terminal daemon did not receive a loopback port')
      }
      this.endpointValue = {
        version: TERMINAL_DAEMON_PROTOCOL_VERSION,
        port: address.port,
        token: this.token,
        pid: process.pid,
      }
      await this.writeEndpoint(this.endpointValue)
      this.scheduleIdleTimer()
      return this.handle()
    } catch (error) {
      await this.closeInternal()
      throw error
    }
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise
    this.closePromise = this.closeInternal()
    return this.closePromise
  }

  removeClient(client: DaemonClient): void {
    this.clients.delete(client)
    this.scheduleIdleTimer()
  }

  releaseLocalAlertTarget(session: DaemonSession): void {
    if (!session.spawn.local || !session.isLocalAlertRegistered()) return
    session.setLocalAlertRegistered(false)
    const key = terminalSessionLookupKey(session.target)
    const targets = this.localAlertTargets.get(session.target.tileId)
    if (!targets) return
    targets.delete(key)
    if (targets.size > 0) return
    this.localAlertTargets.delete(session.target.tileId)
    this.agentAlertBridge.unregisterTerminal(session.target.tileId)
  }

  async handleFrame(client: DaemonClient, line: string): Promise<void> {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      client.respondError(0, 'Malformed terminal daemon frame')
      return
    }
    if (!isRecord(parsed)) {
      client.respondError(0, 'Malformed terminal daemon request')
      return
    }
    const id = isValidRequestId(parsed.id) ? parsed.id : 0
    if (!sameToken(parsed.token, this.token)) {
      client.respondError(id, 'Unauthorized terminal daemon request')
      return
    }
    const method = parsed.method
    if (typeof method !== 'string' || !(METHODS as readonly string[]).includes(method)) {
      client.respondError(id, 'Unknown terminal daemon method')
      return
    }
    try {
      const result = await this.dispatch(client, method as DaemonMethod, parsed.params)
      client.respond(id, result)
    } catch (error) {
      client.respondError(id, error)
    }
  }

  private handle(): TerminalDaemonHandle {
    return { endpoint: this.endpoint, close: () => this.close() }
  }

  private async dispatch(client: DaemonClient, method: DaemonMethod, params: unknown): Promise<unknown> {
    switch (method) {
      case 'ping':
        requireUndefinedParams(params)
        return { version: TERMINAL_DAEMON_PROTOCOL_VERSION, pid: process.pid }
      case 'list':
        requireUndefinedParams(params)
        return Promise.all([...this.sessions.values()].map((session) => session.snapshot()))
      case 'attach': {
        const target = normalizeTarget(params)
        const session = this.sessions.get(terminalSessionLookupKey(target))
        if (!session) return null
        await session.flush()
        session.subscribe(client)
        return session.buildSnapshotForDispatch()
      }
      case 'create': {
        const spawn = normalizeSpawn(params)
        const key = terminalSessionLookupKey(spawn.target)
        const existing = this.sessions.get(key)
        if (existing) {
          await existing.flush()
          existing.subscribe(client)
          return existing.buildSnapshotForDispatch()
        }
        if (this.closing) throw new Error('Terminal daemon is closing')
        let creating = this.creations.get(key)
        if (!creating) {
          creating = this.createSession(spawn)
          this.creations.set(key, creating)
          const pending = creating
          void pending.then(
            () => this.finishCreation(key, pending),
            () => this.finishCreation(key, pending),
          )
        }
        const session = await creating
        await session.flush()
        session.subscribe(client)
        return session.buildSnapshotForDispatch()
      }
      case 'snapshot': {
        const identity = normalizeIdentity(params)
        const session = this.findSession(identity)
        if (!session) throw new Error('Terminal session identity is stale')
        return session.snapshot()
      }
      case 'rendererAttach': {
        const identity = normalizeIdentity(params)
        const session = this.findSession(identity)
        if (!session) throw new Error('Terminal session identity is stale')
        return session.rendererAttach(client)
      }
      case 'rendererDetach': {
        const identity = normalizeIdentity(params)
        const session = this.findSession(identity)
        if (!session) throw new Error('Terminal session identity is stale')
        session.rendererDetach(client)
        return null
      }
      case 'write': {
        if (!isRecord(params)) throw new Error('Invalid terminal write parameters')
        const identity = normalizeIdentity(params.identity)
        const data = normalizeTerminalInput(params.data)
        const session = this.findRequiredSession(identity)
        await session.write(data)
        return null
      }
      case 'resize': {
        if (!isRecord(params)) throw new Error('Invalid terminal resize parameters')
        const identity = normalizeIdentity(params.identity)
        const cols = normalizePositiveDimension(params.cols, 'columns')
        const rows = normalizePositiveDimension(params.rows, 'rows')
        const session = this.findRequiredSession(identity)
        await session.resize(cols, rows)
        return null
      }
      case 'acknowledge': {
        const identity = normalizeIdentity(params)
        const session = this.findRequiredSession(identity)
        await session.acknowledge()
        return null
      }
      case 'destroy': {
        const identity = normalizeIdentity(params)
        const session = this.findSession(identity)
        if (!session) throw new Error('Terminal session identity is stale')
        await this.destroySession(session)
        return null
      }
      case 'destroyCurrent': {
        const target = normalizeTarget(params)
        const key = terminalSessionLookupKey(target)
        const creating = this.creations.get(key)
        if (creating) await Promise.allSettled([creating])
        const session = this.sessions.get(key)
        if (session) await this.destroySession(session)
        return null
      }
      case 'destroyWorkspace': {
        if (!isRecord(params)) throw new Error('Invalid terminal workspace parameters')
        const workspaceId = normalizeIdentifier(params.workspaceId, 'terminal workspace id')
        const sessions = new Set([...this.sessions.values()].filter(session => session.target.workspaceId === workspaceId))
        const pending = [...this.creations.entries()].filter(([key]) => lookupKeyWorkspaceId(key) === workspaceId)
        await Promise.allSettled(pending.map(([, creating]) => creating))
        for (const [key] of pending) {
          const session = this.sessions.get(key)
          if (session) sessions.add(session)
        }
        await Promise.all([...sessions].map(session => this.destroySession(session)))
        return null
      }
    }
  }

  private async createSession(spawn: NormalizedSpawn): Promise<DaemonSession> {
    const identity: TerminalSessionIdentity = {
      ...spawn.target,
      generation: this.nextGeneration(),
    }
    let terminal: TerminalDaemonTerminal | undefined
    let serializer: SerializeAddonType | undefined
    let pty: TerminalDaemonPty | undefined
    let session: DaemonSession | undefined
    let localRegistered = false
    try {
      terminal = createTerminal(this.terminalFactory, {
        cols: spawn.cols,
        rows: spawn.rows,
        scrollback: MAX_SCROLLBACK_LINES,
      })
      serializer = new SerializeAddon()
      terminal.loadAddon(serializer as unknown)
      const environment = { ...spawn.env }
      for (const key of BRIDGE_ENV_KEYS) delete environment[key]
      delete environment.ELECTRON_RUN_AS_NODE
      if (spawn.local) {
        await this.ensureAgentAlertBridgeStarted()
        Object.assign(environment, this.registerLocalAlertTarget(spawn.target))
        localRegistered = true
      }
      if (this.closing) throw new Error('Terminal daemon is closing')
      pty = this.ptyFactory.spawn(spawn.executable, [...spawn.args], {
        name: 'xterm-256color',
        cols: spawn.cols,
        rows: spawn.rows,
        cwd: spawn.cwd,
        env: environment,
      })
      if (!pty || typeof pty.write !== 'function' || typeof pty.resize !== 'function'
        || typeof pty.kill !== 'function' || typeof pty.onData !== 'function' || typeof pty.onExit !== 'function') {
        throw new Error('Terminal PTY factory returned an invalid PTY')
      }
      session = new DaemonSession(this, spawn, identity, pty, terminal, serializer)
      if (localRegistered) session.setLocalAlertRegistered(true)
      session.initialize()
      this.sessions.set(terminalSessionLookupKey(spawn.target), session)
      await session.startCommands()
      this.scheduleIdleTimer()
      return session
    } catch (error) {
      if (session) {
        this.sessions.delete(terminalSessionLookupKey(spawn.target))
        session.dispose()
      }
      if (localRegistered) this.releaseUnownedLocalAlertTarget(spawn.target)
      try { pty?.kill() } catch { /* failed spawn cleanup is best effort. */ }
      try { serializer?.dispose() } catch { /* addon cleanup is best effort. */ }
      try { terminal?.dispose() } catch { /* terminal cleanup is best effort. */ }
      throw new Error(`Failed to spawn terminal: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private finishCreation(key: string, pending: Promise<DaemonSession>): void {
    if (this.creations.get(key) !== pending) return
    this.creations.delete(key)
    this.scheduleIdleTimer()
  }

  private async destroySession(session: DaemonSession): Promise<void> {
    const key = terminalSessionLookupKey(session.target)
    if (this.sessions.get(key) !== session) return
    this.sessions.delete(key)
    await session.destroy()
    this.scheduleIdleTimer()
  }

  private findSession(identity: TerminalSessionIdentity): DaemonSession | undefined {
    const session = this.sessions.get(terminalSessionLookupKey(identity))
    if (!session || session.identity.generation !== identity.generation) return undefined
    return session
  }

  private findRequiredSession(identity: TerminalSessionIdentity): DaemonSession {
    const session = this.findSession(identity)
    if (!session) throw new Error('Terminal session identity is stale')
    return session
  }

  private nextGeneration(): number {
    this.generationCounter += 1
    const generation = this.generationBase + this.generationCounter
    if (!Number.isSafeInteger(generation)) {
      throw new Error('Terminal session generation space exhausted')
    }
    return generation
  }

  private registerLocalAlertTarget(target: TerminalSessionTarget): Record<string, string> {
    const key = terminalSessionLookupKey(target)
    const targets = this.localAlertTargets.get(target.tileId) ?? new Set<string>()
    const first = targets.size === 0
    if (first) this.agentAlertBridge.registerLocalTerminal(target.tileId)
    targets.add(key)
    this.localAlertTargets.set(target.tileId, targets)
    const environment = this.agentAlertBridge.getLaunchEnvironment(target.tileId)
    if (!environment) throw new Error('Agent alert bridge is not available')
    return environment
  }

  private releaseUnownedLocalAlertTarget(target: TerminalSessionTarget): void {
    const key = terminalSessionLookupKey(target)
    const targets = this.localAlertTargets.get(target.tileId)
    if (!targets) return
    targets.delete(key)
    if (targets.size > 0) return
    this.localAlertTargets.delete(target.tileId)
    this.agentAlertBridge.unregisterTerminal(target.tileId)
  }

  private receiveAgentAlert(alert: AgentAlertState | { provider: 'codex' | 'claude'; event: 'completed' | 'permission' | 'input'; tileId: string }): void {
    const tileCandidates = [...this.sessions.values()].filter((session) => (
      session.spawn.local
      && !session.hasExited()
      && session.target.tileId === alert.tileId
    ))
    const providerCandidates = tileCandidates.filter(session => session.spawn.agent?.provider === alert.provider)
    const candidates = providerCandidates.length === 1
      ? providerCandidates
      : providerCandidates.length === 0 && tileCandidates.length === 1
        ? tileCandidates
        : []
    // The hook payload has no workspace ID. Ignore ambiguous matches instead
    // of assigning an alert to an arbitrary workspace.
    if (candidates.length !== 1) return
    candidates[0].reportAlert(alert)
  }

  private ensureAgentAlertBridgeStarted(): Promise<unknown> {
    if (!this.bridgeStartPromise) {
      const starting = this.agentAlertBridge.start()
      this.bridgeStartPromise = starting.catch((error) => {
        this.bridgeStartPromise = undefined
        throw error
      })
    }
    return this.bridgeStartPromise
  }

  private async listen(): Promise<void> {
    const server = this.server
    if (!server) throw new Error('Terminal daemon server was not created')
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        server.off('error', onError)
        reject(error)
      }
      server.once('error', onError)
      server.listen({ host: '127.0.0.1', port: 0 }, () => {
        server.off('error', onError)
        resolve()
      })
    })
  }

  private async writeEndpoint(endpoint: TerminalDaemonEndpoint): Promise<void> {
    const temporaryPath = `${this.endpointPath}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`
    const text = `${JSON.stringify(endpoint)}\n`
    try {
      const handle = await fs.open(temporaryPath, 'w', ENDPOINT_FILE_MODE)
      try {
        await handle.writeFile(text, 'utf8')
        await handle.chmod(ENDPOINT_FILE_MODE)
      } finally {
        await handle.close()
      }
      await fs.rename(temporaryPath, this.endpointPath)
    } catch (error) {
      try { await fs.unlink(temporaryPath) } catch { /* temporary file may not exist. */ }
      throw error
    }
  }

  private scheduleIdleTimer(): void {
    if (this.closing || this.idleNotified || this.sessions.size > 0 || this.clients.size > 0 || this.creations.size > 0) return
    if (this.idleTimer) return
    const idleMs = typeof this.options.idleMs === 'number' && Number.isFinite(this.options.idleMs)
      ? Math.max(1, Math.floor(this.options.idleMs))
      : DEFAULT_IDLE_MS
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined
      if (this.closing || this.sessions.size > 0 || this.clients.size > 0 || this.creations.size > 0 || this.idleNotified) return
      this.idleNotified = true
      try { this.options.onIdle?.() } catch { /* idle notification must not crash the daemon. */ }
    }, idleMs)
  }

  private cancelIdleTimer(): void {
    if (!this.idleTimer) return
    clearTimeout(this.idleTimer)
    this.idleTimer = undefined
  }

  private async closeInternal(): Promise<void> {
    if (this.closing && !this.server && !this.endpointValue) return
    this.closing = true
    this.cancelIdleTimer()
    for (const client of [...this.clients]) client.close()
    await Promise.allSettled([...this.creations.values()])
    const sessions = [...this.sessions.values()]
    this.sessions.clear()
    await Promise.allSettled(sessions.map(session => session.destroy()))
    this.localAlertTargets.clear()
    await this.agentAlertBridge.close().catch(() => undefined)
    const server = this.server
    this.server = undefined
    if (server) {
      await new Promise<void>((resolve) => {
        try { server.close(() => resolve()) } catch { resolve() }
      })
    }
    await this.removeOwnedEndpoint()
    this.endpointValue = undefined
  }

  private async removeOwnedEndpoint(): Promise<void> {
    if (!this.endpointPath || !this.endpointValue) return
    try {
      const text = await fs.readFile(this.endpointPath, 'utf8')
      const parsed = JSON.parse(text) as { token?: unknown }
      if (parsed.token === this.endpointValue.token) await fs.unlink(this.endpointPath)
    } catch {
      // A replaced or already-removed endpoint belongs to its current owner.
    }
  }
}

function requireUndefinedParams(value: unknown): void {
  if (value !== undefined) throw new Error('This terminal daemon method does not accept parameters')
}

export async function startTerminalDaemon(options: StartTerminalDaemonOptions): Promise<TerminalDaemonHandle> {
  const directory = normalizeString(options?.directory, 'terminal daemon directory', MAX_EXECUTABLE_LENGTH)
  const ptyFactory = options?.ptyFactory
  if (!ptyFactory || typeof ptyFactory.spawn !== 'function') {
    throw new Error('A terminal PTY factory is required')
  }
  const server = new TerminalDaemonServer({ ...options, directory }, ptyFactory)
  return server.start()
}

// Used by the in-repository entrypoint and kept separate from Electron so the
// daemon can survive the application process and its renderer windows.
export function createNodePtyFactory(moduleValue: { spawn: TerminalDaemonPtyFactory['spawn'] }): TerminalDaemonPtyFactory {
  return { spawn: moduleValue.spawn }
}
