import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { createConnection, type Socket } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import {
  TERMINAL_DAEMON_MAX_FRAME_BYTES,
  TERMINAL_DAEMON_PROTOCOL_VERSION,
  type TerminalDaemonEndpoint,
  type TerminalDaemonEvent,
  type TerminalDaemonMethods,
  type TerminalDaemonRequest,
} from '@shared/terminalDaemonProtocol'

export const TERMINAL_DAEMON_ENDPOINT_FILE = 'endpoint.json'
export const TERMINAL_DAEMON_STARTUP_LOCK_FILE = 'startup.lock'
export const TERMINAL_DAEMON_CONNECT_TIMEOUT_MS = 750
export const TERMINAL_DAEMON_REQUEST_TIMEOUT_MS = 5_000
export const TERMINAL_DAEMON_STARTUP_TIMEOUT_MS = 10_000
export const TERMINAL_DAEMON_POLL_INTERVAL_MS = 40
export const TERMINAL_DAEMON_MAX_PENDING_REQUESTS = 1_024
export const TERMINAL_DAEMON_APPIMAGE_BOOTSTRAP = [
  '(async () => {',
  "const path = require('node:path');",
  "const { pathToFileURL } = require('node:url');",
  "const entry = path.join(path.dirname(process.execPath), 'resources', 'app.asar', 'dist-electron', 'main', 'terminalDaemon.js');",
  'const daemon = await import(pathToFileURL(entry).href);',
  'const status = await daemon.runTerminalDaemonEntry(process.argv[1]);',
  'if (status) process.exitCode = status;',
  '})().catch((error) => { console.error(error); process.exitCode = 1; });',
].join('')

const LOOPBACK_HOST = '127.0.0.1'
const MAX_ENDPOINT_TOKEN_BYTES = 4 * 1024
const STARTUP_LOCK_RECORD_BYTES = 128
const childLaunchErrors = new WeakMap<ChildProcess, Error>()

export interface TerminalDaemonClientOptions {
  connectTimeoutMs?: number
  requestTimeoutMs?: number
}

export type TerminalDaemonEventListener = (event: TerminalDaemonEvent) => void
export type TerminalDaemonDisconnectListener = (error: Error) => void

export interface ConnectTerminalDaemonOptions {
  directory: string
  executable: string
  entryPath: string
  appImagePath?: string
  startupTimeoutMs?: number
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

interface StartupLock {
  fileHandle: fs.FileHandle
  path: string
  ownerPid: number
  ownerToken: string
}

interface StartupLockRecord {
  pid: number
  token?: string
}

interface EndpointProbeReady {
  kind: 'ready'
  client: TerminalDaemonClient
}

interface EndpointProbeStale {
  kind: 'stale'
}

interface EndpointProbeFailed {
  kind: 'failed'
  error: Error
}

type EndpointProbeResult = EndpointProbeReady | EndpointProbeStale | EndpointProbeFailed

function errorFrom(value: unknown, fallback: string): Error {
  if (value instanceof Error) return value
  if (typeof value === 'string' && value) return new Error(value)
  return new Error(fallback)
}

function socketError(value: unknown, context: string): Error {
  const error = errorFrom(value, context)
  if (error.message.startsWith(context)) return error
  return new Error(`${context}: ${error.message}`)
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function normalizeEndpoint(value: unknown): TerminalDaemonEndpoint {
  if (!value || typeof value !== 'object') {
    throw new Error('Terminal daemon endpoint is not an object')
  }

  const endpoint = value as Partial<TerminalDaemonEndpoint>
  const version = endpoint.version
  const port = endpoint.port
  const token = endpoint.token
  const pid = endpoint.pid
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version <= 0) {
    throw new Error('Terminal daemon endpoint has an invalid protocol version')
  }
  if (!positiveInteger(port) || port > 65_535) {
    throw new Error('Terminal daemon endpoint has an invalid TCP port')
  }
  if (typeof token !== 'string' || token.length === 0
    || Buffer.byteLength(token, 'utf8') > MAX_ENDPOINT_TOKEN_BYTES) {
    throw new Error('Terminal daemon endpoint has an invalid token')
  }
  if (!positiveInteger(pid)) {
    throw new Error('Terminal daemon endpoint has an invalid PID')
  }

  return {
    version,
    port,
    token,
    pid,
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    return code === 'EPERM'
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

function remainingTime(deadline: number): number {
  return Math.max(0, deadline - Date.now())
}

function startupError(directory: string, detail: string): Error {
  return new Error(`Unable to start terminal daemon in ${directory}: ${detail}`)
}

function protocolError(detail: string): Error {
  return new Error(`Terminal daemon protocol error: ${detail}`)
}

function endpointError(endpointPath: string, detail: string): Error {
  return new Error(`Invalid terminal daemon endpoint at ${endpointPath}: ${detail}`)
}

export class TerminalDaemonClient {
  private readonly pending = new Map<number, PendingRequest>()

  private readonly eventListeners = new Set<TerminalDaemonEventListener>()

  private readonly disconnectListeners = new Set<TerminalDaemonDisconnectListener>()

  private receiveBuffer = ''

  private nextRequestId = 1

  private disconnected = false

  private disconnectReason: Error | undefined

  private constructor(
    private readonly socket: Socket,
    private readonly endpoint: TerminalDaemonEndpoint,
    private readonly requestTimeoutMs: number,
  ) {
    socket.setEncoding('utf8')
    socket.setNoDelay(true)
    socket.on('data', (chunk: string | Buffer) => this.receive(chunk))
    socket.once('error', (error) => this.handleDisconnect(socketError(error, 'Terminal daemon socket error')))
    socket.once('end', () => this.handleDisconnect(new Error('Terminal daemon closed the connection')))
    socket.once('close', () => this.handleDisconnect(new Error('Terminal daemon connection closed')))
  }

  static connect(
    endpoint: TerminalDaemonEndpoint,
    options: TerminalDaemonClientOptions = {},
  ): Promise<TerminalDaemonClient> {
    let normalized: TerminalDaemonEndpoint
    try {
      normalized = normalizeEndpoint(endpoint)
      if (normalized.version !== TERMINAL_DAEMON_PROTOCOL_VERSION) {
        throw new Error(
          `Unsupported terminal daemon protocol version ${normalized.version}; expected ${TERMINAL_DAEMON_PROTOCOL_VERSION}`,
        )
      }
    } catch (error) {
      return Promise.reject(errorFrom(error, 'Invalid terminal daemon endpoint'))
    }

    const connectTimeoutMs = normalizeTimeout(
      options.connectTimeoutMs,
      TERMINAL_DAEMON_CONNECT_TIMEOUT_MS,
    )
    const requestTimeoutMs = normalizeTimeout(
      options.requestTimeoutMs,
      TERMINAL_DAEMON_REQUEST_TIMEOUT_MS,
    )

    return new Promise<TerminalDaemonClient>((resolveClient, reject) => {
      const socket = createConnection({ host: LOOPBACK_HOST, port: normalized.port })
      let settled = false

      const rejectConnection = (error: unknown): void => {
        if (settled) return
        settled = true
        socket.destroy()
        reject(socketError(error, `Unable to connect to terminal daemon at ${LOOPBACK_HOST}:${normalized.port}`))
      }

      socket.setTimeout(connectTimeoutMs, () => {
        rejectConnection(new Error(`connection timeout after ${connectTimeoutMs} ms`))
      })
      socket.once('error', rejectConnection)
      socket.once('connect', () => {
        if (settled) return
        settled = true
        socket.setTimeout(0)
        try {
          resolveClient(new TerminalDaemonClient(socket, normalized, requestTimeoutMs))
        } catch (error) {
          socket.destroy()
          reject(errorFrom(error, 'Unable to initialize terminal daemon client'))
        }
      })
    })
  }

  request<M extends keyof TerminalDaemonMethods>(
    method: M,
    params: TerminalDaemonMethods[M]['params'],
  ): Promise<TerminalDaemonMethods[M]['result']> {
    if (this.disconnected) {
      return Promise.reject(this.disconnectReason ?? new Error('Terminal daemon client is disconnected'))
    }
    if (this.pending.size >= TERMINAL_DAEMON_MAX_PENDING_REQUESTS) {
      return Promise.reject(new Error('Terminal daemon request limit reached'))
    }
    if (typeof method !== 'string' || method.length === 0) {
      return Promise.reject(new Error('Terminal daemon method must be a non-empty string'))
    }

    const id = this.allocateRequestId()
    const request: TerminalDaemonRequest = {
      id,
      token: this.endpoint.token,
      method,
      ...(params === undefined ? {} : { params }),
    }

    let frame: string
    try {
      frame = `${JSON.stringify(request)}\n`
    } catch (error) {
      return Promise.reject(errorFrom(error, 'Unable to encode terminal daemon request'))
    }
    if (Buffer.byteLength(frame, 'utf8') > TERMINAL_DAEMON_MAX_FRAME_BYTES) {
      return Promise.reject(new Error('Terminal daemon request exceeds the frame limit'))
    }

    return new Promise<TerminalDaemonMethods[M]['result']>((resolveRequest, rejectRequest) => {
      const timeout = setTimeout(() => {
        const pending = this.pending.get(id)
        if (!pending) return
        this.pending.delete(id)
        pending.reject(new Error(`Terminal daemon request ${id} timed out after ${this.requestTimeoutMs} ms`))
      }, this.requestTimeoutMs)
      this.pending.set(id, {
        resolve: resolveRequest as (value: unknown) => void,
        reject: rejectRequest,
        timeout,
      })

      try {
        this.socket.write(frame, (error?: Error | null) => {
          if (!error) return
          this.handleDisconnect(socketError(error, 'Unable to write to terminal daemon'))
        })
      } catch (error) {
        this.handleDisconnect(socketError(error, 'Unable to write to terminal daemon'))
      }
    })
  }

  onEvent(callback: TerminalDaemonEventListener): () => void {
    this.eventListeners.add(callback)
    return () => { this.eventListeners.delete(callback) }
  }

  onDisconnect(callback: TerminalDaemonDisconnectListener): () => void {
    this.disconnectListeners.add(callback)
    if (this.disconnectReason) {
      queueMicrotask(() => {
        if (this.disconnectListeners.has(callback)) {
          try {
            callback(this.disconnectReason as Error)
          } catch {
            // One disconnect listener must not prevent the others from running.
          }
        }
      })
    }
    return () => { this.disconnectListeners.delete(callback) }
  }

  disconnect(): void {
    this.handleDisconnect(new Error('Terminal daemon client disconnected'))
  }

  private allocateRequestId(): number {
    const first = this.nextRequestId
    let candidate = first
    do {
      candidate = this.nextRequestId
      this.nextRequestId = this.nextRequestId === Number.MAX_SAFE_INTEGER
        ? 1
        : this.nextRequestId + 1
    } while (this.pending.has(candidate) && candidate !== first)
    if (this.pending.has(candidate)) throw new Error('Terminal daemon request ID space exhausted')
    return candidate
  }

  private receive(chunk: string | Buffer): void {
    if (this.disconnected) return
    this.receiveBuffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')

    while (!this.disconnected) {
      const newline = this.receiveBuffer.indexOf('\n')
      if (newline < 0) {
        if (Buffer.byteLength(this.receiveBuffer, 'utf8') > TERMINAL_DAEMON_MAX_FRAME_BYTES) {
          this.handleDisconnect(protocolError('incoming frame exceeds the frame limit'))
        }
        return
      }

      const line = this.receiveBuffer.slice(0, newline)
      this.receiveBuffer = this.receiveBuffer.slice(newline + 1)
      if (Buffer.byteLength(line, 'utf8') + 1 > TERMINAL_DAEMON_MAX_FRAME_BYTES) {
        this.handleDisconnect(protocolError('incoming frame exceeds the frame limit'))
        return
      }
      if (line.trim().length === 0) continue

      let message: unknown
      try {
        message = JSON.parse(line)
      } catch {
        this.handleDisconnect(protocolError('incoming frame is not valid JSON'))
        return
      }
      this.handleMessage(message)
    }
  }

  private handleMessage(message: unknown): void {
    if (!message || typeof message !== 'object') {
      this.handleDisconnect(protocolError('incoming message is not an object'))
      return
    }

    const record = message as Record<string, unknown>
    if (typeof record.event === 'string') {
      for (const listener of [...this.eventListeners]) {
        try {
          listener(message as TerminalDaemonEvent)
        } catch {
          // Event listeners are application callbacks. They must not break transport.
        }
      }
      return
    }

    if (!Number.isSafeInteger(record.id) || (record.id as number) <= 0) {
      this.handleDisconnect(protocolError('response has an invalid request ID'))
      return
    }
    const responseId = record.id as number
    const pending = this.pending.get(responseId)
    if (!pending) return
    this.pending.delete(responseId)
    clearTimeout(pending.timeout)

    if (typeof record.error === 'string') {
      pending.reject(new Error(record.error))
      return
    }
    if (!Object.prototype.hasOwnProperty.call(record, 'result')) {
      pending.reject(protocolError('response has neither result nor error'))
      return
    }
    pending.resolve(record.result)
  }

  private handleDisconnect(reason: Error): void {
    if (this.disconnected) return
    this.disconnected = true
    this.disconnectReason = reason
    this.receiveBuffer = ''

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(reason)
    }
    this.pending.clear()

    try {
      this.socket.destroy()
    } catch {
      // The socket is already closed.
    }

    for (const callback of [...this.disconnectListeners]) {
      try {
        callback(reason)
      } catch {
        // One disconnect listener must not prevent the others from running.
      }
    }
  }
}

function normalizeTimeout(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback
  if (!Number.isFinite(value) || value <= 0) throw new Error('Terminal daemon timeout must be positive')
  return Math.max(1, Math.floor(value))
}

async function ensurePrivateDirectory(directory: string): Promise<void> {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  await fs.chmod(directory, 0o700)
}

async function readEndpoint(endpointPath: string): Promise<TerminalDaemonEndpoint | null> {
  let contents: string
  try {
    contents = await fs.readFile(endpointPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null
    throw endpointError(endpointPath, errorFrom(error, 'unable to read endpoint').message)
  }

  try {
    await fs.chmod(endpointPath, 0o600)
  } catch (error) {
    throw endpointError(endpointPath, `unable to secure endpoint file: ${errorFrom(error, 'chmod failed').message}`)
  }

  let value: unknown
  try {
    value = JSON.parse(contents)
  } catch {
    throw endpointError(endpointPath, 'file is not valid JSON')
  }
  try {
    return normalizeEndpoint(value)
  } catch (error) {
    throw endpointError(endpointPath, errorFrom(error, 'invalid endpoint').message)
  }
}

async function removeEndpoint(endpointPath: string): Promise<void> {
  try {
    await fs.unlink(endpointPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      throw endpointError(endpointPath, `unable to remove stale endpoint: ${errorFrom(error, 'unlink failed').message}`)
    }
  }
}

function parseLockRecord(contents: string, lockPath: string): StartupLockRecord {
  let value: unknown
  try {
    value = JSON.parse(contents)
  } catch {
    value = contents.trim()
  }
  const pid = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : value && typeof value === 'object'
        ? (value as { pid?: unknown }).pid
        : undefined
  if (!positiveInteger(pid)) throw new Error(`Startup lock at ${lockPath} has an invalid owner PID`)
  const token = value && typeof value === 'object' && typeof (value as { token?: unknown }).token === 'string'
    ? (value as { token: string }).token
    : undefined
  return { pid, ...(token ? { token } : {}) }
}

async function readLockRecord(lockPath: string): Promise<StartupLockRecord | null | 'pending'> {
  let contents: string
  try {
    contents = await fs.readFile(lockPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null
    throw startupError(dirname(lockPath), `unable to read startup lock: ${errorFrom(error, 'read failed').message}`)
  }
  if (contents.trim().length === 0) return 'pending'
  try {
    return parseLockRecord(contents, lockPath)
  } catch (error) {
    throw startupError(dirname(lockPath), errorFrom(error, 'invalid startup lock').message)
  }
}

function startupLockPayload(pid: number, token: string): Buffer {
  const payload = Buffer.from(JSON.stringify({ pid, token }) + '\n', 'utf8')
  if (payload.length > STARTUP_LOCK_RECORD_BYTES) {
    throw new Error('Terminal daemon startup lock record is too large')
  }
  const padded = Buffer.alloc(STARTUP_LOCK_RECORD_BYTES, 0x20)
  payload.copy(padded)
  return padded
}

async function createStartupLock(lockPath: string): Promise<StartupLock | null> {
  try {
    const fileHandle = await fs.open(lockPath, 'wx', 0o600)
    const ownerToken = randomUUID()
    const payload = startupLockPayload(process.pid, ownerToken)
    await fileHandle.write(payload, 0, payload.length, 0)
    await fileHandle.chmod(0o600)
    return { fileHandle, path: lockPath, ownerPid: process.pid, ownerToken }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') return null
    throw startupError(dirname(lockPath), `unable to create startup lock: ${errorFrom(error, 'open failed').message}`)
  }
}

async function updateStartupLockOwner(lock: StartupLock, pid: number): Promise<void> {
  const payload = startupLockPayload(pid, lock.ownerToken)
  await lock.fileHandle.write(payload, 0, payload.length, 0)
  await lock.fileHandle.chmod(0o600)
  lock.ownerPid = pid
}

async function releaseStartupLock(lock: StartupLock, remove = true): Promise<void> {
  try {
    await lock.fileHandle.close()
  } catch {
    // Continue with path cleanup if the descriptor was already closed.
  }
  if (!remove) return

  let current: StartupLockRecord | null | 'pending'
  try {
    current = await readLockRecord(lock.path)
  } catch {
    return
  }
  if (current === null || current === 'pending'
    || current.pid !== lock.ownerPid
    || current.token !== lock.ownerToken) return

  try {
    await fs.unlink(lock.path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      // A replacement lock is safer to leave in place than to remove.
    }
  }
}

async function probeEndpoint(
  endpoint: TerminalDaemonEndpoint,
  clientOptions: TerminalDaemonClientOptions,
): Promise<EndpointProbeResult> {
  if (endpoint.version !== TERMINAL_DAEMON_PROTOCOL_VERSION) {
    if (isProcessAlive(endpoint.pid)) {
      return {
        kind: 'failed',
        error: new Error(
          `Terminal daemon at PID ${endpoint.pid} uses protocol version ${endpoint.version}; expected ${TERMINAL_DAEMON_PROTOCOL_VERSION}`,
        ),
      }
    }
    return { kind: 'stale' }
  }

  let client: TerminalDaemonClient
  try {
    client = await TerminalDaemonClient.connect(endpoint, clientOptions)
  } catch (error) {
    if (isProcessAlive(endpoint.pid)) {
      return {
        kind: 'failed',
        error: new Error(
          `Terminal daemon PID ${endpoint.pid} is alive but did not accept a connection: ${errorFrom(error, 'connection failed').message}`,
        ),
      }
    }
    return { kind: 'stale' }
  }

  try {
    const ping = await client.request('ping', undefined)
    if (!ping || typeof ping !== 'object'
      || (ping as { version?: unknown }).version !== TERMINAL_DAEMON_PROTOCOL_VERSION) {
      throw new Error(
        `Terminal daemon returned an incompatible protocol version ${(ping as { version?: unknown })?.version ?? 'unknown'}`,
      )
    }
    if ((ping as { pid?: unknown }).pid !== endpoint.pid) {
      throw new Error(
        `Terminal daemon endpoint PID ${endpoint.pid} does not match server PID ${(ping as { pid?: unknown }).pid ?? 'unknown'}`,
      )
    }
    return { kind: 'ready', client }
  } catch (error) {
    client.disconnect()
    if (isProcessAlive(endpoint.pid)) {
      return {
        kind: 'failed',
        error: new Error(
          `Terminal daemon PID ${endpoint.pid} is alive but did not complete the protocol handshake: ${errorFrom(error, 'ping failed').message}`,
        ),
      }
    }
    return { kind: 'stale' }
  }
}

async function awaitOtherStartup(
  directory: string,
  endpointPath: string,
  lockPath: string,
  deadline: number,
  clientOptions: TerminalDaemonClientOptions,
): Promise<TerminalDaemonClient | null> {
  while (remainingTime(deadline) > 0) {
    const endpoint = await readEndpoint(endpointPath)
    if (endpoint) {
      const probe = await probeEndpoint(endpoint, clientOptions)
      if (probe.kind === 'ready') return probe.client
      if (probe.kind === 'failed') throw startupError(directory, probe.error.message)
    }

    const owner = await readLockRecord(lockPath)
    if (owner === null) return null
    if (owner === 'pending') {
      await delay(Math.min(TERMINAL_DAEMON_POLL_INTERVAL_MS, remainingTime(deadline)))
      continue
    }
    if (!isProcessAlive(owner.pid)) {
      const current = await readLockRecord(lockPath)
      if (current === null) return null
      if (current === 'pending' || current.pid !== owner.pid
        || current.token !== owner.token) continue
      try {
        await fs.unlink(lockPath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
          throw startupError(directory, `unable to recover dead startup lock: ${errorFrom(error, 'unlink failed').message}`)
        }
      }
      return null
    }

    await delay(Math.min(TERMINAL_DAEMON_POLL_INTERVAL_MS, remainingTime(deadline)))
  }
  throw startupError(directory, 'another process owns startup.lock and did not publish a usable endpoint before the deadline')
}

async function launchDaemon(
  options: ConnectTerminalDaemonOptions,
): Promise<ChildProcess> {
  const appImagePath = options.appImagePath?.trim()
  const executable = appImagePath || options.executable
  const args = appImagePath
    ? ['-e', TERMINAL_DAEMON_APPIMAGE_BOOTSTRAP, options.directory]
    : [options.entryPath, options.directory]
  let child: ChildProcess
  try {
    child = spawn(executable, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
      },
    })
  } catch (error) {
    throw startupError(options.directory, `unable to launch ${executable}: ${errorFrom(error, 'spawn failed').message}`)
  }
  child.once('error', (error) => { childLaunchErrors.set(child, error) })
  child.unref()
  return child
}

async function startDaemon(
  options: ConnectTerminalDaemonOptions,
  lock: StartupLock,
  endpointPath: string,
  deadline: number,
  clientOptions: TerminalDaemonClientOptions,
  onSpawned: (pid: number | undefined) => void,
): Promise<{ client: TerminalDaemonClient; childPid?: number }> {
  const child = await launchDaemon(options)
  const childPid = child.pid && positiveInteger(child.pid) ? child.pid : undefined
  onSpawned(childPid)
  if (childPid) await updateStartupLockOwner(lock, childPid)

  let lastFailure = ''
  while (remainingTime(deadline) > 0) {
    const launchError = childLaunchErrors.get(child)
    if (launchError) {
      throw startupError(options.directory, `daemon launch failed: ${launchError.message}`)
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      throw startupError(options.directory, `daemon process ${childPid ?? 'unknown'} exited before publishing endpoint.json`)
    }

    let endpoint: TerminalDaemonEndpoint | null
    try {
      endpoint = await readEndpoint(endpointPath)
    } catch (error) {
      lastFailure = errorFrom(error, 'endpoint read failed').message
      await delay(Math.min(TERMINAL_DAEMON_POLL_INTERVAL_MS, remainingTime(deadline)))
      continue
    }
    if (!endpoint) {
      await delay(Math.min(TERMINAL_DAEMON_POLL_INTERVAL_MS, remainingTime(deadline)))
      continue
    }

    const probe = await probeEndpoint(endpoint, clientOptions)
    if (probe.kind === 'ready') return { client: probe.client, childPid }
    if (probe.kind === 'failed') {
      throw startupError(options.directory, probe.error.message)
    }
    lastFailure = 'daemon published a stale endpoint'
    await delay(Math.min(TERMINAL_DAEMON_POLL_INTERVAL_MS, remainingTime(deadline)))
  }

  const suffix = lastFailure ? ` Last error: ${lastFailure}` : ''
  throw startupError(
    options.directory,
    `daemon did not publish a responsive endpoint.json within ${options.startupTimeoutMs ?? TERMINAL_DAEMON_STARTUP_TIMEOUT_MS} ms.${suffix}`,
  )
}

export interface StopTerminalDaemonOptions {
  directory: string
  timeoutMs?: number
  killProcessTree?: (pid: number) => Promise<void>
}

function killProcessTree(pid: number): Promise<void> {
  if (process.platform !== 'win32') {
    process.kill(pid, 'SIGTERM')
    return Promise.resolve()
  }
  // The daemon owns the PTY shells and console hosts. All of them must exit
  // before the installer can replace files in the installation directory.
  return new Promise((resolveKill, reject) => {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, (error) => {
      if (error && isProcessAlive(pid)) reject(error)
      else resolveKill()
    })
  })
}

/**
 * Stop the daemon and every PTY it owns. Sessions are lost. The updater uses
 * it because a live daemon keeps the application executable in use.
 */
export async function stopTerminalDaemon(options: StopTerminalDaemonOptions): Promise<boolean> {
  const endpointPath = join(resolve(options.directory), TERMINAL_DAEMON_ENDPOINT_FILE)
  let endpoint: TerminalDaemonEndpoint | null
  try {
    endpoint = await readEndpoint(endpointPath)
  } catch {
    return false
  }
  if (!endpoint || endpoint.pid === process.pid || !isProcessAlive(endpoint.pid)) return false

  const timeoutMs = normalizeTimeout(options.timeoutMs, TERMINAL_DAEMON_REQUEST_TIMEOUT_MS)
  const deadline = Date.now() + timeoutMs
  // Graceful first, so shells close their PTYs. Older daemons reject the method.
  const gracefulDeadline = Date.now() + Math.floor(timeoutMs / 2)
  if (await requestDaemonShutdown(endpoint, gracefulDeadline)
    && await waitForProcessExit(endpoint.pid, gracefulDeadline)) {
    await removeEndpoint(endpointPath)
    return true
  }

  await (options.killProcessTree ?? killProcessTree)(endpoint.pid)
  if (!await waitForProcessExit(endpoint.pid, deadline)) {
    throw new Error(`Terminal daemon PID ${endpoint.pid} did not exit`)
  }
  await removeEndpoint(endpointPath)
  return true
}

async function requestDaemonShutdown(endpoint: TerminalDaemonEndpoint, deadline: number): Promise<boolean> {
  const timeoutMs = remainingTime(deadline)
  if (timeoutMs === 0) return false
  let client: TerminalDaemonClient | undefined
  try {
    client = await TerminalDaemonClient.connect(endpoint, {
      connectTimeoutMs: Math.min(TERMINAL_DAEMON_CONNECT_TIMEOUT_MS, timeoutMs),
      requestTimeoutMs: timeoutMs,
    })
    await client.request('shutdown', undefined)
    return true
  } catch {
    return false
  } finally {
    client?.disconnect()
  }
}

async function waitForProcessExit(pid: number, deadline: number): Promise<boolean> {
  while (isProcessAlive(pid)) {
    if (remainingTime(deadline) === 0) return false
    await delay(Math.min(TERMINAL_DAEMON_POLL_INTERVAL_MS, remainingTime(deadline)))
  }
  return true
}

const startupPromises = new Map<string, Promise<TerminalDaemonClient>>()

export function connectTerminalDaemon(options: ConnectTerminalDaemonOptions): Promise<TerminalDaemonClient> {
  const directory = resolve(options.directory)
  const existing = startupPromises.get(directory)
  if (existing) return existing

  const startup = connectOrStartTerminalDaemon({ ...options, directory }).finally(() => {
    if (startupPromises.get(directory) === startup) startupPromises.delete(directory)
  })
  startupPromises.set(directory, startup)
  return startup
}

async function connectOrStartTerminalDaemon(options: ConnectTerminalDaemonOptions): Promise<TerminalDaemonClient> {
  const startupTimeoutMs = normalizeTimeout(
    options.startupTimeoutMs,
    TERMINAL_DAEMON_STARTUP_TIMEOUT_MS,
  )
  const deadline = Date.now() + startupTimeoutMs
  const endpointPath = join(options.directory, TERMINAL_DAEMON_ENDPOINT_FILE)
  const lockPath = join(options.directory, TERMINAL_DAEMON_STARTUP_LOCK_FILE)
  const clientOptions: TerminalDaemonClientOptions = {
    connectTimeoutMs: Math.min(TERMINAL_DAEMON_CONNECT_TIMEOUT_MS, startupTimeoutMs),
    requestTimeoutMs: Math.min(TERMINAL_DAEMON_REQUEST_TIMEOUT_MS, startupTimeoutMs),
  }

  await ensurePrivateDirectory(options.directory)

  const initialEndpoint = await readEndpoint(endpointPath)
  if (initialEndpoint) {
    const probe = await probeEndpoint(initialEndpoint, clientOptions)
    if (probe.kind === 'ready') return probe.client
    if (probe.kind === 'failed') throw startupError(options.directory, probe.error.message)
  }

  while (remainingTime(deadline) > 0) {
    const lock = await createStartupLock(lockPath)
    if (!lock) {
      const other = await awaitOtherStartup(
        options.directory,
        endpointPath,
        lockPath,
        deadline,
        clientOptions,
      )
      if (other) return other
      continue
    }

    let childPid: number | undefined
    let retainLock = false
    try {
      const endpoint = await readEndpoint(endpointPath)
      if (endpoint) {
        const probe = await probeEndpoint(endpoint, clientOptions)
        if (probe.kind === 'ready') return probe.client
        if (probe.kind === 'failed') throw startupError(options.directory, probe.error.message)
        await removeEndpoint(endpointPath)
      }

      const started = await startDaemon(
        options,
        lock,
        endpointPath,
        deadline,
        clientOptions,
        (pid) => { childPid = pid },
      )
      return started.client
    } catch (error) {
      if (childPid && isProcessAlive(childPid)) retainLock = true
      throw error
    } finally {
      await releaseStartupLock(lock, !retainLock)
    }
  }

  throw startupError(options.directory, 'startup deadline expired')
}
