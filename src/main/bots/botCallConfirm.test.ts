import assert from 'node:assert/strict'
import test from 'node:test'

import type { BotCallConfirmRequest } from '@shared/bots'

import { BotCallConfirmBroker } from './botCallConfirm'

const input = { workspaceId: 'ws-1', callerName: 'Planner', targetName: 'Reviewer', prompt: 'Review the diff' }

function makeBroker(timeoutMs?: number, delivered = true): { broker: BotCallConfirmBroker; sent: BotCallConfirmRequest[] } {
  const sent: BotCallConfirmRequest[] = []
  const broker = new BotCallConfirmBroker({
    send: (request) => {
      sent.push(request)
      return delivered
    },
    timeoutMs,
  })
  return { broker, sent }
}

test('resolves true when the user allows the call', async () => {
  const { broker, sent } = makeBroker()
  const answer = broker.request(input)
  assert.equal(sent.length, 1)
  assert.equal(broker.respond(sent[0].requestId, true), true)
  assert.equal(await answer, true)
})

test('resolves false when the user denies the call', async () => {
  const { broker, sent } = makeBroker()
  const answer = broker.request(input)
  assert.equal(broker.respond(sent[0].requestId, false), true)
  assert.equal(await answer, false)
})

test('resolves false when nobody answers before the timeout', async () => {
  const { broker, sent } = makeBroker(20)
  assert.equal(await broker.request(input), false)
  assert.equal(broker.respond(sent[0].requestId, true), false)
})

test('resolves false when there is no window to ask', async () => {
  const { broker } = makeBroker(undefined, false)
  assert.equal(await broker.request(input), false)
})

test('ignores a second response and unknown ids', async () => {
  const { broker, sent } = makeBroker()
  const answer = broker.request(input)
  const { requestId } = sent[0]
  assert.equal(broker.respond(requestId, true), true)
  assert.equal(broker.respond(requestId, false), false)
  assert.equal(broker.respond('missing', true), false)
  assert.equal(broker.respond(requestId, 'yes'), false)
  assert.equal(await answer, true)
})

test('trims the prompt shown to the user to 500 characters', async () => {
  const { broker, sent } = makeBroker()
  const answer = broker.request({ ...input, prompt: `  ${'x'.repeat(900)}  ` })
  assert.equal(sent[0].prompt.length, 500)
  broker.respond(sent[0].requestId, false)
  await answer
})
