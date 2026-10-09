import assert from 'node:assert/strict'
import { request } from 'node:http'
import test from 'node:test'

import { AgentAlertBridge } from './agentAlertBridge'

function postJson(url: string, token: string, body: unknown): Promise<{ status: number; body: string }> {
  const target = new URL(url)
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = request({
      hostname: target.hostname,
      port: Number(target.port),
      path: target.pathname,
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
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

test('bridge accepts only authenticated semantic reports from registered local terminals', async (t) => {
  const reports: unknown[] = []
  const bridge = new AgentAlertBridge({ onAlert: (alert) => reports.push(alert) })
  t.after(() => bridge.close())

  const endpoint = await bridge.start()
  const local = bridge.registerLocalTerminal('local-tile')
  bridge.registerRemoteTerminal('remote-tile')

  assert.match(endpoint.url, /^http:\/\/127\.0\.0\.1:\d+\/agent-alert$/)
  assert.equal(local.YIRA_AGENT_BRIDGE_URL, endpoint.url)
  assert.equal(local.YIRA_AGENT_TILE_ID, 'local-tile')
  assert.ok(local.YIRA_AGENT_BRIDGE_TOKEN.length >= 32)

  const accepted = await postJson(endpoint.url, endpoint.token, {
    provider: 'codex', event: 'completed', tileId: 'local-tile', transcript: 'must not be retained',
  })
  assert.equal(accepted.status, 202)
  assert.deepEqual(reports, [{ provider: 'codex', event: 'completed', tileId: 'local-tile' }])

  const working = await postJson(endpoint.url, endpoint.token, {
    provider: 'claude', event: 'working', tileId: 'local-tile',
  })
  assert.equal(working.status, 202)
  assert.deepEqual(reports.at(-1), { provider: 'claude', event: 'working', tileId: 'local-tile' })

  assert.equal((await postJson(endpoint.url, 'wrong', { provider: 'codex', event: 'completed', tileId: 'local-tile' })).status, 401)
  assert.equal((await postJson(endpoint.url, endpoint.token, { provider: 'codex', event: 'completed', tileId: 'remote-tile' })).status, 404)
  assert.equal((await postJson(endpoint.url, endpoint.token, { provider: 'codex', event: 'completed', tileId: 'unknown' })).status, 404)
  assert.equal((await postJson(endpoint.url, endpoint.token, { provider: 'codex', event: 'output', tileId: 'local-tile' })).status, 400)
})

test('bridge unregisters a terminal and does not expose its environment to remotes', async (t) => {
  const bridge = new AgentAlertBridge()
  t.after(() => bridge.close())
  await bridge.start()

  bridge.registerLocalTerminal('local-tile')
  bridge.registerRemoteTerminal('remote-tile')
  assert.equal(bridge.getLaunchEnvironment('remote-tile'), null)
  assert.ok(bridge.getLaunchEnvironment('local-tile'))

  bridge.unregisterTerminal('local-tile')
  assert.equal(bridge.getLaunchEnvironment('local-tile'), null)
})
