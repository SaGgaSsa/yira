import assert from 'node:assert/strict'
import * as net from 'node:net'
import test from 'node:test'

import {
  ensureRemoteSshReady,
  probeRemoteSsh,
  type RemoteSshSocket,
} from './remote-host-readiness'
import type { RemoteTerminalConfig } from '@shared/types'

type SocketEvent = 'connect' | 'error' | 'timeout'
type SocketListener = (() => void) | ((error: Error) => void)

interface FakeSocket extends RemoteSshSocket {
  destroyed: boolean
  destroyCalls: number
  timeoutCalls: number[]
  emit: (event: SocketEvent, error?: Error) => void
  listenerCount: (event: SocketEvent) => number
}

function createFakeSocket(): FakeSocket {
  const listeners = new Map<SocketEvent, Set<SocketListener>>()
  const socket: FakeSocket = {
    destroyed: false,
    destroyCalls: 0,
    timeoutCalls: [],
    once(event, listener) {
      const eventListeners = listeners.get(event) ?? new Set<SocketListener>()
      eventListeners.add(listener)
      listeners.set(event, eventListeners)
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener)
    },
    setTimeout(milliseconds, callback) {
      socket.timeoutCalls.push(milliseconds)
      if (callback) {
        const timeoutListeners = listeners.get('timeout') ?? new Set<SocketListener>()
        timeoutListeners.add(callback)
        listeners.set('timeout', timeoutListeners)
      }
    },
    destroy() {
      socket.destroyCalls += 1
      socket.destroyed = true
    },
    emit(event, error) {
      const eventListeners = [...(listeners.get(event) ?? [])]
      for (const listener of eventListeners) {
        if (event === 'error') {
          (listener as (error: Error) => void)(error ?? new Error('socket error'))
        } else {
          (listener as () => void)()
        }
      }
    },
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0
    },
  }

  return socket
}

function remoteConfig(wakeOnLan = true): RemoteTerminalConfig {
  return {
    host: '192.168.1.40',
    user: 'dev',
    wakeOnLan: {
      enabled: wakeOnLan,
      macAddress: 'AA:BB:CC:DD:EE:FF',
    },
  }
}

test('classifies a successful TCP connection as available and cleans up once', async () => {
  const socket = createFakeSocket()
  let options: { host: string; port: number } | undefined

  const resultPromise = probeRemoteSsh(
    { host: '192.168.1.40' },
    {
      createConnection: (connectionOptions) => {
        options = connectionOptions
        queueMicrotask(() => socket.emit('connect'))
        return socket
      },
    },
  )

  assert.equal(await resultPromise, 'available')
  assert.deepEqual(options, { host: '192.168.1.40', port: 22 })
  assert.equal(socket.destroyed, true)
  assert.equal(socket.destroyCalls, 1)
  assert.deepEqual(socket.timeoutCalls, [1500, 0])
  assert.equal(socket.listenerCount('connect'), 0)
  assert.equal(socket.listenerCount('error'), 0)
  assert.equal(socket.listenerCount('timeout'), 0)

  socket.emit('connect')
  socket.emit('error', Object.assign(new Error('late failure'), { code: 'ECONNREFUSED' }))
  assert.equal(socket.destroyCalls, 1)
})

test('removes the timeout callback listener after a successful probe', async () => {
  const socket = new net.Socket()
  const result = probeRemoteSsh(
    { host: '192.168.1.40' },
    {
      createConnection: () => {
        queueMicrotask(() => socket.emit('connect'))
        return socket
      },
    },
  )

  assert.equal(await result, 'available')
  assert.equal(socket.listenerCount('timeout'), 0)
})

test('classifies ECONNREFUSED as refused and destroys the socket', async () => {
  const socket = createFakeSocket()
  const result = probeRemoteSsh(
    { host: 'remote.example.test', port: 2200 },
    {
      createConnection: () => {
        queueMicrotask(() => socket.emit('error', Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })))
        return socket
      },
    },
  )

  assert.equal(await result, 'refused')
  assert.equal(socket.destroyCalls, 1)
  assert.deepEqual(socket.timeoutCalls, [1500, 0])
})

test('classifies unreachable TCP errors and timeout as unreachable', async () => {
  for (const code of ['EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT']) {
    const socket = createFakeSocket()
    const result = probeRemoteSsh(
      { host: 'remote.example.test' },
      {
        createConnection: () => {
          queueMicrotask(() => socket.emit('error', Object.assign(new Error(code), { code })))
          return socket
        },
      },
    )

    assert.equal(await result, 'unreachable', code)
    assert.equal(socket.destroyCalls, 1, code)
  }

  const socket = createFakeSocket()
  const result = probeRemoteSsh(
    { host: 'remote.example.test' },
    {
      createConnection: () => {
        queueMicrotask(() => socket.emit('timeout'))
        return socket
      },
    },
  )

  assert.equal(await result, 'unreachable')
  assert.equal(socket.destroyCalls, 1)
})

test('classifies DNS resolution errors as invalid-host', async () => {
  for (const code of ['ENOTFOUND', 'EAI_AGAIN']) {
    const socket = createFakeSocket()
    const result = probeRemoteSsh(
      { host: 'remote.example.test' },
      {
        createConnection: () => {
          queueMicrotask(() => socket.emit('error', Object.assign(new Error(code), { code })))
          return socket
        },
      },
    )

    assert.equal(await result, 'invalid-host', code)
    assert.equal(socket.destroyCalls, 1, code)
  }
})

test('propagates unknown TCP errors after destroying the socket', async () => {
  const socket = createFakeSocket()
  const failure = Object.assign(new Error('permission denied'), { code: 'EACCES' })
  const result = probeRemoteSsh(
    { host: 'remote.example.test' },
    {
      createConnection: () => {
        queueMicrotask(() => socket.emit('error', failure))
        return socket
      },
    },
  )

  await assert.rejects(result, (error) => error === failure)
  assert.equal(socket.destroyCalls, 1)
})

test('returns disabled without probing when Wake-on-LAN is disabled', async () => {
  let probeCalls = 0
  let wakeCalls = 0

  const result = await ensureRemoteSshReady(remoteConfig(false), {
    probe: async () => {
      probeCalls += 1
      return 'available'
    },
    wake: async () => {
      wakeCalls += 1
    },
  })

  assert.deepEqual(result, { status: 'disabled', wakeSent: false })
  assert.equal(probeCalls, 0)
  assert.equal(wakeCalls, 0)
})

test('returns available and host-online without Wake-on-LAN when the initial probe succeeds or is refused', async () => {
  let wakeCalls = 0
  const dependencies = {
    wake: async () => {
      wakeCalls += 1
    },
    delay: async () => undefined,
  }

  assert.deepEqual(
    await ensureRemoteSshReady(remoteConfig(), { ...dependencies, probe: async () => 'available' }),
    { status: 'available', wakeSent: false },
  )
  assert.deepEqual(
    await ensureRemoteSshReady(remoteConfig(), { ...dependencies, probe: async () => 'refused' }),
    { status: 'host-online', wakeSent: false },
  )
  assert.equal(wakeCalls, 0)
})

test('returns a stable error for an invalid initial host without sending Wake-on-LAN', async () => {
  let wakeCalls = 0

  await assert.rejects(
    ensureRemoteSshReady(remoteConfig(), {
      probe: async () => 'invalid-host',
      wake: async () => {
        wakeCalls += 1
      },
    }),
    { message: 'No se pudo resolver el host remoto' },
  )
  assert.equal(wakeCalls, 0)
})

test('wakes an unreachable host and waits until SSH is available', async () => {
  const probes: Array<'unreachable' | 'refused' | 'available'> = ['unreachable', 'refused', 'available']
  const delays: number[] = []
  let wakeCalls = 0
  let clock = 0

  const result = await ensureRemoteSshReady(remoteConfig(), {
    probe: async () => probes.shift() ?? 'available',
    wake: async () => {
      wakeCalls += 1
    },
    delay: async (milliseconds) => {
      delays.push(milliseconds)
      clock += milliseconds
    },
    now: () => clock,
  })

  assert.deepEqual(result, { status: 'woken', wakeSent: true })
  assert.equal(wakeCalls, 1)
  assert.deepEqual(delays, [2000, 2000])
})

test('wraps Wake-on-LAN errors with a stable message and cause', async () => {
  const failure = new Error('UDP send failed')

  await assert.rejects(
    ensureRemoteSshReady(remoteConfig(), {
      probe: async () => 'unreachable',
      wake: async () => {
        throw failure
      },
    }),
    (error) => {
      assert.equal(error instanceof Error, true)
      const actual = error as Error & { cause?: unknown }
      assert.equal(actual.message, 'No se pudo enviar Wake-on-LAN')
      assert.equal(actual.cause, failure)
      return true
    },
  )
})

test('fails with a stable timeout after 60 seconds of SSH polling', async () => {
  let clock = 0
  let wakeCalls = 0
  const delays: number[] = []

  await assert.rejects(
    ensureRemoteSshReady(remoteConfig(), {
      probe: async () => 'unreachable',
      wake: async () => {
        wakeCalls += 1
      },
      delay: async (milliseconds) => {
        delays.push(milliseconds)
        clock += milliseconds
      },
      now: () => clock,
    }),
    { message: 'La computadora remota no habilitó SSH en 60 segundos' },
  )
  assert.equal(wakeCalls, 1)
  assert.equal(delays.length, 30)
  assert.equal(delays.every((milliseconds) => milliseconds === 2000), true)
})
