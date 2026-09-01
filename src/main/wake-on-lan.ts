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

function waitForBind(socket: WakeOnLanSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const onError = (error: Error): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const onBound = (): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    function cleanup(): void {
      try {
        socket.removeListener('error', onError)
      } catch {
        // Cleanup must not replace the bind result.
      }
    }

    socket.once('error', onError)
    try {
      socket.bind(onBound)
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
    }
  })
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
  try {
    await waitForBind(socket)
    socket.setBroadcast(true)

    for (let attempt = 0; attempt < SEND_COUNT; attempt += 1) {
      await sendPacket(socket, packet, port, broadcastAddress)
      if (attempt < SEND_COUNT - 1) await delay(SEND_INTERVAL_MS)
    }
  } catch (error) {
    operationFailed = true
    throw error
  } finally {
    try {
      close()
    } catch (error) {
      if (!operationFailed) throw error
    }
  }
}
