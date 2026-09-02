import * as net from 'node:net'
import { setTimeout as setTimeoutPromise } from 'node:timers/promises'

import type {
  RemotePreparationResult,
  RemoteTerminalConfig,
  WakeOnLanConfig,
} from '@shared/types'
import { sendWakeOnLan } from './wake-on-lan'

const DEFAULT_SSH_PORT = 22
const DEFAULT_SSH_TIMEOUT_MS = 1500
const SSH_POLL_INTERVAL_MS = 2000
const SSH_STARTUP_TIMEOUT_MS = 60_000

export type RemoteSshProbeResult = 'available' | 'refused' | 'unreachable' | 'invalid-host'

export type RemoteSshSocketEvent = 'connect' | 'error' | 'timeout'
export type RemoteSshSocketListener = (() => void) | ((error: Error) => void)

export interface RemoteSshSocket {
  once: (event: RemoteSshSocketEvent, listener: RemoteSshSocketListener) => void
  removeListener: (event: RemoteSshSocketEvent, listener: RemoteSshSocketListener) => void
  setTimeout: (milliseconds: number, callback: () => void) => void
  destroy: () => void
}

export interface RemoteSshConnectionOptions {
  host: string
  port: number
}

export type RemoteSshProbeTarget = Pick<RemoteTerminalConfig, 'host' | 'port'>

export interface RemoteSshProbeDependencies {
  createConnection?: (options: RemoteSshConnectionOptions) => RemoteSshSocket
}

export interface RemoteSshReadinessDependencies extends RemoteSshProbeDependencies {
  probe?: (target: RemoteTerminalConfig) => Promise<RemoteSshProbeResult>
  wake?: (config: WakeOnLanConfig) => Promise<void>
  delay?: (milliseconds: number) => Promise<void>
  now?: () => number
}

export type EnsureRemoteSshReadyDependencies = RemoteSshReadinessDependencies

function createDefaultConnection(options: RemoteSshConnectionOptions): RemoteSshSocket {
  return net.createConnection(options) as unknown as RemoteSshSocket
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined

  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code.toUpperCase() : undefined
}

function classifySocketError(error: unknown): RemoteSshProbeResult | undefined {
  switch (getErrorCode(error)) {
    case 'ECONNREFUSED':
      return 'refused'
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
    case 'ETIMEDOUT':
      return 'unreachable'
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'invalid-host'
    default:
      return undefined
  }
}

function isValidProbeTarget(target: RemoteSshProbeTarget): boolean {
  if (typeof target?.host !== 'string') return false

  const host = target.host.trim()
  if (!host || /\s/.test(host) || host.startsWith('-')) return false

  const port = target.port
  return port === undefined || Number.isInteger(port) && port >= 1 && port <= 65535
}

function removeSocketListener(
  socket: RemoteSshSocket,
  event: RemoteSshSocketEvent,
  listener: RemoteSshSocketListener,
): void {
  try {
    socket.removeListener(event, listener)
  } catch {
    // Cleanup must not replace the probe result.
  }
}

function disableSocketTimeout(socket: RemoteSshSocket): void {
  try {
    socket.setTimeout(0, () => undefined)
  } catch {
    // Cleanup must not replace the probe result.
  }
}

function destroySocket(socket: RemoteSshSocket): void {
  try {
    socket.destroy()
  } catch {
    // Cleanup must not replace the probe result.
  }
}

export async function probeRemoteSsh(
  target: RemoteSshProbeTarget,
  dependencies: RemoteSshProbeDependencies = {},
): Promise<RemoteSshProbeResult> {
  if (!isValidProbeTarget(target)) return 'invalid-host'

  const host = target.host.trim()
  const port = target.port ?? DEFAULT_SSH_PORT
  const createConnection = dependencies.createConnection ?? createDefaultConnection
  const socket = createConnection({ host, port })

  return new Promise<RemoteSshProbeResult>((resolve, reject) => {
    let settled = false

    const cleanup = (): void => {
      disableSocketTimeout(socket)
      destroySocket(socket)
      removeSocketListener(socket, 'connect', onConnect)
      removeSocketListener(socket, 'error', onError)
      removeSocketListener(socket, 'timeout', onTimeout)
    }

    const finish = (result: RemoteSshProbeResult): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    const fail = (error: unknown): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }

    const onConnect = (): void => finish('available')
    const onTimeout = (): void => finish('unreachable')
    const onError = (error: Error): void => {
      const result = classifySocketError(error)
      if (result) {
        finish(result)
        return
      }
      fail(error)
    }

    try {
      socket.once('connect', onConnect)
      if (settled) return
      socket.once('error', onError)
      if (settled) return
      socket.once('timeout', onTimeout)
      if (settled) return
      socket.setTimeout(DEFAULT_SSH_TIMEOUT_MS, onTimeout)
    } catch (error) {
      fail(error)
    }
  })
}

function createStableError(message: string, cause?: unknown): Error {
  if (cause === undefined) return new Error(message)
  return new Error(message, { cause })
}

function createDefaultDelay(milliseconds: number): Promise<void> {
  return setTimeoutPromise(milliseconds).then(() => undefined)
}

export async function ensureRemoteSshReady(
  target: RemoteTerminalConfig,
  dependencies: RemoteSshReadinessDependencies = {},
): Promise<RemotePreparationResult> {
  const wakeOnLan = target.wakeOnLan
  if (!wakeOnLan?.enabled) return { status: 'disabled', wakeSent: false }

  const probe = dependencies.probe ?? ((candidate: RemoteTerminalConfig) => probeRemoteSsh(candidate, {
    createConnection: dependencies.createConnection,
  }))
  const wake = dependencies.wake ?? sendWakeOnLan
  const delay = dependencies.delay ?? createDefaultDelay
  const now = dependencies.now ?? Date.now
  const initialResult = await probe(target)

  if (initialResult === 'available') return { status: 'available', wakeSent: false }
  if (initialResult === 'refused') return { status: 'host-online', wakeSent: false }
  if (initialResult === 'invalid-host') {
    throw createStableError('No se pudo resolver el host remoto')
  }

  try {
    await wake(wakeOnLan)
  } catch (error) {
    throw createStableError('No se pudo enviar Wake-on-LAN', error)
  }

  const deadline = now() + SSH_STARTUP_TIMEOUT_MS
  while (true) {
    if (now() >= deadline) {
      throw createStableError('La computadora remota no habilitó SSH en 60 segundos')
    }

    await delay(SSH_POLL_INTERVAL_MS)
    if (now() >= deadline) {
      throw createStableError('La computadora remota no habilitó SSH en 60 segundos')
    }

    const result = await probe(target)
    if (result === 'available') return { status: 'woken', wakeSent: true }
    if (result === 'invalid-host') {
      throw createStableError('No se pudo resolver el host remoto')
    }
  }
}
