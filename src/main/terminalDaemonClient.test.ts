import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createServer, type AddressInfo, type Socket } from 'node:net'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import {
  connectTerminalDaemon,
  stopTerminalDaemon,
  TERMINAL_DAEMON_APPIMAGE_BOOTSTRAP,
  TERMINAL_DAEMON_ENDPOINT_FILE,
  TERMINAL_DAEMON_STARTUP_LOCK_FILE,
  TerminalDaemonClient,
} from './terminalDaemonClient'
import {
  TERMINAL_DAEMON_PROTOCOL_VERSION,
  type TerminalDaemonRequest,
} from '@shared/terminalDaemonProtocol'

const serverSockets = new WeakMap<object, Set<Socket>>()

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve((server.address() as AddressInfo).port)
    })
  })
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  if (!server.listening) return Promise.resolve()
  for (const socket of serverSockets.get(server) ?? []) socket.destroy()
  return new Promise((resolve) => server.close(() => resolve()))
}

function endpoint(port: number, token = 'test-token') {
  return {
    version: TERMINAL_DAEMON_PROTOCOL_VERSION,
    port,
    token,
    pid: process.pid,
  }
}

function positiveTestPid(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function protocolServer(
  handler: (request: TerminalDaemonRequest, socket: Socket) => void,
): ReturnType<typeof createServer> {
  const server = createServer((socket) => {
    socket.setEncoding('utf8')
    let buffer = ''
    socket.on('data', (chunk: string) => {
      buffer += chunk
      while (true) {
        const newline = buffer.indexOf('\n')
        if (newline < 0) return
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (!line.trim()) continue
        handler(JSON.parse(line) as TerminalDaemonRequest, socket)
      }
    })
  })
  const sockets = new Set<Socket>()
  serverSockets.set(server, sockets)
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  return server
}

test('sends a token on every request and dispatches NDJSON events', async (t) => {
  let received: TerminalDaemonRequest | undefined
  const server = protocolServer((request, socket) => {
    received = request
    socket.write(JSON.stringify({
      event: 'data',
      identity: { workspaceId: 'workspace-a', tileId: 'tile-a', generation: 1 },
      sequence: 1,
      data: 'hello',
    }) + '\n')
    socket.write(JSON.stringify({ id: request.id, result: { version: 1, pid: process.pid } }) + '\n')
  })
  t.after(() => closeServer(server))

  const port = await listen(server)
  const client = await TerminalDaemonClient.connect(endpoint(port, 'secret'), { requestTimeoutMs: 500 })
  t.after(() => client.disconnect())

  const events: unknown[] = []
  const disposeEvent = client.onEvent((event) => events.push(event))
  assert.deepEqual(await client.request('ping', undefined), { version: 1, pid: process.pid })
  disposeEvent()

  assert.deepEqual(received, {
    id: received?.id,
    token: 'secret',
    method: 'ping',
  })
  assert.deepEqual(events, [{
    event: 'data',
    identity: { workspaceId: 'workspace-a', tileId: 'tile-a', generation: 1 },
    sequence: 1,
    data: 'hello',
  }])
})

test('rejects pending requests and notifies disconnect listeners when the socket closes', async (t) => {
  let activeSocket: Socket | undefined
  let receivedRequest: () => void = () => undefined
  const requestReceived = new Promise<void>((resolve) => { receivedRequest = resolve })
  const server = protocolServer((_request, socket) => {
    activeSocket = socket
    receivedRequest()
  })
  t.after(() => closeServer(server))

  const port = await listen(server)
  const client = await TerminalDaemonClient.connect(endpoint(port), { requestTimeoutMs: 2_000 })
  t.after(() => client.disconnect())

  const disconnect = new Promise<Error>((resolve) => { client.onDisconnect(resolve) })
  const pending = client.request('list', undefined)
  await requestReceived
  activeSocket?.destroy()

  await assert.rejects(pending, /terminal daemon/i)
  assert.match((await disconnect).message, /terminal daemon/i)
})

test('times out one request without retrying it', async (t) => {
  let requests = 0
  const server = protocolServer(() => { requests += 1 })
  t.after(() => closeServer(server))

  const port = await listen(server)
  const client = await TerminalDaemonClient.connect(endpoint(port), { requestTimeoutMs: 30 })
  t.after(() => client.disconnect())

  await assert.rejects(client.request('list', undefined), /timed out/i)
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(requests, 1)
})

test('reuses a responsive endpoint and secures its files', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-terminal-daemon-'))
  t.after(() => rm(directory, { recursive: true, force: true }))

  const server = protocolServer((request, socket) => {
    socket.write(JSON.stringify({ id: request.id, result: { version: 1, pid: process.pid } }) + '\n')
  })
  t.after(() => closeServer(server))
  const port = await listen(server)
  const endpointPath = join(directory, TERMINAL_DAEMON_ENDPOINT_FILE)
  await writeFile(endpointPath, JSON.stringify(endpoint(port)), { mode: 0o644 })

  const client = await connectTerminalDaemon({
    directory,
    executable: '/path/that-must-not-be-launched',
    entryPath: '/path/that-must-not-be-launched.js',
  })
  t.after(() => client.disconnect())

  assert.deepEqual(await client.request('ping', undefined), { version: 1, pid: process.pid })
  if (process.platform !== 'win32') {
    assert.equal((await stat(directory)).mode & 0o777, 0o700)
    assert.equal((await stat(endpointPath)).mode & 0o777, 0o600)
  }
})

test('does not launch a duplicate when an endpoint PID is alive but does not respond', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-terminal-daemon-'))
  t.after(() => rm(directory, { recursive: true, force: true }))

  const server = protocolServer(() => undefined)
  t.after(() => closeServer(server))
  const port = await listen(server)
  await writeFile(join(directory, TERMINAL_DAEMON_ENDPOINT_FILE), JSON.stringify(endpoint(port)))

  await assert.rejects(
    connectTerminalDaemon({
      directory,
      executable: '/path/that-must-not-be-launched',
      entryPath: '/path/that-must-not-be-launched.js',
      startupTimeoutMs: 80,
    }),
    /alive but did not complete the protocol handshake/i,
  )
  assert.equal(await readFile(join(directory, TERMINAL_DAEMON_STARTUP_LOCK_FILE), 'utf8').catch(() => null), null)
})

test('stops a live daemon process tree and removes its endpoint', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-terminal-daemon-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const daemon = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  t.after(() => { if (daemon.exitCode === null) daemon.kill() })
  assert.ok(positiveTestPid(daemon.pid))
  const endpointPath = join(directory, TERMINAL_DAEMON_ENDPOINT_FILE)
  await writeFile(endpointPath, JSON.stringify({ ...endpoint(1), pid: daemon.pid }))

  assert.equal(await stopTerminalDaemon({ directory }), true)
  assert.throws(() => process.kill(daemon.pid as number, 0))
  assert.equal(await readFile(endpointPath, 'utf8').catch(() => null), null)
})

test('asks a live daemon to shut down before killing its process tree', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-terminal-daemon-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const daemon = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  t.after(() => { if (daemon.exitCode === null) daemon.kill() })
  assert.ok(positiveTestPid(daemon.pid))
  const methods: string[] = []
  const server = protocolServer((request, socket) => {
    methods.push(request.method)
    socket.write(JSON.stringify({ id: request.id, result: null }) + '\n')
    if (request.method === 'shutdown') daemon.kill()
  })
  t.after(() => closeServer(server))
  const port = await listen(server)
  await writeFile(join(directory, TERMINAL_DAEMON_ENDPOINT_FILE), JSON.stringify({ ...endpoint(port), pid: daemon.pid }))
  const killed: number[] = []

  assert.equal(await stopTerminalDaemon({
    directory,
    killProcessTree: async (pid) => { killed.push(pid) },
  }), true)
  assert.deepEqual(methods, ['shutdown'])
  assert.deepEqual(killed, [])
})

test('does not stop anything without a live daemon endpoint', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-terminal-daemon-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const killed: number[] = []
  const killProcessTree = async (pid: number): Promise<void> => { killed.push(pid) }

  assert.equal(await stopTerminalDaemon({ directory, killProcessTree }), false)
  await writeFile(join(directory, TERMINAL_DAEMON_ENDPOINT_FILE), JSON.stringify({ ...endpoint(1), pid: 999_999_999 }))
  assert.equal(await stopTerminalDaemon({ directory, killProcessTree }), false)
  await writeFile(join(directory, TERMINAL_DAEMON_ENDPOINT_FILE), JSON.stringify(endpoint(1)))
  assert.equal(await stopTerminalDaemon({ directory, killProcessTree }), false)
  assert.deepEqual(killed, [])
})

test('recovers a dead startup lock and reports a launch failure', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-terminal-daemon-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const lockPath = join(directory, TERMINAL_DAEMON_STARTUP_LOCK_FILE)
  await writeFile(lockPath, JSON.stringify({ pid: 999_999_999, token: 'dead' }), { mode: 0o600 })

  await assert.rejects(
    connectTerminalDaemon({
      directory,
      executable: '/path/that-does-not-exist',
      entryPath: '/path/that-does-not-exist.js',
      startupTimeoutMs: 250,
    }),
    /unable to start terminal daemon|daemon launch failed/i,
  )
  assert.equal(await readFile(lockPath, 'utf8').catch(() => null), null)
})

test('coordinates concurrent startup calls in one process', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-terminal-daemon-'))
  t.after(() => rm(directory, { recursive: true, force: true }))

  const server = protocolServer((request, socket) => {
    socket.write(JSON.stringify({ id: request.id, result: { version: 1, pid: process.pid } }) + '\n')
  })
  t.after(() => closeServer(server))
  const port = await listen(server)
  await writeFile(join(directory, TERMINAL_DAEMON_ENDPOINT_FILE), JSON.stringify(endpoint(port)))

  const options = {
    directory,
    executable: '/path/that-must-not-be-launched',
    entryPath: '/path/that-must-not-be-launched.js',
  }
  const first = connectTerminalDaemon(options)
  const second = connectTerminalDaemon(options)
  assert.equal(first, second)
  const [firstClient, secondClient] = await Promise.all([first, second])
  t.after(() => firstClient.disconnect())
  assert.equal(firstClient, secondClient)
})

test('uses an independent AppImage launch and keeps the direct launch path', { skip: process.platform === 'win32' }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-terminal-daemon-'))
  const appImagePath = join(directory, 'fake-appimage')
  const directEntryPath = join(directory, 'direct-entry.mjs')
  const oldMountEntryPath = '/tmp/.mount-old/resources/app.asar/dist-electron/main/terminalDaemon.js'
  const fixture = `
    import { createServer } from 'node:net'
    import { chmod, writeFile } from 'node:fs/promises'
    import { join } from 'node:path'

    const args = process.argv.slice(2)
    const directory = args.at(-1)
    const markerPath = join(directory, 'launch.json')
    await writeFile(markerPath, JSON.stringify({
      args,
      entryPath: process.argv[1],
      runAsNode: process.env.ELECTRON_RUN_AS_NODE,
    }))
    const token = 'test-token'
    const server = createServer((socket) => {
      socket.setEncoding('utf8')
      let buffer = ''
      socket.on('data', (chunk) => {
        buffer += chunk
        while (true) {
          const newline = buffer.indexOf('\\n')
          if (newline < 0) break
          const line = buffer.slice(0, newline)
          buffer = buffer.slice(newline + 1)
          if (!line.trim()) continue
          const request = JSON.parse(line)
          socket.write(JSON.stringify({ id: request.id, result: { version: 1, pid: process.pid } }) + '\\n')
        }
      })
    })
    server.listen(0, '127.0.0.1', async () => {
      const endpointPath = join(directory, 'endpoint.json')
      await writeFile(endpointPath, JSON.stringify({ version: 1, port: server.address().port, token, pid: process.pid }))
      await chmod(endpointPath, 0o600)
    })
  `
  await writeFile(appImagePath, `#!/usr/bin/env node\n${fixture}`)
  await writeFile(directEntryPath, fixture)
  await chmod(appImagePath, 0o755)

  const cleanup = async (): Promise<void> => {
    const endpointPath = join(directory, TERMINAL_DAEMON_ENDPOINT_FILE)
    const contents = await readFile(endpointPath, 'utf8').catch(() => null)
    if (contents) {
      try {
        const pid = JSON.parse(contents).pid
        if (typeof pid === 'number') process.kill(pid, 'SIGTERM')
      } catch {
        // The fixture may have exited before writing a complete endpoint.
      }
    }
    await rm(directory, { recursive: true, force: true })
  }
  t.after(cleanup)

  const appImageClient = await connectTerminalDaemon({
    directory,
    executable: '/path/old-mounted-yira-bin',
    entryPath: oldMountEntryPath,
    appImagePath,
    startupTimeoutMs: 2_000,
  })
  t.after(() => appImageClient.disconnect())
  const appImageEndpoint = JSON.parse(
    await readFile(join(directory, TERMINAL_DAEMON_ENDPOINT_FILE), 'utf8'),
  ) as { pid?: unknown }
  const appImageLaunch = JSON.parse(await readFile(join(directory, 'launch.json'), 'utf8')) as {
    args: unknown[]
    entryPath?: unknown
    runAsNode?: unknown
  }
  assert.deepEqual(appImageLaunch.args, ['-e', TERMINAL_DAEMON_APPIMAGE_BOOTSTRAP, directory])
  assert.equal(appImageLaunch.entryPath, appImagePath)
  assert.equal(appImageLaunch.runAsNode, '1')
  assert.doesNotMatch(String(appImageLaunch.args[1]), new RegExp(oldMountEntryPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  appImageClient.disconnect()
  if (typeof appImageEndpoint.pid === 'number') {
    try { process.kill(appImageEndpoint.pid, 'SIGTERM') } catch { /* The fixture already exited. */ }
  }
  await rm(join(directory, TERMINAL_DAEMON_ENDPOINT_FILE), { force: true })
  await rm(join(directory, 'launch.json'), { force: true })
  await rm(join(directory, TERMINAL_DAEMON_STARTUP_LOCK_FILE), { force: true })

  const directClient = await connectTerminalDaemon({
    directory,
    executable: process.execPath,
    entryPath: directEntryPath,
    startupTimeoutMs: 2_000,
  })
  t.after(() => directClient.disconnect())
  const directLaunch = JSON.parse(await readFile(join(directory, 'launch.json'), 'utf8')) as {
    args: unknown[]
    entryPath?: unknown
  }
  assert.deepEqual(directLaunch.args, [directory])
  assert.equal(directLaunch.entryPath, directEntryPath)
})

function runWorker(
  workerPath: string,
  directory: string,
  daemonPath: string,
  clientModulePath: string,
): Promise<{ code: number | null; output: string }> {
  const require = createRequire(import.meta.url)
  const loaderPath = join(dirname(require.resolve('tsx/cli')), 'loader.mjs')
  const child = spawn(process.execPath, [
    '--import', pathToFileURL(loaderPath).href, workerPath, directory, daemonPath, clientModulePath,
  ], {
    cwd: resolve(process.cwd()),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => { output += chunk })
  child.stderr.on('data', (chunk: string) => { output += chunk })
  return new Promise((resolveResult) => {
    child.once('close', (code) => resolveResult({ code, output }))
  })
}

test('coordinates startup across two client processes', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-terminal-daemon-'))
  const daemonPath = join(directory, 'daemon.mjs')
  const workerPath = join(directory, 'worker.mjs')
  const clientModulePath = pathToFileURL(join(resolve(process.cwd()), 'src/main/terminalDaemonClient.ts')).href
  t.after(async () => {
    const markerPath = join(directory, 'spawns.log')
    const markers = await readFile(markerPath, 'utf8').catch(() => '')
    for (const value of markers.split('\n')) {
      const pid = Number(value.trim())
      if (!positiveTestPid(pid)) continue
      try { process.kill(pid, 'SIGTERM') } catch { /* The daemon already exited. */ }
    }
    const endpointPath = join(directory, TERMINAL_DAEMON_ENDPOINT_FILE)
    const contents = await readFile(endpointPath, 'utf8').catch(() => null)
    if (contents) {
      try {
        const pid = JSON.parse(contents).pid
        if (typeof pid === 'number') process.kill(pid, 'SIGTERM')
      } catch {
        // The temporary daemon may have exited before publishing its endpoint.
      }
    }
    await rm(directory, { recursive: true, force: true })
  })

  await writeFile(daemonPath, `
    import { createServer } from 'node:net'
    import { appendFile, chmod, writeFile } from 'node:fs/promises'
    import { join } from 'node:path'

    const directory = process.argv[2]
    const token = 'test-token'
    await appendFile(join(directory, 'spawns.log'), String(process.pid) + '\\n')
    const server = createServer((socket) => {
      socket.setEncoding('utf8')
      let buffer = ''
      socket.on('data', (chunk) => {
        buffer += chunk
        while (true) {
          const newline = buffer.indexOf('\\n')
          if (newline < 0) break
          const line = buffer.slice(0, newline)
          buffer = buffer.slice(newline + 1)
          if (!line.trim()) continue
          const request = JSON.parse(line)
          if (request.token !== token) {
            socket.write(JSON.stringify({ id: request.id, error: 'bad token' }) + '\\n')
            continue
          }
          socket.write(JSON.stringify({ id: request.id, result: { version: 1, pid: process.pid } }) + '\\n')
        }
      })
    })
    setTimeout(() => server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port
      const endpointPath = join(directory, 'endpoint.json')
      await writeFile(endpointPath, JSON.stringify({ version: 1, port, token, pid: process.pid }))
      await chmod(endpointPath, 0o600)
    }), 100)
  `)
  await writeFile(workerPath, `
    const [, , directory, daemonPath, clientModulePath] = process.argv
    const { connectTerminalDaemon } = await import(clientModulePath)
    try {
      const client = await connectTerminalDaemon({
        directory,
        executable: process.execPath,
        entryPath: daemonPath,
        startupTimeoutMs: 5_000,
      })
      const ping = await client.request('ping', undefined)
      console.log('ready:' + ping.pid)
      client.disconnect()
    } catch (error) {
      console.error(error)
      process.exitCode = 1
    }
  `)

  const [first, second] = await Promise.all([
    runWorker(workerPath, directory, daemonPath, clientModulePath),
    runWorker(workerPath, directory, daemonPath, clientModulePath),
  ])
  assert.equal(first.code, 0, first.output)
  assert.equal(second.code, 0, second.output)
  const firstPid = Number(first.output.match(/ready:(\d+)/)?.[1])
  const secondPid = Number(second.output.match(/ready:(\d+)/)?.[1])
  assert.ok(Number.isSafeInteger(firstPid), first.output)
  assert.ok(Number.isSafeInteger(secondPid), second.output)
  assert.equal(firstPid, secondPid)
  const spawns = (await readFile(join(directory, 'spawns.log'), 'utf8'))
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)
  assert.equal(spawns.length, 1)

  const published = JSON.parse(await readFile(join(directory, TERMINAL_DAEMON_ENDPOINT_FILE), 'utf8'))
  assert.equal(published.pid, firstPid)
})

test('retains a live child startup lock after a startup timeout', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-terminal-daemon-'))
  const entryPath = join(directory, 'live-child.mjs')
  const lockPath = join(directory, TERMINAL_DAEMON_STARTUP_LOCK_FILE)
  let childPid: number | undefined
  t.after(async () => {
    if (childPid) {
      try { process.kill(childPid, 'SIGTERM') } catch { /* The child already exited. */ }
    }
    await rm(directory, { recursive: true, force: true })
  })
  await writeFile(entryPath, 'setInterval(() => undefined, 1_000)\n')

  await assert.rejects(
    connectTerminalDaemon({
      directory,
      executable: process.execPath,
      entryPath,
      startupTimeoutMs: 120,
    }),
    /did not publish a responsive endpoint|startup/i,
  )

  const lock = JSON.parse(await readFile(lockPath, 'utf8')) as { pid?: unknown; token?: unknown }
  assert.equal(typeof lock.pid, 'number')
  assert.equal(typeof lock.token, 'string')
  childPid = lock.pid as number
  assert.doesNotThrow(() => process.kill(childPid as number, 0))

  await assert.rejects(
    connectTerminalDaemon({
      directory,
      executable: '/path/that-must-not-be-launched',
      entryPath: '/path/that-must-not-be-launched.js',
      startupTimeoutMs: 80,
    }),
    /startup\.lock|another process owns/i,
  )
})
