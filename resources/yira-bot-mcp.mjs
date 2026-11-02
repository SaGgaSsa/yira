#!/usr/bin/env node
// Stdio MCP relay for Yira bot sessions. The CLI starts this process; every
// JSON-RPC line it reads is forwarded to the Yira bridge over HTTP. stdout is
// the protocol channel, so only JSON-RPC lines may be written there.
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const NOT_RUNNING_MESSAGE = 'Yira is not running. Open Yira and try again.'

export function parseArgs(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--bridge-file') values.bridgeFile = argv[++index]
    else if (argv[index] === '--token') values.token = argv[++index]
  }
  if (!values.bridgeFile || !values.token) {
    throw new Error('Usage: yira-bot-mcp.mjs --bridge-file <path> --token <token>')
  }
  return values
}

export async function readBridgeUrl(bridgeFile) {
  const stored = JSON.parse(await readFile(bridgeFile, 'utf8'))
  if (typeof stored?.url !== 'string' || stored.url === '') {
    throw new Error('Bridge file has no url')
  }
  return stored.url
}

function errorLine(id, message) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message } })
}

/** Returns the response line to write to stdout, or null when there is nothing to send. */
export async function relayMessage(line, { bridgeFile, token, fetchImpl = fetch }) {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return null
  }
  const id = message?.id
  const fail = (text) => (id === undefined ? null : errorLine(id, text))

  let url
  try {
    url = await readBridgeUrl(bridgeFile)
  } catch {
    return fail(NOT_RUNNING_MESSAGE)
  }

  let response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: line,
    })
  } catch {
    return fail(NOT_RUNNING_MESSAGE)
  }

  if (response.status === 202) return null
  if (!response.ok) return fail(`Yira rejected the request (HTTP ${response.status}).`)
  const body = (await response.text()).trim()
  if (body === '') return null
  return body.replace(/\r?\n/g, ' ')
}

function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exit(1)
  }

  // A promise chain keeps responses in the same order as the requests.
  let queue = Promise.resolve()
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
  lines.on('line', (line) => {
    if (line.trim() === '') return
    queue = queue.then(async () => {
      const output = await relayMessage(line, options).catch(() => null)
      if (output !== null) process.stdout.write(`${output}\n`)
    })
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
