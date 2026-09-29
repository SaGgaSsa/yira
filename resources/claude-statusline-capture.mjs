#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const chainArgument = process.argv.slice(2).find((argument) => argument.startsWith('--yira-chain='))

function getDirectory() {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  return path.join(configDir, 'statusline')
}

async function cleanup(directory, now = Date.now()) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    await Promise.all(entries.map(async (entry) => {
      if (!entry.isFile() || !(entry.name.endsWith('.json') || entry.name.startsWith('.yira-statusline-') && entry.name.endsWith('.tmp'))) return
      const file = path.join(directory, entry.name)
      try {
        const info = await fs.stat(file)
        if (now - info.mtimeMs > MAX_AGE_MS) await fs.unlink(file)
      } catch {}
    }))
  } catch {}
}

async function capture(input) {
  try {
    const value = JSON.parse(input)
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.session_id !== 'string') return
    const sessionId = value.session_id.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 128)
    if (!sessionId) return
    const directory = getDirectory()
    await fs.mkdir(directory, { recursive: true })
    const target = path.join(directory, `${sessionId}.json`)
    const temporary = path.join(directory, `.yira-statusline-${process.pid}-${randomUUID()}.tmp`)
    await fs.writeFile(temporary, input, 'utf8')
    await fs.rename(temporary, target)
  } catch {}
}

function getPreviousStatusLine() {
  if (!chainArgument) return null
  try {
    const encoded = chainArgument.slice('--yira-chain='.length)
    const value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    return value && typeof value === 'object' && typeof value.command === 'string' && value.command.trim() ? value : null
  } catch { return null }
}

function runPrevious(command, input) {
  return new Promise((resolve) => {
    let child
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve()
    }
    const start = (file, args, options) => {
      try {
        child = spawn(file, args, { ...options, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
      } catch { finish(); return }
      const current = child
      current.stdout?.on('data', (chunk) => {
        try { process.stdout.write(chunk) } catch {}
      })
      current.once('error', () => {
        if (options.shell === false && process.platform === 'win32') start(command, [], { shell: true })
        else finish()
      })
      current.once('close', () => {
        if (current === child) finish()
      })
      current.stdin?.on('error', () => undefined)
      current.stdin?.end(input)
    }
    const timeout = setTimeout(() => {
      child?.kill()
      finish()
    }, 5000)
    if (process.platform === 'win32') {
      const bash = process.env.CLAUDE_CODE_GIT_BASH_PATH || 'bash'
      start(bash, ['-c', command], { shell: false })
    } else {
      start(command, [], { shell: process.env.SHELL || true })
    }
  })
}

async function main() {
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  await capture(input)
  await cleanup(getDirectory())
  const previous = getPreviousStatusLine()
  if (previous) await runPrevious(previous.command, input)
}

void main().catch(() => undefined)
