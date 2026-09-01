import * as dgram from 'node:dgram'
import { setTimeout as setTimeoutPromise } from 'node:timers/promises'

import type { WakeOnLanConfig } from '@shared/types'

const MAC_PATTERN = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i
const HYPHEN_MAC_PATTERN = /^(?:[0-9a-f]{2}-){5}[0-9a-f]{2}$/i
const DEFAULT_BROADCAST_ADDRESS = '255.255.255.255'
const DEFAULT_PORT = 9
const PACKET_REPETITIONS = 16
const PACKET_HEADER_LENGTH = 6
const SEND_COUNT = 3
const SEND_INTERVAL_MS = 250

export interface WakeOnLanSocket {
  bind: (callback: () => void) => void
  once: (event: 'error', listener: (error: Error) => void) => void
  removeListener: (event: 'error', listener: (error: Error) => void) => void
  setBroadcast: (enabled: boolean) => void
  send: (
    message: Uint8Array,
    port: number,
    address: string,
    callback: (error: Error | null) => void,
  ) => void
  close: () => void
}

export interface WakeOnLanDependencies {
  createSocket?: (type: 'udp4') => WakeOnLanSocket
  delay?: (milliseconds: number) => Promise<void>
}

export function parseMacAddress(macAddress: string): Uint8Array {
  if (typeof macAddress !== 'string') {
    throw new Error('Invalid Wake-on-LAN MAC address')
  }

  const isCanonical = MAC_PATTERN.test(macAddress)
  const isHyphenated = HYPHEN_MAC_PATTERN.test(macAddress)
  if (!isCanonical && !isHyphenated) {
    throw new Error('Invalid Wake-on-LAN MAC address')
  }

  const normalized = macAddress.replace(/-/g, ':')
  return Uint8Array.from(normalized.split(':').map((part) => Number.parseInt(part, 16)))
}

export function buildMagicPacket(macAddress: string): Buffer {
  const mac = parseMacAddress(macAddress)
  const packet = Buffer.alloc(PACKET_HEADER_LENGTH + mac.length * PACKET_REPETITIONS, 0xff)

  for (let repetition = 0; repetition < PACKET_REPETITIONS; repetition += 1) {
    packet.set(mac, PACKET_HEADER_LENGTH + repetition * mac.length)
  }

  return packet
}

function createDefaultSocket(): WakeOnLanSocket {
  const socket = dgram.createSocket('udp4')
  return {
    bind: (callback) => {
      socket.bind(callback)
    },
    once: (event, listener) => {
      socket.once(event, listener)
    },
    removeListener: (event, listener) => {
      socket.removeListener(event, listener)
    },
    setBroadcast: (enabled) => {
      socket.setBroadcast(enabled)
    },
    send: (message, port, address, callback) => {
      socket.send(message, port, address, (error) => callback(error))
    },
    close: () => {
      socket.close()
    },
  }
}

interface BindWait {
  promise: Promise<void>
  socketError: Promise<never>
  getSocketError: () => Error | undefined
  cleanup: () => void
}

function waitForBind(socket: WakeOnLanSocket): BindWait {
  let bindSettled = false
  let socketFailure: Error | undefined
  let resolveBind!: () => void
  let rejectBind!: (error: Error) => void
  let rejectSocketError!: (error: Error) => void
  const promise = new Promise<void>((resolve, reject) => {
    resolveBind = resolve
    rejectBind = reject
  })
  const socketError = new Promise<never>((_resolve, reject) => {
    rejectSocketError = reject
  })
  void socketError.catch(() => undefined)
  const onError = (error: Error): void => {
    socketFailure ??= error
    rejectSocketError(error)
    if (bindSettled) return
    bindSettled = true
    rejectBind(error)
  }
  const onBound = (): void => {
    if (bindSettled) return
    bindSettled = true
    resolveBind()
  }
  function cleanup(): void {
    try {
      socket.removeListener('error', onError)
    } catch {
      // Cleanup must not replace the bind result.
    }
  }

  try {
    socket.once('error', onError)
    socket.bind(onBound)
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
  }

  return {
    promise,
    socketError,
    getSocketError: () => socketFailure,
    cleanup,
  }
}

function throwIfSocketError(bindWait: BindWait): void {
  const error = bindWait.getSocketError()
  if (error) throw error
}

function sendPacket(
  socket: WakeOnLanSocket,
  packet: Buffer,
  port: number,
  address: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.send(packet, port, address, (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

export async function sendWakeOnLan(
  config: WakeOnLanConfig,
  dependencies: WakeOnLanDependencies = {},
): Promise<void> {
  const packet = buildMagicPacket(config.macAddress)
  const broadcastAddress = config.broadcastAddress || DEFAULT_BROADCAST_ADDRESS
  const port = config.port ?? DEFAULT_PORT
  const socket = (dependencies.createSocket ?? (() => createDefaultSocket()))('udp4')
  const delay = dependencies.delay ?? (async (milliseconds: number) => {
    await setTimeoutPromise(milliseconds)
  })
  let closed = false

  const close = (): void => {
    if (closed) return
    closed = true
    socket.close()
  }

  let operationFailed = false
  let bindWait: BindWait | undefined
  try {
    const currentBindWait = waitForBind(socket)
    bindWait = currentBindWait
    await Promise.race([currentBindWait.promise, currentBindWait.socketError])
    throwIfSocketError(currentBindWait)
    socket.setBroadcast(true)
    throwIfSocketError(currentBindWait)

    for (let attempt = 0; attempt < SEND_COUNT; attempt += 1) {
      throwIfSocketError(currentBindWait)
      await Promise.race([
        sendPacket(socket, packet, port, broadcastAddress),
        currentBindWait.socketError,
      ])
      throwIfSocketError(currentBindWait)
      if (attempt < SEND_COUNT - 1) {
        await Promise.race([delay(SEND_INTERVAL_MS), currentBindWait.socketError])
        throwIfSocketError(currentBindWait)
      }
    }
  } catch (error) {
    operationFailed = true
    throw error
  } finally {
    try {
      close()
    } catch (error) {
      if (!operationFailed) throw error
    } finally {
      bindWait?.cleanup()
    }
  }
}
