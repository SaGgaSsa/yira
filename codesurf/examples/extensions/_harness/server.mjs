#!/usr/bin/env node
/**
 * Contex Extension Dev Harness Server
 * Serves examples/extensions/ as static root + /api/extensions discovery.
 *
 * Usage: node server.mjs [port=4040]
 */

import { createServer } from 'http'
import { readFile, readdir, stat } from 'fs/promises'
import { join, extname, resolve } from 'path'
import { fileURLToPath } from 'url'

const PORT = parseInt(process.argv[2] ?? '4040', 10)
const __dir = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dir, '..')   // examples/extensions/

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
}

async function discoverExtensions() {
  const entries = await readdir(ROOT)
  const exts = []
  for (const name of entries) {
    if (name.startsWith('_') || name.startsWith('.')) continue
    const manifestPath = join(ROOT, name, 'extension.json')
    try {
      const raw = await readFile(manifestPath, 'utf8')
      const manifest = JSON.parse(raw)
      exts.push({ dir: name, ...manifest })
    } catch {}
  }
  return exts
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const pathname = url.pathname

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')

  // API endpoint — extension discovery
  if (pathname === '/api/extensions') {
    try {
      const exts = await discoverExtensions()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(exts))
    } catch (err) {
      res.writeHead(500)
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // Static file serving — root is examples/extensions/
  let filePath = pathname === '/' ? '/_harness/index.html' : pathname

  // Security: prevent path traversal outside ROOT
  const abs = resolve(ROOT, filePath.replace(/^\//, ''))
  if (!abs.startsWith(ROOT)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  try {
    const data = await readFile(abs)
    const ext = extname(abs)
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('Not found: ' + filePath)
  }
})

server.listen(PORT, () => {
  console.log(`\n  Contex Extension Harness`)
  console.log(`  http://localhost:${PORT}\n`)
})
