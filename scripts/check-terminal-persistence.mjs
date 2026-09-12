import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { promises as fs } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const daemonEntry = process.env.YIRA_TEST_DAEMON_ENTRY
  ? resolve(rootDir, process.env.YIRA_TEST_DAEMON_ENTRY)
  : resolve(rootDir, 'dist-electron/main/terminalDaemon.js')
const endpointFileName = 'endpoint.json'
const protocolVersion = 1
const maxFrameBytes = 16 * 1024 * 1024
const startupTimeoutMs = 12_000
const requestTimeoutMs = 5_000
const operationTimeoutMs = 8_000
const daemonShutdownTimeoutMs = 5_000
const pollIntervalMs = 60
const gapDelayMs = 1_200
const runtimePrefix = 'yira-terminal-persistence-'
const workerCreate = '--worker-create'
const workerAttach = '--worker-attach'
const workerDestroy = '--worker-destroy'
const resultPrefix = 'YIRA_SMOKE_RESULT '

const initialMarker = 'YIRA_TERM_SMOKE_INITIAL'
const gapMarker = 'YIRA_TERM_SMOKE_GAP'
const queryMarker = 'YIRA_TERM_SMOKE_QUERY'
const valueMarker = 'YIRA_TERM_SMOKE_VALUE'
const cwdMarker = 'YIRA_TERM_SMOKE_CWD'
const shellValue = 'persistent-value-7f2c'

const require = createRequire(import.meta.url)

class SmokeAssertionError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SmokeAssertionError'
  }
}

class RpcClient {
  constructor(endpoint) {
    this.endpoint = endpoint
    this.socket = null
    this.nextId = 1
    this.readBuffer = ''
    this.pending = new Map()
    this.events = []
    this.closed = false
  }

  static async connect(endpoint, timeoutMs = requestTimeoutMs) {
    const client = new RpcClient(endpoint)
    await client.connect(timeoutMs)
    return client
  }

  connect(timeoutMs) {
    if (this.socket) throw new Error('El cliente RPC ya está conectado')

    return new Promise((resolvePromise, rejectPromise) => {
      const socket = net.createConnection({ host: '127.0.0.1', port: this.endpoint.port })
      this.socket = socket
      let settled = false
      let timer

      const finish = (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.removeListener('connect', onConnect)
        socket.removeListener('error', onConnectError)
        if (error) rejectPromise(error)
        else resolvePromise()
      }
      const onConnect = () => {
        socket.setNoDelay(true)
        finish()
      }
      const onConnectError = (error) => {
        finish(new Error(`No se pudo conectar al daemon: ${error.code ?? error.message}`))
      }

      timer = setTimeout(() => {
        socket.destroy()
        finish(new Error('Tiempo de conexión agotado'))
      }, timeoutMs)
      timer.unref?.()

      socket.setEncoding('utf8')
      socket.on('connect', onConnect)
      socket.on('error', (error) => {
        if (!settled) {
          onConnectError(error)
          return
        }
        this.failPending(new Error(`Conexión RPC terminada: ${error.code ?? error.message}`))
      })
      socket.on('data', (chunk) => this.receive(String(chunk)))
      socket.on('close', () => {
        this.closed = true
        this.failPending(new Error('Conexión RPC terminada'))
      })
    })
  }

  request(method, params, timeoutMs = requestTimeoutMs) {
    if (!this.socket || this.closed) return Promise.reject(new Error('El cliente RPC está desconectado'))

    const id = this.nextId++
    const request = {
      id,
      token: this.endpoint.token,
      method,
      ...(params === undefined ? {} : { params }),
    }

    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        rejectPromise(new Error(`Tiempo agotado para ${method}`))
      }, timeoutMs)
      timer.unref?.()
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer })

      try {
        this.socket.write(`${JSON.stringify(request)}\n`, (error) => {
          if (!error) return
          clearTimeout(timer)
          this.pending.delete(id)
          rejectPromise(new Error(`No se pudo enviar ${method}: ${error.message}`))
        })
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        rejectPromise(new Error(`No se pudo enviar ${method}: ${error instanceof Error ? error.message : String(error)}`))
      }
    })
  }

  receive(chunk) {
    this.readBuffer += chunk
    if (Buffer.byteLength(this.readBuffer, 'utf8') > maxFrameBytes) {
      this.failPending(new Error('El frame RPC supera el límite'))
      this.socket?.destroy()
      return
    }

    let newlineIndex = this.readBuffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const frame = this.readBuffer.slice(0, newlineIndex).replace(/\r$/, '')
      this.readBuffer = this.readBuffer.slice(newlineIndex + 1)
      newlineIndex = this.readBuffer.indexOf('\n')
      if (!frame) continue

      let message
      try {
        message = JSON.parse(frame)
      } catch {
        this.failPending(new Error('El daemon envió JSON no válido'))
        this.socket?.destroy()
        return
      }

      if (message && typeof message === 'object' && Number.isInteger(message.id)) {
        const pending = this.pending.get(message.id)
        if (!pending) continue
        clearTimeout(pending.timer)
        this.pending.delete(message.id)
        if (typeof message.error === 'string') pending.reject(new Error(redact(message.error, this.endpoint)))
        else pending.resolve(message.result)
        continue
      }

      if (message && typeof message === 'object' && typeof message.event === 'string') {
        this.events.push(message)
        continue
      }

      this.failPending(new Error('El daemon envió un frame desconocido'))
      this.socket?.destroy()
      return
    }
  }

  failPending(error) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pending.delete(id)
    }
  }

  async close() {
    const socket = this.socket
    if (!socket) return
    this.socket = null
    this.closed = true
    this.failPending(new Error('Cliente RPC cerrado'))
    await new Promise((resolvePromise) => {
      const timer = setTimeout(() => {
        socket.destroy()
        resolvePromise()
      }, 500)
      timer.unref?.()
      if (socket.destroyed) {
        clearTimeout(timer)
        resolvePromise()
        return
      }
      socket.once('close', () => {
        clearTimeout(timer)
        resolvePromise()
      })
      socket.end()
    })
  }
}

function assert(condition, message) {
  if (!condition) throw new SmokeAssertionError(message)
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}

async function waitFor(description, operation, timeoutMs = operationTimeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const value = await operation()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await sleep(pollIntervalMs)
  }
  if (lastError instanceof Error) throw new Error(`${description}: ${lastError.message}`)
  throw new Error(`${description}: tiempo agotado`)
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

function encodedEval(lines) {
  const body = lines.join('\n')
  const encoded = Buffer.from(body, 'utf8').toString('base64')
  return `eval "$(printf '%s' '${encoded}' | base64 -d)"\n`
}

function initialCommand(testDir) {
  return encodedEval([
    `export YIRA_TERM_SMOKE_VALUE=${shellQuote(shellValue)}`,
    `cd ${shellQuote(testDir)}`,
    `printf 'YIRA_TERM_SMOKE_INITIAL_PID:%s\\n' "$$"`,
    `printf 'YIRA_TERM_SMOKE_VALUE:%s\\n' "$YIRA_TERM_SMOKE_VALUE"`,
    `printf 'YIRA_TERM_SMOKE_CWD:%s\\n' "$PWD"`,
    `(sleep ${gapDelayMs / 1000}; printf 'YIRA_TERM_SMOKE_GAP_PID:%s\\n' "$$"; printf 'YIRA_TERM_SMOKE_GAP_VALUE:%s\\n' "$YIRA_TERM_SMOKE_VALUE"; printf 'YIRA_TERM_SMOKE_GAP_CWD:%s\\n' "$PWD") &`,
  ])
}

function queryCommand() {
  return encodedEval([
    `printf 'YIRA_TERM_SMOKE_QUERY_PID:%s\\n' "$$"`,
    `printf 'YIRA_TERM_SMOKE_QUERY_VALUE:%s\\n' "$YIRA_TERM_SMOKE_VALUE"`,
    `printf 'YIRA_TERM_SMOKE_QUERY_CWD:%s\\n' "$PWD"`,
  ])
}

function countMarker(buffer, marker) {
  return buffer.split(marker).length - 1
}

function stripAnsi(buffer) {
  return buffer.replace(/\u001B(?:\][^\u0007]*(?:\u0007|\u001B\\)|\[[0-?]*[ -/]*[@-~]|[()][0-2A-Z]|[ -/]*[@-~])/g, '')
}

function markerValue(buffer, marker) {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = stripAnsi(buffer).match(new RegExp(`${escaped}:(?:\\r)?([^\\r\\n]*)`))
  return match?.[1]
}

function isSnapshot(value) {
  return value !== null
    && typeof value === 'object'
    && value.identity !== null
    && typeof value.identity === 'object'
    && typeof value.identity.workspaceId === 'string'
    && typeof value.identity.tileId === 'string'
    && Number.isInteger(value.identity.generation)
    && Number.isInteger(value.cols)
    && Number.isInteger(value.rows)
    && typeof value.buffer === 'string'
    && Number.isInteger(value.sequence)
    && Number.isInteger(value.pid)
}

function targetForRuntime(runtimeDir) {
  return {
    workspaceId: `smoke-${basename(runtimeDir)}`,
    tileId: 'terminal',
  }
}

function endpointPath(runtimeDir) {
  return join(runtimeDir, endpointFileName)
}

async function readEndpoint(runtimeDir) {
  const file = endpointPath(runtimeDir)
  const [raw, stat] = await Promise.all([
    fs.readFile(file, 'utf8'),
    fs.stat(file),
  ])

  let endpoint
  try {
    endpoint = JSON.parse(raw)
  } catch {
    throw new Error('El endpoint no contiene JSON válido')
  }

  assert(endpoint && typeof endpoint === 'object', 'El endpoint no es un objeto')
  assert(endpoint.version === protocolVersion, 'Versión de endpoint incorrecta')
  assert(Number.isInteger(endpoint.port) && endpoint.port > 0 && endpoint.port < 65_536, 'Puerto de endpoint incorrecto')
  assert(typeof endpoint.token === 'string' && endpoint.token.length >= 16, 'Token de endpoint incorrecto')
  assert(Number.isInteger(endpoint.pid) && endpoint.pid > 1, 'PID de endpoint incorrecto')
  assert((stat.mode & 0o777) === 0o600, 'endpoint.json debe tener permisos 0600')
  return endpoint
}

async function waitForEndpoint(runtimeDir, timeoutMs = startupTimeoutMs) {
  const endpoint = await waitFor('Inicio del endpoint', async () => {
    try {
      return await readEndpoint(runtimeDir)
    } catch {
      return undefined
    }
  }, timeoutMs)
  const client = await RpcClient.connect(endpoint, requestTimeoutMs)
  try {
    const ping = await client.request('ping', undefined)
    assert(ping && ping.version === protocolVersion, 'Respuesta ping incorrecta')
    assert(ping.pid === endpoint.pid, 'El ping no identifica al daemon del endpoint')
  } finally {
    await client.close()
  }
  return endpoint
}

async function waitForSnapshot(client, identity, predicate, description, timeoutMs = operationTimeoutMs) {
  return waitFor(description, async () => {
    const snapshot = await client.request('snapshot', identity)
    if (!isSnapshot(snapshot)) throw new Error('Instantánea inválida')
    if (!sameIdentity(snapshot.identity, identity)) throw new Error('Identidad inconsistente')
    return predicate(snapshot) ? snapshot : undefined
  }, timeoutMs)
}

function sameIdentity(first, second) {
  return first.workspaceId === second.workspaceId
    && first.tileId === second.tileId
    && first.generation === second.generation
}

function hasDataEvent(client, identity, minimumSequence = 0) {
  return client.events.some((event) => event.event === 'data'
    && event.identity
    && sameIdentity(event.identity, identity)
    && Number.isInteger(event.sequence)
    && event.sequence >= minimumSequence
    && typeof event.data === 'string')
}

function validateInitialSnapshot(snapshot, target, testDir) {
  assert(isSnapshot(snapshot), 'create debe devolver una instantánea')
  assert(snapshot.identity.workspaceId === target.workspaceId, 'create devolvió workspace incorrecto')
  assert(snapshot.identity.tileId === target.tileId, 'create devolvió tile incorrecto')
  assert(snapshot.identity.generation >= 1, 'create devolvió generación incorrecta')
  assert(snapshot.cols === 80 && snapshot.rows === 24, 'create no conservó el tamaño inicial')
  assert(snapshot.buffer.includes(`${initialMarker}_PID:`), 'Falta el marcador inicial del shell')
  assert(countMarker(snapshot.buffer, `${initialMarker}_PID:`) === 1, 'initialCommand parece ejecutarse más de una vez')
  assert(markerValue(snapshot.buffer, `${initialMarker}_PID`) === String(snapshot.pid), 'El PID del marcador no coincide con el PTY')
  assert(markerValue(snapshot.buffer, valueMarker) === shellValue, 'La variable del shell no tiene el valor esperado')
  assert(markerValue(snapshot.buffer, cwdMarker) === testDir, 'El directorio inicial no tiene el valor esperado')
  assert(snapshot.sequence >= 1, 'La salida inicial no avanzó la secuencia')
}

async function runCreateWorker(runtimeDir, testDir) {
  const endpoint = await waitForEndpoint(runtimeDir)
  const target = targetForRuntime(runtimeDir)
  const client = await RpcClient.connect(endpoint)
  try {
    const created = await client.request('create', {
      target,
      executable: '/bin/bash',
      args: ['--noprofile', '--norc'],
      cwd: testDir,
      env: { ...process.env },
      cols: 80,
      rows: 24,
      local: true,
      initialCommand: initialCommand(testDir),
    })
    assert(isSnapshot(created), 'create devolvió un resultado inválido')
    const snapshot = await waitForSnapshot(
      client,
      created.identity,
      (value) => value.buffer.includes(`${initialMarker}_PID:`),
      'Salida del comando inicial',
    )
    validateInitialSnapshot(snapshot, target, testDir)
    await waitFor(
      'Evento de salida inicial',
      () => hasDataEvent(client, snapshot.identity, 1),
      2_000,
    )
    return {
      mode: 'create',
      identity: snapshot.identity,
      pid: snapshot.pid,
      sequence: snapshot.sequence,
    }
  } finally {
    await client.close()
  }
}

function validateGapSnapshot(snapshot, expectedIdentity, expectedPid, testDir) {
  assert(isSnapshot(snapshot), 'attach debe devolver una instantánea')
  assert(sameIdentity(snapshot.identity, expectedIdentity), 'attach devolvió otra identidad')
  assert(snapshot.pid === expectedPid, 'attach devolvió otro PID de PTY')
  assert(snapshot.cols === 80 && snapshot.rows === 24, 'El tamaño cambió durante la desconexión')
  assert(countMarker(snapshot.buffer, `${initialMarker}_PID:`) === 1, 'initialCommand se ejecutó otra vez durante attach')
  assert(countMarker(snapshot.buffer, `${gapMarker}_PID:`) === 1, 'Falta la salida programada durante la desconexión')
  assert(markerValue(snapshot.buffer, `${gapMarker}_PID`) === String(expectedPid), 'La salida desconectada usa otro PID')
  assert(markerValue(snapshot.buffer, `${gapMarker}_VALUE`) === shellValue, 'La variable no persistió durante la desconexión')
  assert(markerValue(snapshot.buffer, `${gapMarker}_CWD`) === testDir, 'El directorio no persistió durante la desconexión')
}

async function runAttachWorker(runtimeDir, testDir, expectedPid, expectedGeneration) {
  const endpoint = await waitForEndpoint(runtimeDir)
  const target = targetForRuntime(runtimeDir)
  const expectedIdentity = { ...target, generation: expectedGeneration }
  const client = await RpcClient.connect(endpoint)
  try {
    const attached = await client.request('attach', target)
    validateGapSnapshot(attached, expectedIdentity, expectedPid, testDir)
    const beforeQuerySequence = attached.sequence

    await client.request('write', { identity: attached.identity, data: queryCommand() })
    const queried = await waitForSnapshot(
      client,
      attached.identity,
      (value) => value.buffer.includes(`${queryMarker}_PID:`),
      'Respuesta del shell reconectado',
    )

    assert(countMarker(queried.buffer, `${queryMarker}_PID:`) === 1, 'La consulta del shell es ambigua')
    assert(markerValue(queried.buffer, `${queryMarker}_PID`) === String(expectedPid), 'La reconexión cambió el PID del shell')
    assert(markerValue(queried.buffer, `${queryMarker}_VALUE`) === shellValue, 'La variable del shell no persistió')
    assert(markerValue(queried.buffer, `${queryMarker}_CWD`) === testDir, 'El directorio del shell no persistió')
    assert(queried.sequence > beforeQuerySequence, 'write no generó nueva salida')
    await waitFor(
      'Evento de salida reconectado',
      () => hasDataEvent(client, attached.identity, beforeQuerySequence + 1),
      2_000,
    )

    await client.request('resize', { identity: attached.identity, cols: 107, rows: 31 })
    const resized = await waitForSnapshot(
      client,
      attached.identity,
      (value) => value.cols === 107 && value.rows === 31,
      'Redimensionado del PTY',
    )
    assert(resized.pid === expectedPid, 'resize cambió el PID del shell')
    return {
      mode: 'attach',
      identity: resized.identity,
      pid: resized.pid,
      sequence: resized.sequence,
      cols: resized.cols,
      rows: resized.rows,
    }
  } finally {
    await client.close()
  }
}

async function processIsAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EPERM') return true
    return false
  }
}

async function runDestroyWorker(runtimeDir, expectedPid, expectedGeneration) {
  const endpoint = await waitForEndpoint(runtimeDir)
  const target = targetForRuntime(runtimeDir)
  const identity = { ...target, generation: expectedGeneration }
  const client = await RpcClient.connect(endpoint)
  try {
    const attached = await client.request('attach', target)
    assert(isSnapshot(attached), 'La reconexión final no encontró la sesión')
    assert(sameIdentity(attached.identity, identity), 'La reconexión final devolvió otra identidad')
    assert(attached.pid === expectedPid, 'La reconexión final devolvió otro PID')
    assert(attached.cols === 107 && attached.rows === 31, 'El tamaño no persistió después de reconectar')

    await client.request('destroy', identity)
    const reattached = await client.request('attach', target)
    assert(reattached === null, 'destroy permitió volver a conectar la sesión')
  } finally {
    await client.close()
  }

  await waitFor('Terminación del proceso PTY', async () => !(await processIsAlive(expectedPid)), operationTimeoutMs)
  return {
    mode: 'destroy',
    pid: expectedPid,
    destroyed: true,
  }
}

function parseWorkerResult(stdout, mode) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean)
  const resultLine = lines.findLast((line) => line.startsWith(resultPrefix))
  if (!resultLine) throw new Error(`El cliente ${mode} no devolvió resultado`)
  let result
  try {
    result = JSON.parse(resultLine.slice(resultPrefix.length))
  } catch {
    throw new Error(`El cliente ${mode} devolvió un resultado inválido`)
  }
  assert(result && result.mode === mode, `El cliente ${mode} devolvió un modo incorrecto`)
  return result
}

function redact(text, endpoint) {
  let value = String(text ?? '')
  if (endpoint?.token) value = value.replaceAll(endpoint.token, '[token oculto]')
  return value.replaceAll(/\r/g, '').slice(0, 1_000)
}

async function runClientWorker(mode, runtimeDir, testDir, args = []) {
  const expectedMode = mode.startsWith('--worker-') ? mode.slice('--worker-'.length) : mode
  const worker = spawn(process.execPath, [fileURLToPath(import.meta.url), mode, runtimeDir, testDir, ...args], {
    cwd: rootDir,
    env: { ...process.env, YIRA_TERMINAL_SMOKE_WORKER: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let stdout = ''
  let stderr = ''
  worker.stdout.setEncoding('utf8')
  worker.stderr.setEncoding('utf8')
  worker.stdout.on('data', (chunk) => {
    stdout += String(chunk)
    if (stdout.length > 2_000_000) stdout = stdout.slice(-2_000_000)
  })
  worker.stderr.on('data', (chunk) => {
    stderr += String(chunk)
    if (stderr.length > 2_000_000) stderr = stderr.slice(-2_000_000)
  })

  const timeout = setTimeout(() => {
    if (worker.exitCode === null && worker.signalCode === null) worker.kill('SIGKILL')
  }, operationTimeoutMs + startupTimeoutMs)
  const result = await new Promise((resolvePromise, rejectPromise) => {
    worker.once('error', rejectPromise)
    worker.once('close', (code, signal) => {
      if (code === 0) {
        resolvePromise(undefined)
        return
      }
      rejectPromise(new Error(`Cliente ${mode} terminó con ${signal ?? `código ${code}`}: ${redact(stderr || stdout)}`))
    })
  }).finally(() => clearTimeout(timeout))
  void result
  return parseWorkerResult(stdout, expectedMode)
}

async function terminateOwnDaemon(context) {
  const child = context.daemon
  if (!child
    || !Number.isInteger(child.pid)
    || context.daemonExited
    || child.exitCode !== null
    || child.signalCode !== null) return

  try {
    process.kill(child.pid, 'SIGTERM')
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'ESRCH') throw error
    return
  }

  await waitFor('Terminación del daemon', async () => context.daemonExited, daemonShutdownTimeoutMs).catch(() => {})
  if (context.daemonExited) return

  try {
    process.kill(child.pid, 'SIGKILL')
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'ESRCH') throw error
  }
}

async function destroyOwnSession(context) {
  if (!context.runtimeDir || !context.target) return
  let endpoint
  try {
    endpoint = await readEndpoint(context.runtimeDir)
  } catch {
    return
  }

  const client = await RpcClient.connect(endpoint, 1_000).catch(() => null)
  if (!client) return
  try {
    await client.request('destroyCurrent', context.target, 2_000).catch(() => {})
  } finally {
    await client.close()
  }
}

async function runMain() {
  if (process.platform !== 'linux') {
    console.log(`SMOKE: omitido en plataforma no Linux (${process.platform})`)
    return
  }

  if (!daemonEntry.includes('.asar/')) {
    try {
      await fs.access(daemonEntry)
    } catch {
      throw new Error('Requiere npm run build (falta dist-electron/main/terminalDaemon.js)')
    }
  }

  let runtimeDir
  const context = {
    daemon: null,
    daemonExited: false,
    runtimeDir: null,
    target: null,
  }

  try {
    runtimeDir = await fs.mkdtemp(join(os.tmpdir(), runtimePrefix))
    context.runtimeDir = runtimeDir
    context.target = targetForRuntime(runtimeDir)

    const electronExecutable = process.env.YIRA_TEST_ELECTRON ?? require('electron')
    assert(typeof electronExecutable === 'string' && electronExecutable.length > 0, 'No se encontró el ejecutable de Electron')
    const daemon = spawn(electronExecutable, [daemonEntry, runtimeDir], {
      cwd: rootDir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    context.daemon = daemon
    daemon.once('exit', () => {
      context.daemonExited = true
    })
    daemon.once('error', () => {
      context.daemonExited = true
    })
    daemon.unref()

    const startedEndpoint = await waitForEndpoint(runtimeDir)
    assert(startedEndpoint.pid === daemon.pid, 'El endpoint no pertenece al daemon iniciado')

    const testDir = await fs.mkdtemp(join(runtimeDir, 'cwd-'))
    const created = await runClientWorker(workerCreate, runtimeDir, testDir)
    assert(created.identity && Number.isInteger(created.identity.generation), 'create no devolvió identidad')
    assert(created.pid > 1, 'create no devolvió PID de PTY')

    await sleep(gapDelayMs + 450)
    const attached = await runClientWorker(
      workerAttach,
      runtimeDir,
      testDir,
      [String(created.pid), String(created.identity.generation)],
    )
    assert(attached.pid === created.pid, 'El PID no persistió entre clientes')
    assert(attached.identity.generation === created.identity.generation, 'La generación no persistió entre clientes')
    assert(attached.cols === 107 && attached.rows === 31, 'El tamaño no persistió entre clientes')

    const destroyed = await runClientWorker(
      workerDestroy,
      runtimeDir,
      testDir,
      [String(created.pid), String(created.identity.generation)],
    )
    assert(destroyed.destroyed === true, 'destroy no confirmó la terminación')
    console.log('SMOKE: OK. PTY real persistió shell, salida, identidad y tamaño.')
  } finally {
    await destroyOwnSession(context)
    await terminateOwnDaemon(context)
    if (runtimeDir) {
      await fs.rm(runtimeDir, { recursive: true, force: true })
    }
  }
}

async function runWorker() {
  const [mode, runtimeDir, testDir, pidText, generationText] = process.argv.slice(2)
  assert(runtimeDir && testDir, 'Faltan argumentos del cliente smoke')
  if (mode === workerCreate) {
    return runCreateWorker(runtimeDir, testDir)
  }
  const expectedPid = Number(pidText)
  const expectedGeneration = Number(generationText)
  assert(Number.isInteger(expectedPid) && expectedPid > 1, 'PID esperado incorrecto')
  assert(Number.isInteger(expectedGeneration) && expectedGeneration >= 1, 'Generación esperada incorrecta')
  if (mode === workerAttach) return runAttachWorker(runtimeDir, testDir, expectedPid, expectedGeneration)
  if (mode === workerDestroy) return runDestroyWorker(runtimeDir, expectedPid, expectedGeneration)
  throw new Error('Modo de cliente smoke desconocido')
}

const workerMode = process.argv[2]
if (workerMode === workerCreate || workerMode === workerAttach || workerMode === workerDestroy) {
  try {
    const result = await runWorker()
    console.log(`${resultPrefix}${JSON.stringify(result)}`)
  } catch (error) {
    console.error(`SMOKE CLIENT ERROR: ${redact(error instanceof Error ? error.message : error)}`)
    process.exitCode = 1
  }
} else {
  try {
    await runMain()
  } catch (error) {
    console.error(`SMOKE: ERROR. ${redact(error instanceof Error ? error.message : error)}`)
    process.exitCode = 1
  }
}
