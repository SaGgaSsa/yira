import assert from 'node:assert/strict'
import test from 'node:test'
import { WindowBridgeRequestBroker, type RendererRequestTarget } from './windowBridgeRequestBroker'

function createTarget(id: number, sent: unknown[], destroyed = false): RendererRequestTarget {
  return {
    id,
    isDestroyed: () => destroyed,
    send: (_channel, payload) => { sent.push(payload) },
  }
}

test('request waits for every live renderer and ignores destroyed targets', async () => {
  const sent: Array<{ requestId: string; phase: 'flush' | 'persist' }> = []
  const broker = new WindowBridgeRequestBroker()
  const request = broker.request([
    createTarget(1, sent),
    createTarget(2, sent, true),
    createTarget(3, sent),
  ], 'flush', 50)

  assert.equal(sent.length, 2)
  broker.respond(1, { ...sent[0], ok: true })
  let settled = false
  void request.then(() => { settled = true })
  await Promise.resolve()
  assert.equal(settled, false)

  broker.respond(3, { ...sent[1], ok: true })
  await request
})

test('renderer failure rejects the request with its message', async () => {
  const sent: Array<{ requestId: string; phase: 'flush' | 'persist' }> = []
  const broker = new WindowBridgeRequestBroker()
  const request = broker.request([createTarget(4, sent)], 'persist', 50)

  broker.respond(4, { ...sent[0], ok: false, error: 'workspace write failed' })

  await assert.rejects(request, /workspace write failed/)
})

test('request timeout cleans up so a late response is ignored', async () => {
  const sent: Array<{ requestId: string; phase: 'flush' | 'persist' }> = []
  const broker = new WindowBridgeRequestBroker()
  const request = broker.request([createTarget(5, sent)], 'flush', 5)

  await assert.rejects(request, /Timed out/)
  assert.equal(broker.respond(5, { ...sent[0], ok: true }), false)
})
