import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { type TestContext } from 'node:test'

import type {
  ModPanelBridgeDiscovery,
  ModPanelChange,
} from '@shared/modPanels'

import { ModPanelBridge } from './modPanelBridge'

interface JsonResponse {
  status: number
  body: string
}

function requestJson(
  url: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<JsonResponse> {
  const target = new URL(url)
  const payload = options.body === undefined ? undefined : JSON.stringify(options.body)
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: target.hostname,
      port: Number(target.port),
      path: `${target.pathname}${target.search}`,
      method: options.method ?? 'GET',
      headers: {
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(payload === undefined
          ? {}
          : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }),
      },
    }, (response) => {
      let text = ''
      response.setEncoding('utf8')
      response.on('data', (chunk: string) => { text += chunk })
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: text }))
    })
    req.once('error', reject)
    req.end(payload)
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function createBridge(
  t: TestContext,
  options: { now?: () => number; maxWaitMs?: number } = {},
): Promise<{ bridge: ModPanelBridge; directory: string; discovery: ModPanelBridgeDiscovery; changes: ModPanelChange[] }> {
  const directory = await mkdtemp(join(tmpdir(), 'yira-mod-panels-'))
  const changes: ModPanelChange[] = []
  const bridge = new ModPanelBridge({
    discoveryFile: join(directory, 'run', 'mod-bridge.json'),
    onChange: (change) => changes.push(change),
    ...options,
  })
  t.after(async () => {
    await bridge.close()
    await rm(directory, { recursive: true, force: true })
  })
  const discovery = await bridge.start()
  return { bridge, directory, discovery, changes }
}

function panelBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tileId: 'tile-1',
    plugin: 'demo',
    id: 'panel-1',
    title: 'Status',
    tree: { type: 'Box', children: ['ready'] },
    ...overrides,
  }
}

test('bridge writes the discovery file and removes it on close', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-mod-panels-'))
  const discoveryFile = join(directory, 'run', 'mod-bridge.json')
  const bridge = new ModPanelBridge({ discoveryFile })
  t.after(async () => {
    await bridge.close()
    await rm(directory, { recursive: true, force: true })
  })

  const discovery = await bridge.start()
  const stored = JSON.parse(await readFile(discoveryFile, 'utf8')) as ModPanelBridgeDiscovery
  assert.deepEqual(stored, discovery)
  assert.equal(stored.pid, process.pid)
  assert.match(stored.url, /^http:\/\/127\.0\.0\.1:\d+$/)
  assert.ok(stored.token.length >= 32)

  const repeated = await bridge.start()
  assert.deepEqual(repeated, discovery)

  await bridge.close()
  await assert.rejects(readFile(discoveryFile, 'utf8'), { code: 'ENOENT' })
})

test('bridge rejects unauthenticated requests', async (t) => {
  const { discovery } = await createBridge(t)
  const unauthenticated = await requestJson(`${discovery.url}/panels`, {
    method: 'POST',
    body: panelBody(),
  })
  assert.equal(unauthenticated.status, 401)

  const wrongToken = await requestJson(`${discovery.url}/panels`, {
    method: 'POST',
    token: 'wrong',
    body: panelBody(),
  })
  assert.equal(wrongToken.status, 401)
})

test('bridge stores published panels and emits an upsert change', async (t) => {
  const { bridge, discovery, changes } = await createBridge(t)

  const response = await requestJson(`${discovery.url}/panels`, {
    method: 'POST',
    token: discovery.token,
    body: panelBody({ title: '  Status  ' }),
  })
  assert.equal(response.status, 202)
  assert.equal(changes.length, 1)
  assert.equal(changes[0].type, 'upsert')

  const panels = bridge.listPanels()
  assert.equal(panels.length, 1)
  assert.equal(panels[0].title, 'Status')
  assert.ok(panels[0].updatedAt > 0)
  assert.deepEqual(panels[0].tree, { type: 'Box', children: ['ready'] })

  const blankTitle = await requestJson(`${discovery.url}/panels`, {
    method: 'POST',
    token: discovery.token,
    body: panelBody({ title: '   ', tree: 'fallback title' }),
  })
  assert.equal(blankTitle.status, 202)
  assert.equal(bridge.listPanels()[0].title, 'panel-1')
})

test('bridge rejects invalid panel trees', async (t) => {
  const { bridge, discovery, changes } = await createBridge(t)

  const response = await requestJson(`${discovery.url}/panels`, {
    method: 'POST',
    token: discovery.token,
    body: panelBody({ tree: { type: 'Plot' } }),
  })
  assert.equal(response.status, 400)
  assert.equal(bridge.listPanels().length, 0)
  assert.equal(changes.length, 0)
})

test('bridge delivers presses through GET /events', async (t) => {
  const { bridge, discovery } = await createBridge(t)
  await requestJson(`${discovery.url}/panels`, {
    method: 'POST',
    token: discovery.token,
    body: panelBody(),
  })

  assert.equal(bridge.press({ tileId: 'tile-1', plugin: 'demo', id: 'panel-1', key: 'approve' }), true)
  assert.equal(bridge.press({ tileId: 'tile-1', plugin: 'demo', id: 'missing', key: 'approve' }), false)

  const response = await requestJson(`${discovery.url}/events?tileId=tile-1&plugin=demo&wait=0`, {
    token: discovery.token,
  })
  assert.equal(response.status, 200)
  assert.deepEqual(JSON.parse(response.body), {
    events: [{ kind: 'press', id: 'panel-1', key: 'approve' }],
  })

  const empty = await requestJson(`${discovery.url}/events?tileId=tile-1&plugin=demo&wait=0`, {
    token: discovery.token,
  })
  assert.deepEqual(JSON.parse(empty.body), { events: [] })
})

test('bridge long-polls until a press wakes the waiter', async (t) => {
  const { bridge, discovery } = await createBridge(t, { maxWaitMs: 2_000 })
  await requestJson(`${discovery.url}/panels`, {
    method: 'POST',
    token: discovery.token,
    body: panelBody(),
  })

  const startedAt = Date.now()
  const pending = requestJson(`${discovery.url}/events?tileId=tile-1&plugin=demo&wait=1500`, {
    token: discovery.token,
  })
  await delay(80)
  assert.equal(bridge.press({ tileId: 'tile-1', plugin: 'demo', id: 'panel-1', key: 'run' }), true)

  const response = await pending
  assert.equal(response.status, 200)
  assert.deepEqual(JSON.parse(response.body), {
    events: [{ kind: 'press', id: 'panel-1', key: 'run' }],
  })
  assert.ok(Date.now() - startedAt >= 60)
})

test('bridge replaces an older long-poll for the same tile', async (t) => {
  const { bridge, discovery } = await createBridge(t, { maxWaitMs: 2_000 })
  await requestJson(`${discovery.url}/panels`, {
    method: 'POST',
    token: discovery.token,
    body: panelBody(),
  })

  const first = requestJson(`${discovery.url}/events?tileId=tile-1&plugin=demo&wait=1500`, {
    token: discovery.token,
  })
  await delay(80)
  const second = requestJson(`${discovery.url}/events?tileId=tile-1&plugin=demo&wait=1500`, {
    token: discovery.token,
  })

  const firstResponse = await first
  assert.equal(firstResponse.status, 200)
  assert.deepEqual(JSON.parse(firstResponse.body), { events: [] })

  await delay(80)
  assert.equal(bridge.press({ tileId: 'tile-1', plugin: 'demo', id: 'panel-1', key: 'later' }), true)
  const secondResponse = await second
  assert.deepEqual(JSON.parse(secondResponse.body), {
    events: [{ kind: 'press', id: 'panel-1', key: 'later' }],
  })
})

test('bridge answers an empty event poll when wait is zero', async (t) => {
  const { discovery } = await createBridge(t)
  const response = await requestJson(`${discovery.url}/events?tileId=tile-1&plugin=demo&wait=0`, {
    token: discovery.token,
  })
  assert.equal(response.status, 200)
  assert.deepEqual(JSON.parse(response.body), { events: [] })
})

test('bridge reports closed panels and removes them', async (t) => {
  const { bridge, discovery, changes } = await createBridge(t)
  await requestJson(`${discovery.url}/panels`, {
    method: 'POST',
    token: discovery.token,
    body: panelBody(),
  })

  const response = await requestJson(`${discovery.url}/panels/close`, {
    method: 'POST',
    token: discovery.token,
    body: { tileId: 'tile-1', plugin: 'demo', id: 'panel-1' },
  })
  assert.equal(response.status, 202)
  assert.deepEqual(bridge.listPanels(), [])
  assert.deepEqual(changes.at(-1), {
    type: 'close',
    address: { tileId: 'tile-1', plugin: 'demo', id: 'panel-1' },
  })
})
