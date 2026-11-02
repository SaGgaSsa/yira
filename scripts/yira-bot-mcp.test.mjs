import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { parseArgs, relayMessage } from '../resources/yira-bot-mcp.mjs'

const request = JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' })
const notification = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })

async function withRelay(handler, run) {
  const directory = await mkdtemp(join(tmpdir(), 'yira-bot-mcp-'))
  const seen = []
  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      seen.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8') })
      handler(res)
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const bridgeFile = join(directory, 'bot-bridge.json')
  await writeFile(bridgeFile, JSON.stringify({ url: `http://127.0.0.1:${server.address().port}/mcp`, pid: 1 }))
  try {
    await run({ bridgeFile, token: 'tok', seen })
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
  }
}

test('relays the request with the bearer token and returns the body', async () => {
  const reply = '{"jsonrpc":"2.0","id":7,"result":{}}'
  await withRelay((res) => res.writeHead(200).end(`${reply}\n`), async (options) => {
    assert.equal(await relayMessage(request, options), reply)
    assert.equal(options.seen[0].headers.authorization, 'Bearer tok')
    assert.equal(options.seen[0].headers['content-type'], 'application/json')
    assert.equal(options.seen[0].body, request)
  })
})

test('a 202 response produces no output', async () => {
  await withRelay((res) => res.writeHead(202).end(), async (options) => {
    assert.equal(await relayMessage(notification, options), null)
  })
})

test('a missing discovery file reports that Yira is not running', async () => {
  const options = { bridgeFile: join(tmpdir(), 'yira-bot-mcp-missing', 'bot-bridge.json'), token: 'tok' }
  const line = await relayMessage(request, options)
  assert.deepEqual(JSON.parse(line), {
    jsonrpc: '2.0',
    id: 7,
    error: { code: -32000, message: 'Yira is not running. Open Yira and try again.' },
  })
  assert.equal(await relayMessage(notification, options), null)
})

test('an HTTP 401 is reported as a rejected request', async () => {
  await withRelay((res) => res.writeHead(401).end('{}'), async (options) => {
    const reply = JSON.parse(await relayMessage(request, options))
    assert.equal(reply.id, 7)
    assert.equal(reply.error.code, -32000)
    assert.match(reply.error.message, /rejected the request \(HTTP 401\)/)
  })
})

test('a refused connection reports that Yira is not running', async () => {
  await withRelay((res) => res.end(), async (options) => {
    const refusing = { ...options, fetchImpl: async () => { throw new TypeError('fetch failed') } }
    assert.match(JSON.parse(await relayMessage(request, refusing)).error.message, /not running/)
  })
})

test('invalid input lines are ignored', async () => {
  assert.equal(await relayMessage('not json', { bridgeFile: 'x', token: 'y' }), null)
})

test('parseArgs requires both options', () => {
  assert.deepEqual(parseArgs(['--bridge-file', 'a.json', '--token', 't']), { bridgeFile: 'a.json', token: 't' })
  assert.throws(() => parseArgs(['--token', 't']), /Usage/)
  assert.throws(() => parseArgs([]), /Usage/)
})
