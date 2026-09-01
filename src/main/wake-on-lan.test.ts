import assert from 'node:assert/strict'
import test from 'node:test'

import { buildMagicPacket, sendWakeOnLan } from './wake-on-lan'

test('builds the 102-byte Wake-on-LAN magic packet', () => {
  const packet = buildMagicPacket('AA:BB:CC:DD:EE:FF')
  const mac = Buffer.from('AABBCCDDEEFF', 'hex')

  assert.equal(packet.length, 102)
  assert.deepEqual(packet.subarray(0, 6), Buffer.alloc(6, 0xff))
  for (let offset = 6; offset < packet.length; offset += 6) {
    assert.deepEqual(packet.subarray(offset, offset + 6), mac)
  }
})

test('rejects an incomplete Wake-on-LAN MAC address', () => {
  assert.throws(
    () => buildMagicPacket('AA:BB:CC:DD:EE'),
    { message: 'Invalid Wake-on-LAN MAC address' },
  )
})

test('rejects a MAC address with mixed separators', () => {
  assert.throws(
    () => buildMagicPacket('AA:BB-CC:DD-EE:FF'),
    { message: 'Invalid Wake-on-LAN MAC address' },
  )
})

test('binds before broadcast and sends three packets with normalized defaults', async () => {
  const events: string[] = []
  const sent: Array<{ message: Uint8Array; port: number; address: string }> = []
  const delays: number[] = []
  const socket = {
    bind(callback: () => void) {
      events.push('bind')
      callback()
    },
    once(event: 'error', _listener: (error: Error) => void) {
      events.push(`once:${event}`)
    },
    removeListener(event: 'error', _listener: (error: Error) => void) {
      events.push(`remove:${event}`)
    },
    setBroadcast(enabled: boolean) {
      events.push(`broadcast:${enabled}`)
    },
    send(
      message: Uint8Array,
      port: number,
      address: string,
      callback: (error: Error | null) => void,
    ) {
      const index = sent.length
      events.push(`send:${index}`)
      sent.push({ message, port, address })
      queueMicrotask(() => {
        events.push(`complete:${index}`)
        callback(null)
      })
    },
    close() {
      events.push('close')
    },
  }

  await sendWakeOnLan(
    { enabled: true, macAddress: 'AA:BB:CC:DD:EE:FF' },
    {
      createSocket: () => socket,
      delay: async (milliseconds) => {
        delays.push(milliseconds)
        events.push(`delay:${milliseconds}`)
      },
    },
  )

  const mac = Buffer.from('AABBCCDDEEFF', 'hex')
  const expectedPacket = Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => mac)])
  assert.deepEqual(events, [
    'once:error',
    'bind',
    'remove:error',
    'broadcast:true',
    'send:0',
    'complete:0',
    'delay:250',
    'send:1',
    'complete:1',
    'delay:250',
    'send:2',
    'complete:2',
    'close',
  ])
  assert.deepEqual(delays, [250, 250])
  assert.equal(sent.length, 3)
  for (const packet of sent) {
    assert.deepEqual(packet.message, expectedPacket)
    assert.equal(packet.port, 9)
    assert.equal(packet.address, '255.255.255.255')
  }
})

test('closes the socket once when sending fails', async () => {
  const failure = new Error('UDP send failed')
  let sends = 0
  let closeCalls = 0
  const socket = {
    bind(callback: () => void) {
      callback()
    },
    once(_event: 'error', _listener: (error: Error) => void) {
      // The fake models the dgram boundary only.
    },
    removeListener(_event: 'error', _listener: (error: Error) => void) {
      // The fake models the dgram boundary only.
    },
    setBroadcast(_enabled: boolean) {
      // The fake models the dgram boundary only.
    },
    send(
      _message: Uint8Array,
      _port: number,
      _address: string,
      callback: (error: Error | null) => void,
    ) {
      sends += 1
      callback(failure)
    },
    close() {
      closeCalls += 1
    },
  }

  await assert.rejects(
    sendWakeOnLan(
      { enabled: true, macAddress: 'AA:BB:CC:DD:EE:FF' },
      { createSocket: () => socket, delay: async () => undefined },
    ),
    { message: 'UDP send failed' },
  )
  assert.equal(sends, 1)
  assert.equal(closeCalls, 1)
})

test('rejects and closes when the socket emits a bind error', async () => {
  const bindError = new Error('UDP bind failed')
  let bindErrorListener: ((error: Error) => void) | undefined
  let removeListenerCalls = 0
  let closeCalls = 0
  const socket = {
    bind(_callback: () => void) {
      queueMicrotask(() => bindErrorListener?.(bindError))
    },
    once(event: 'error', listener: (error: Error) => void) {
      assert.equal(event, 'error')
      bindErrorListener = listener
    },
    removeListener(event: 'error', listener: (error: Error) => void) {
      assert.equal(event, 'error')
      removeListenerCalls += 1
      if (bindErrorListener === listener) bindErrorListener = undefined
    },
    setBroadcast(_enabled: boolean) {
      throw new Error('setBroadcast must not run after bind failure')
    },
    send(
      _message: Uint8Array,
      _port: number,
      _address: string,
      _callback: (error: Error | null) => void,
    ) {
      throw new Error('send must not run after bind failure')
    },
    close() {
      closeCalls += 1
      throw Object.assign(new Error('Socket is not running'), {
        code: 'ERR_SOCKET_DGRAM_NOT_RUNNING',
      })
    },
  }

  const operation = sendWakeOnLan(
    { enabled: true, macAddress: 'AA:BB:CC:DD:EE:FF' },
    { createSocket: () => socket, delay: async () => undefined },
  )
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('bind test timed out')), 50)
  })

  await assert.rejects(Promise.race([operation, timeout]), { message: bindError.message })
  assert.equal(removeListenerCalls, 1)
  assert.equal(closeCalls, 1)
})
