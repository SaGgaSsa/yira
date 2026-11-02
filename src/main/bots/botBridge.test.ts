import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import type { BotDefinition, BotToolId } from '@shared/bots'

import { BotBridge, type BotSessionScope, type BotToolProvider } from './botBridge'

const scope: BotSessionScope = { workspaceId: 'ws-1', tileId: 'tile-1', botId: 'bot-1' }

function makeBot(tools: BotToolId[]): BotDefinition {
  return {
    id: 'bot-1',
    name: 'Helper',
    icon: 'search',
    color: 'sky',
    provider: 'claude',
    model: '',
    description: '',
    role: '',
    workspaces: { mode: 'all' },
    tools,
    callable: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function makeProvider(grant: BotToolId, name: string, call?: BotToolProvider['call']): BotToolProvider {
  return {
    grant,
    definitions: [{ name, description: `${name} tool`, inputSchema: { type: 'object' } }],
    call: call ?? (async (_name, args) => `ran ${name} with ${JSON.stringify(args)}`),
  }
}

interface Fixture {
  home: string
  bridge: BotBridge
  url: string
  token: string
  setBot: (bot: BotDefinition | null) => void
}

async function withBridge(
  tools: BotToolProvider[],
  bot: BotDefinition | null,
  run: (fixture: Fixture) => Promise<void>,
): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), 'yira-bot-bridge-'))
  let currentBot = bot
  const bridge = new BotBridge({ homeDirectory: home, getBot: async () => currentBot, tools })
  try {
    const { url } = await bridge.start()
    await run({
      home,
      bridge,
      url,
      token: bridge.issueToken(scope),
      setBot: (next) => { currentBot = next },
    })
  } finally {
    await bridge.close()
    await rm(home, { recursive: true, force: true })
  }
}

async function rpc(fixture: Fixture, body: unknown, token = fixture.token): Promise<Response> {
  return fetch(fixture.url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function rpcJson(fixture: Fixture, method: string, params?: unknown): Promise<any> {
  const response = await rpc(fixture, { jsonrpc: '2.0', id: 1, method, params })
  assert.equal(response.status, 200)
  return response.json()
}

test('tokens round trip to their scope', async () => {
  await withBridge([], null, async ({ bridge }) => {
    assert.deepEqual(bridge.verifyToken(bridge.issueToken(scope)), scope)
  })
})

test('tampered or malformed tokens are rejected', async () => {
  await withBridge([], null, async ({ bridge }) => {
    const token = bridge.issueToken(scope)
    const [payload, signature] = token.split('.')
    const otherPayload = Buffer.from(JSON.stringify({ ...scope, botId: 'bot-2' })).toString('base64url')

    assert.equal(bridge.verifyToken(`${otherPayload}.${signature}`), null)
    assert.equal(bridge.verifyToken(`${payload}.${signature.slice(0, -2)}`), null)
    assert.equal(bridge.verifyToken(payload), null)
    assert.equal(bridge.verifyToken(''), null)
    assert.equal(bridge.verifyToken('a.b.c'), null)
  })
})

test('a second bridge on the same home accepts earlier tokens', async () => {
  await withBridge([], null, async ({ home, bridge }) => {
    const restarted = new BotBridge({ homeDirectory: home, getBot: async () => null })
    assert.deepEqual(restarted.verifyToken(bridge.issueToken(scope)), scope)
  })
})

test('a malformed secret file is replaced', async () => {
  const home = await mkdtemp(join(tmpdir(), 'yira-bot-bridge-'))
  try {
    await writeFile(join(home, 'bot-bridge.secret'), 'not-a-secret')
    const bridge = new BotBridge({ homeDirectory: home, getBot: async () => null })
    assert.deepEqual(bridge.verifyToken(bridge.issueToken(scope)), scope)
    assert.match(await readFile(join(home, 'bot-bridge.secret'), 'utf8'), /^[0-9a-f]{64}$/)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('rejects requests without a valid token', async () => {
  await withBridge([], null, async (fixture) => {
    const anonymous = await fetch(fixture.url, { method: 'POST', body: '{}' })
    assert.equal(anonymous.status, 401)
    const forged = await rpc(fixture, { jsonrpc: '2.0', id: 1, method: 'ping' }, 'forged.token')
    assert.equal(forged.status, 401)
  })
})

test('writes the discovery file with the url and pid', async () => {
  await withBridge([], null, async ({ bridge, url }) => {
    const stored = JSON.parse(await readFile(bridge.discoveryFilePath, 'utf8'))
    assert.deepEqual(stored, { url, pid: process.pid })
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/)
  })
})

test('answers initialize and ping', async () => {
  await withBridge([], makeBot([]), async (fixture) => {
    const initialized = await rpcJson(fixture, 'initialize', { protocolVersion: '2024-11-05' })
    assert.equal(initialized.id, 1)
    assert.equal(initialized.result.protocolVersion, '2024-11-05')
    assert.deepEqual(initialized.result.serverInfo, { name: 'yira', version: '1' })
    assert.deepEqual(initialized.result.capabilities, { tools: {} })

    const defaulted = await rpcJson(fixture, 'initialize', {})
    assert.equal(defaulted.result.protocolVersion, '2025-06-18')

    assert.deepEqual((await rpcJson(fixture, 'ping')).result, {})
  })
})

test('tools/list only shows granted tools', async () => {
  const tools = [makeProvider('sessions_search', 'sessions_search'), makeProvider('session_read', 'session_read')]
  await withBridge(tools, makeBot(['session_read']), async (fixture) => {
    const reply = await rpcJson(fixture, 'tools/list')
    assert.deepEqual(reply.result.tools.map((tool: { name: string }) => tool.name), ['session_read'])
  })
})

test('tools/call runs a granted tool with its arguments', async () => {
  const tools = [makeProvider('session_read', 'session_read')]
  await withBridge(tools, makeBot(['session_read']), async (fixture) => {
    const reply = await rpcJson(fixture, 'tools/call', { name: 'session_read', arguments: { id: 'a' } })
    assert.deepEqual(reply.result, { content: [{ type: 'text', text: 'ran session_read with {"id":"a"}' }] })
  })
})

test('tools/call refuses a tool the bot was not granted', async () => {
  const tools = [makeProvider('session_read', 'session_read')]
  await withBridge(tools, makeBot([]), async (fixture) => {
    const reply = await rpcJson(fixture, 'tools/call', { name: 'session_read' })
    assert.equal(reply.result.isError, true)
    assert.equal(reply.result.content[0].text, 'This tool is not enabled for this bot.')
  })
})

test('tools/call reports a provider error as a tool error', async () => {
  const tools = [makeProvider('session_read', 'session_read', async () => { throw new Error('No such session') })]
  await withBridge(tools, makeBot(['session_read']), async (fixture) => {
    const reply = await rpcJson(fixture, 'tools/call', { name: 'session_read' })
    assert.deepEqual(reply.result, { content: [{ type: 'text', text: 'No such session' }], isError: true })
  })
})

test('tools/call rejects unknown tools and bad arguments', async () => {
  const tools = [makeProvider('session_read', 'session_read')]
  await withBridge(tools, makeBot(['session_read']), async (fixture) => {
    const unknown = await rpcJson(fixture, 'tools/call', { name: 'nope' })
    assert.deepEqual(unknown.error, { code: -32602, message: 'Unknown tool' })
    const badArguments = await rpcJson(fixture, 'tools/call', { name: 'session_read', arguments: [] })
    assert.equal(badArguments.error.code, -32602)
  })
})

test('unknown methods and batches get JSON-RPC errors', async () => {
  await withBridge([], makeBot([]), async (fixture) => {
    assert.equal((await rpcJson(fixture, 'resources/list')).error.code, -32601)
    const batch = await rpc(fixture, [{ jsonrpc: '2.0', id: 1, method: 'ping' }])
    assert.equal((await batch.json() as any).error.code, -32600)
  })
})

test('notifications get an empty 202', async () => {
  await withBridge([], makeBot([]), async (fixture) => {
    const response = await rpc(fixture, { jsonrpc: '2.0', method: 'notifications/initialized' })
    assert.equal(response.status, 202)
    assert.equal(await response.text(), '')
  })
})

test('a deleted bot yields error -32001', async () => {
  await withBridge([makeProvider('session_read', 'session_read')], makeBot(['session_read']), async (fixture) => {
    fixture.setBot(null)
    const reply = await rpcJson(fixture, 'tools/list')
    assert.deepEqual(reply.error, { code: -32001, message: 'Bot no longer exists' })
  })
})

test('rejects bad bodies and other routes', async () => {
  await withBridge([], makeBot([]), async (fixture) => {
    const invalid = await fetch(fixture.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${fixture.token}` },
      body: '{ not json',
    })
    assert.equal(invalid.status, 400)

    const oversized = await fetch(fixture.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${fixture.token}` },
      body: 'x'.repeat(256 * 1024 + 1),
    })
    assert.equal(oversized.status, 413)

    assert.equal((await fetch(fixture.url, { method: 'GET' })).status, 405)
    assert.equal((await fetch(fixture.url.replace('/mcp', '/other'), { method: 'POST' })).status, 404)
  })
})

test('close removes the discovery file', async () => {
  const home = await mkdtemp(join(tmpdir(), 'yira-bot-bridge-'))
  try {
    const bridge = new BotBridge({ homeDirectory: home, getBot: async () => null })
    await bridge.start()
    await access(bridge.discoveryFilePath)
    await bridge.close()
    await assert.rejects(access(bridge.discoveryFilePath))
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
