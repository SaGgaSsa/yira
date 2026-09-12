import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, type Socket } from 'node:net'
import test from 'node:test'

import {
  startTerminalDaemon,
  type TerminalDaemonPty,
  type TerminalDaemonPtyFactory,
  type TerminalDaemonPtyOptions,
} from './terminalDaemonServer'
import { AgentAlertBridge } from './agentAlertBridge'
import type { TerminalDaemonSnapshot } from '@shared/terminalDaemonProtocol'

class FakePty implements TerminalDaemonPty {
  readonly writes: string[] = []
  readonly resizeCalls: Array<{ cols: number; rows: number }> = []
  readonly pid: number
  readonly options: TerminalDaemonPtyOptions
  killed = 0
  paused = 0
  resumed = 0

  private readonly dataListeners = new Set<(data: string) => void>()
  private readonly exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>()

  constructor(pid: number, options: TerminalDaemonPtyOptions) {
    this.pid = pid
    this.options = options
  }

  write(data: string): void {
    this.writes.push(data)
  }

  resize(cols: number, rows: number): void {
    this.resizeCalls.push({ cols, rows })
  }

  kill(): void {
    this.killed += 1
  }

  pause(): void {
    this.paused += 1
  }

  resume(): void {
    this.resumed += 1
  }

  onData(listener: (data: string) => void): { dispose: () => void } {
    this.dataListeners.add(listener)
    return { dispose: () => this.dataListeners.delete(listener) }
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose: () => void } {
    this.exitListeners.add(listener)
    return { dispose: () => this.exitListeners.delete(listener) }
  }

  emitData(data: string): void {
    for (const listener of [...this.dataListeners]) listener(data)
  }

  emitExit(event: { exitCode: number; signal?: number }): void {
    for (const listener of [...this.exitListeners]) listener(event)
  }
}

class FakePtyFactory implements TerminalDaemonPtyFactory {
  readonly instances: FakePty[] = []

  spawn(_executable: string, _args: string[], options: TerminalDaemonPtyOptions): FakePty {
    const pty = new FakePty(10_000 + this.instances.length, options)
    this.instances.push(pty)
    return pty
  }
}

interface WireMessage {
  id?: number
  result?: unknown
  error?: string
  event?: string
  sequence?: number
  identity?: unknown
  [key: string]: unknown
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function connectClient(port: number): Promise<{ socket: Socket; messages: WireMessage[] }> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1')
    const messages: WireMessage[] = []
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      buffer += chunk
      for (;;) {
        const index = buffer.indexOf('\n')
        if (index < 0) return
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        try { messages.push(JSON.parse(line) as WireMessage) } catch { /* test helper ignores malformed output. */ }
      }
    })
    socket.once('connect', () => resolve({ socket, messages }))
    socket.once('error', reject)
  })
}

async function request(
  socket: Socket,
  messages: WireMessage[],
  token: string,
  id: number,
  method: string,
  params?: unknown,
): Promise<WireMessage> {
  const body = { id, token, method, ...(params === undefined ? {} : { params }) }
  socket.write(`${JSON.stringify(body)}\n`)
  const deadline = Date.now() + 5_000
  for (;;) {
    const message = messages.find(candidate => candidate.id === id)
    if (message) return message
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for response ${id}`)
    await wait(5)
  }
}

function spawnParams(target: { workspaceId: string; tileId: string }, extra: Record<string, unknown> = {}) {
  return {
    target,
    executable: 'sh',
    args: [],
    cwd: '/tmp',
    env: { ELECTRON_RUN_AS_NODE: '1', TEST_ENV: 'yes' },
    cols: 12,
    rows: 4,
    local: false,
    ...extra,
  }
}

function snapshotResult(response: WireMessage): TerminalDaemonSnapshot {
  assert.equal(response.error, undefined)
  return response.result as TerminalDaemonSnapshot
}

test('starts the idle timer after publishing the endpoint', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-daemon-'))
  let idleCalls = 0
  const handle = await startTerminalDaemon({
    directory,
    ptyFactory: new FakePtyFactory(),
    token: 'idle-token',
    idleMs: 20,
    onIdle: () => { idleCalls += 1 },
  })
  t.after(() => handle.close())
  await wait(60)
  assert.equal(idleCalls, 1)
})

test('writes an atomic private endpoint and reattaches parsed screen output after disconnect', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-daemon-'))
  const ptyFactory = new FakePtyFactory()
  const handle = await startTerminalDaemon({ directory, ptyFactory, token: 'test-token', idleMs: 5_000 })
  t.after(() => handle.close())

  const endpointPath = join(directory, 'endpoint.json')
  const endpoint = JSON.parse(await readFile(endpointPath, 'utf8')) as typeof handle.endpoint
  assert.deepEqual(endpoint, handle.endpoint)
  assert.equal((await stat(directory)).mode & 0o777, 0o700)
  assert.equal((await stat(endpointPath)).mode & 0o777, 0o600)

  const first = await connectClient(handle.endpoint.port)
  const created = snapshotResult(await request(
    first.socket,
    first.messages,
    handle.endpoint.token,
    1,
    'create',
    spawnParams({ workspaceId: 'workspace-a', tileId: 'tile-a' }),
  ))
  assert.equal(created.cols, 12)
  assert.equal(Number.isSafeInteger(created.identity.generation), true)
  const pty = ptyFactory.instances[0]
  assert.equal(created.pid, pty.pid)
  first.socket.destroy()

  pty.emitData('offline output\r\n')
  await wait(100)

  const second = await connectClient(handle.endpoint.port)
  const attached = snapshotResult(await request(
    second.socket,
    second.messages,
    handle.endpoint.token,
    2,
    'attach',
    { workspaceId: 'workspace-a', tileId: 'tile-a' },
  ))
  assert.match(attached.buffer, /offline output/)
  assert.equal(attached.identity.generation, created.identity.generation)
  assert.equal(attached.cols, 12)

  const resized = await request(
    second.socket,
    second.messages,
    handle.endpoint.token,
    3,
    'resize',
    { identity: created.identity, cols: 20, rows: 8 },
  )
  assert.deepEqual(resized.result, null)
  const fresh = snapshotResult(await request(
    second.socket,
    second.messages,
    handle.endpoint.token,
    4,
    'snapshot',
    created.identity,
  ))
  assert.deepEqual({ cols: fresh.cols, rows: fresh.rows }, { cols: 20, rows: 8 })
  assert.deepEqual(pty.resizeCalls.at(-1), { cols: 20, rows: 8 })
  const nulInput = await request(
    second.socket,
    second.messages,
    handle.endpoint.token,
    5,
    'write',
    { identity: created.identity, data: '\u0000' },
  )
  assert.deepEqual(nulInput.result, null)
  assert.equal(pty.writes.at(-1), '\u0000')
  second.socket.destroy()
})

test('keeps natural exits attachable and destroys detached sessions by workspace', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-daemon-'))
  const ptyFactory = new FakePtyFactory()
  const handle = await startTerminalDaemon({ directory, ptyFactory, token: 'exit-token', idleMs: 5_000 })
  t.after(() => handle.close())
  const client = await connectClient(handle.endpoint.port)
  const first = snapshotResult(await request(client.socket, client.messages, handle.endpoint.token, 1, 'create', spawnParams({ workspaceId: 'w', tileId: 'one' })))
  const second = snapshotResult(await request(client.socket, client.messages, handle.endpoint.token, 2, 'create', spawnParams({ workspaceId: 'w', tileId: 'two' })))
  client.socket.destroy()
  ptyFactory.instances[0].emitExit({ exitCode: 7, signal: 2 })
  await wait(40)

  const reconnect = await connectClient(handle.endpoint.port)
  const attached = snapshotResult(await request(reconnect.socket, reconnect.messages, handle.endpoint.token, 3, 'attach', first.identity))
  assert.deepEqual(attached.exitEvent, { exitCode: 7, signal: 2 })
  assert.equal(attached.identity.generation, first.identity.generation)
  reconnect.socket.destroy()

  const destroyClient = await connectClient(handle.endpoint.port)
  const destroyed = await request(destroyClient.socket, destroyClient.messages, handle.endpoint.token, 4, 'destroyWorkspace', { workspaceId: 'w' })
  assert.deepEqual(destroyed.result, null)
  assert.equal(ptyFactory.instances[0].killed, 1)
  assert.equal(ptyFactory.instances[1].killed, 1)
  const list = await request(destroyClient.socket, destroyClient.messages, handle.endpoint.token, 5, 'list')
  assert.deepEqual(list.result, [])
  destroyClient.socket.destroy()
  void second
})

test('orders all received output before the natural exit event', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-daemon-'))
  const ptyFactory = new FakePtyFactory()
  const handle = await startTerminalDaemon({ directory, ptyFactory, token: 'exit-order-token', idleMs: 5_000 })
  t.after(() => handle.close())
  const client = await connectClient(handle.endpoint.port)
  const created = snapshotResult(await request(
    client.socket,
    client.messages,
    handle.endpoint.token,
    1,
    'create',
    spawnParams({ workspaceId: 'w', tileId: 'exit-order' }),
  ))
  const pty = ptyFactory.instances[0]
  pty.emitData('first output\r\n')
  pty.emitData('final output\r\n')
  pty.emitExit({ exitCode: 9 })
  await wait(100)

  const events = client.messages.filter(message => message.event === 'data' || message.event === 'exit')
  assert.deepEqual(events.map(message => message.event), ['data', 'data', 'exit'])
  const snapshot = snapshotResult(await request(
    client.socket,
    client.messages,
    handle.endpoint.token,
    2,
    'snapshot',
    created.identity,
  ))
  assert.match(snapshot.buffer, /final output/)
  assert.deepEqual(snapshot.exitEvent, { exitCode: 9 })
})

test('runs prepend and deferred initial commands once, rejects stale identities, and handles alternate screen snapshots', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-daemon-'))
  const ptyFactory = new FakePtyFactory()
  const handle = await startTerminalDaemon({ directory, ptyFactory, token: 'command-token', idleMs: 5_000 })
  t.after(() => handle.close())
  const client = await connectClient(handle.endpoint.port)
  const created = snapshotResult(await request(
    client.socket,
    client.messages,
    handle.endpoint.token,
    1,
    'create',
    spawnParams({ workspaceId: 'w', tileId: 'commands' }, {
      prependCommand: 'history setup',
      initialCommand: 'printf ready',
    }),
  ))
  const pty = ptyFactory.instances[0]
  assert.deepEqual(pty.writes, ['history setup\r'])
  pty.emitData('prompt$ ')
  await wait(120)
  assert.deepEqual(pty.writes, ['history setup\r', 'printf ready\r'])
  await wait(120)
  assert.deepEqual(pty.writes, ['history setup\r', 'printf ready\r'])

  pty.emitData('\u001b]2;ALT title\u0007\u001b[?1049h\u001b[2;3HALT')
  await wait(100)
  const alternate = snapshotResult(await request(client.socket, client.messages, handle.endpoint.token, 2, 'snapshot', created.identity))
  assert.match(alternate.buffer, /ALT/)
  assert.match(alternate.buffer, /1049h/)
  assert.equal('title' in alternate, false)
  assert.match(alternate.buffer, /\u001b\]2;/)

  await request(client.socket, client.messages, handle.endpoint.token, 3, 'destroy', created.identity)
  const stale = await request(client.socket, client.messages, handle.endpoint.token, 4, 'write', {
    identity: created.identity,
    data: 'stale',
  })
  assert.match(stale.error ?? '', /stale/i)
  client.socket.destroy()
})

test('authenticates every request and retains local semantic alerts without clients', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-daemon-'))
  const ptyFactory = new FakePtyFactory()
  const handle = await startTerminalDaemon({ directory, ptyFactory, token: 'alert-token', idleMs: 5_000 })
  t.after(() => handle.close())
  const client = await connectClient(handle.endpoint.port)
  const created = snapshotResult(await request(
    client.socket,
    client.messages,
    handle.endpoint.token,
    1,
    'create',
    spawnParams({ workspaceId: 'w', tileId: 'agent' }, {
      local: true,
      agent: { provider: 'codex', sessionId: 'session-1', startedAt: '2026-01-01T00:00:00.000Z' },
    }),
  ))
  const pty = ptyFactory.instances[0]
  assert.equal(pty.writes.includes(''), false)
  assert.equal(pty.options.env.ELECTRON_RUN_AS_NODE, undefined)
  const endpointUrl = new URL(pty.options.env.YIRA_AGENT_BRIDGE_URL)
  const bridgeToken = pty.options.env.YIRA_AGENT_BRIDGE_TOKEN
  assert.equal(created.agent?.provider, 'codex')

  const unauthorized = await request(client.socket, client.messages, 'wrong-token', 2, 'list')
  assert.match(unauthorized.error ?? '', /unauthorized/i)
  client.socket.destroy()
  assert.equal(endpointUrl.hostname, '127.0.0.1')
  assert.equal(await postAlert(endpointUrl.toString(), bridgeToken, {
    provider: 'codex',
    event: 'completed',
    tileId: 'agent',
  }), 202)
})

test('keeps VT queries with the daemon until a renderer is ready', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-daemon-'))
  const ptyFactory = new FakePtyFactory()
  const handle = await startTerminalDaemon({ directory, ptyFactory, token: 'renderer-token', idleMs: 5_000 })
  t.after(() => handle.close())
  const client = await connectClient(handle.endpoint.port)
  const created = snapshotResult(await request(
    client.socket,
    client.messages,
    handle.endpoint.token,
    1,
    'create',
    spawnParams({ workspaceId: 'w', tileId: 'queries' }),
  ))
  const pty = ptyFactory.instances[0]

  pty.emitData('\u001b[6n')
  await wait(80)
  assert.equal(pty.writes.includes('\u001b[1;1R'), true)

  const writesBeforeRenderer = pty.writes.length
  const attached = snapshotResult(await request(
    client.socket,
    client.messages,
    handle.endpoint.token,
    2,
    'rendererAttach',
    created.identity,
  ))
  assert.equal(attached.sequence, created.sequence + 1)
  pty.emitData('\u001b[6n')
  await wait(80)
  assert.equal(pty.writes.length, writesBeforeRenderer)

  assert.deepEqual((await request(
    client.socket,
    client.messages,
    handle.endpoint.token,
    3,
    'rendererDetach',
    created.identity,
  )).result, null)
  pty.emitData('\u001b[6n')
  await wait(80)
  assert.equal(pty.writes.length, writesBeforeRenderer + 1)

  await request(client.socket, client.messages, handle.endpoint.token, 4, 'rendererAttach', created.identity)
  client.socket.destroy()
  await wait(40)
  const writesBeforeReconnect = pty.writes.length
  pty.emitData('\u001b[6n')
  await wait(80)
  assert.equal(pty.writes.length, writesBeforeReconnect + 1)
})

test('returns a finite snapshot barrier while output continues', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-daemon-'))
  const ptyFactory = new FakePtyFactory()
  const handle = await startTerminalDaemon({ directory, ptyFactory, token: 'busy-token', idleMs: 5_000 })
  t.after(() => handle.close())
  const client = await connectClient(handle.endpoint.port)
  const created = snapshotResult(await request(
    client.socket,
    client.messages,
    handle.endpoint.token,
    1,
    'create',
    spawnParams({ workspaceId: 'w', tileId: 'busy' }),
  ))
  const pty = ptyFactory.instances[0]
  let running = true
  pty.emitData('busy output\r\n')
  const producer = setInterval(() => {
    if (running) pty.emitData('busy output\r\n')
  }, 1)
  try {
    const snapshot = snapshotResult(await request(
      client.socket,
      client.messages,
      handle.endpoint.token,
      2,
      'snapshot',
      created.identity,
    ))
    assert.match(snapshot.buffer, /busy output/)
  } finally {
    running = false
    clearInterval(producer)
  }
})

test('preserves all output chunks after PTY backpressure starts', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-daemon-'))
  const ptyFactory = new FakePtyFactory()
  const handle = await startTerminalDaemon({ directory, ptyFactory, token: 'backpressure-token', idleMs: 5_000 })
  t.after(() => handle.close())
  const client = await connectClient(handle.endpoint.port)
  const created = snapshotResult(await request(
    client.socket,
    client.messages,
    handle.endpoint.token,
    1,
    'create',
    spawnParams({ workspaceId: 'w', tileId: 'backpressure' }),
  ))
  const pty = ptyFactory.instances[0]
  const output = `${'x'.repeat(8 * 1024 * 1024 + 128)}END\r\n`
  pty.emitData(output)
  const snapshot = snapshotResult(await request(
    client.socket,
    client.messages,
    handle.endpoint.token,
    2,
    'snapshot',
    created.identity,
  ))
  assert.equal(pty.paused > 0, true)
  assert.match(snapshot.buffer, /END/)
  const emitted = client.messages
    .filter(message => message.event === 'data')
    .map(message => String(message.data ?? ''))
    .join('')
  assert.equal(emitted, output)
})

test('reports failed spawns without an unhandled rejection', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-daemon-'))
  const ptyFactory: TerminalDaemonPtyFactory = {
    spawn: () => {
      throw new Error('spawn failed')
    },
  }
  const handle = await startTerminalDaemon({ directory, ptyFactory, token: 'failure-token', idleMs: 5_000 })
  t.after(() => handle.close())
  const client = await connectClient(handle.endpoint.port)
  const unhandled: unknown[] = []
  const onUnhandled = (reason: unknown): void => { unhandled.push(reason) }
  process.on('unhandledRejection', onUnhandled)
  try {
    const response = await request(
      client.socket,
      client.messages,
      handle.endpoint.token,
      1,
      'create',
      spawnParams({ workspaceId: 'w', tileId: 'failure' }),
    )
    assert.match(response.error ?? '', /spawn failed/i)
    await wait(40)
    assert.deepEqual(unhandled, [])
  } finally {
    process.off('unhandledRejection', onUnhandled)
    client.socket.destroy()
  }
})

test('waits for a pending creation before destroying a workspace', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-daemon-'))
  const ptyFactory = new FakePtyFactory()
  const originalStart = AgentAlertBridge.prototype.start
  let releaseStart!: () => void
  const startGate = new Promise<void>(resolve => { releaseStart = resolve })
  let reachedStart!: () => void
  const startReached = new Promise<void>(resolve => { reachedStart = resolve })
  AgentAlertBridge.prototype.start = async function(this: AgentAlertBridge) {
    reachedStart()
    await startGate
    return originalStart.call(this)
  }
  const handle = await startTerminalDaemon({ directory, ptyFactory, token: 'pending-destroy-token', idleMs: 5_000 })
  t.after(async () => {
    releaseStart()
    AgentAlertBridge.prototype.start = originalStart
    await handle.close()
  })
  const creator = await connectClient(handle.endpoint.port)
  const destroyer = await connectClient(handle.endpoint.port)
  const createResponsePromise = request(
    creator.socket,
    creator.messages,
    handle.endpoint.token,
    1,
    'create',
    spawnParams({ workspaceId: 'w', tileId: 'pending' }, { local: true }),
  )
  await startReached
  const destroyResponsePromise = request(
    destroyer.socket,
    destroyer.messages,
    handle.endpoint.token,
    1,
    'destroyWorkspace',
    { workspaceId: 'w' },
  )
  let destroySettled = false
  void destroyResponsePromise.then(() => { destroySettled = true })
  await wait(20)
  assert.equal(destroySettled, false)
  releaseStart()
  const [createResponse, destroyResponse] = await Promise.all([createResponsePromise, destroyResponsePromise])
  assert.deepEqual(destroyResponse.result, null)
  assert.equal(ptyFactory.instances.length, 1)
  assert.equal(ptyFactory.instances[0].killed, 1)
  assert.ok(createResponse.result || createResponse.error)
  creator.socket.destroy()
  destroyer.socket.destroy()
})

test('routes hooks to the only local shell without agent metadata', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-daemon-'))
  const ptyFactory = new FakePtyFactory()
  const handle = await startTerminalDaemon({ directory, ptyFactory, token: 'shell-hook-token', idleMs: 5_000 })
  t.after(() => handle.close())
  const client = await connectClient(handle.endpoint.port)
  const created = snapshotResult(await request(
    client.socket,
    client.messages,
    handle.endpoint.token,
    1,
    'create',
    spawnParams({ workspaceId: 'w', tileId: 'shell' }, { local: true }),
  ))
  const pty = ptyFactory.instances[0]
  const endpointUrl = pty.options.env.YIRA_AGENT_BRIDGE_URL
  const bridgeToken = pty.options.env.YIRA_AGENT_BRIDGE_TOKEN
  assert.equal(await postAlert(endpointUrl, bridgeToken, {
    provider: 'claude',
    event: 'permission',
    tileId: 'shell',
  }), 202)
  const snapshot = snapshotResult(await request(
    client.socket,
    client.messages,
    handle.endpoint.token,
    2,
    'snapshot',
    created.identity,
  ))
  assert.deepEqual(snapshot.alert, { provider: 'claude', event: 'permission', tileId: 'shell' })
})

function postAlert(url: string, token: string, body: unknown): Promise<number> {
  const parsed = new URL(url)
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = httpRequest({
      hostname: parsed.hostname,
      port: Number(parsed.port),
      path: parsed.pathname,
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      },
    }, response => {
      response.resume()
      response.once('end', () => resolve(response.statusCode ?? 0))
    })
    req.once('error', reject)
    req.end(payload)
  })
}
