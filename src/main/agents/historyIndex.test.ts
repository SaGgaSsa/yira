import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  clearAgentHistoryIndex,
  configureAgentHistoryIndex,
  ensureAgentHistoryIndexLoaded,
  flushAgentHistoryIndex,
  getStoredTranscript,
  pruneStoredTranscripts,
  setStoredTranscript,
  type StoredTranscript,
} from './historyIndex'

function sampleEntry(overrides: Partial<StoredTranscript> = {}): StoredTranscript {
  return {
    provider: 'claude',
    size: 128,
    mtimeMs: 1_754_830_000_000,
    offset: 128,
    tail: Buffer.from('{"type":"user"}\n', 'utf8').toString('base64'),
    excluded: false,
    head: { cwd: 'C:\\workspaces\\demo' },
    session: { identifier: 'session-demo', messageCount: 2, preview: 'Demo prompt' },
    ...overrides,
  }
}

test('persists transcript entries to disk and reloads them after a clear', async () => {
  const root = await fs.mkdtemp(join(process.cwd(), '.tmp-agent-history-index-'))
  const indexPath = join(root, 'history-index.json')
  configureAgentHistoryIndex(indexPath)
  try {
    const livePath = join(root, 'session.jsonl')
    const excludedPath = join(root, 'worker.jsonl')
    setStoredTranscript(livePath, sampleEntry())
    setStoredTranscript(excludedPath, sampleEntry({ provider: 'codex', excluded: true, head: undefined, session: null }))
    await flushAgentHistoryIndex()

    clearAgentHistoryIndex()
    assert.equal(getStoredTranscript(livePath), undefined)

    await ensureAgentHistoryIndexLoaded()
    assert.deepEqual(getStoredTranscript(livePath), sampleEntry())
    const excludedEntry = getStoredTranscript(excludedPath)
    assert.equal(excludedEntry?.provider, 'codex')
    assert.equal(excludedEntry?.excluded, true)
    assert.equal(excludedEntry?.session, null)
    assert.equal(excludedEntry?.head, undefined)
  } finally {
    configureAgentHistoryIndex(null)
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('starts from an empty index when the file is missing, invalid, or off-version', async () => {
  const root = await fs.mkdtemp(join(process.cwd(), '.tmp-agent-history-index-'))
  const indexPath = join(root, 'history-index.json')
  try {
    configureAgentHistoryIndex(indexPath)
    await ensureAgentHistoryIndexLoaded()
    assert.equal(getStoredTranscript(join(root, 'anything.jsonl')), undefined)

    await fs.writeFile(indexPath, '{"version":99,"files":{}}', 'utf8')
    configureAgentHistoryIndex(indexPath)
    await ensureAgentHistoryIndexLoaded()
    assert.equal(getStoredTranscript(join(root, 'anything.jsonl')), undefined)

    await fs.writeFile(indexPath, 'not json at all', 'utf8')
    configureAgentHistoryIndex(indexPath)
    await ensureAgentHistoryIndexLoaded()
    assert.equal(getStoredTranscript(join(root, 'anything.jsonl')), undefined)

    await fs.writeFile(indexPath, JSON.stringify({
      version: 1,
      files: { 'broken.jsonl': { provider: 'unknown', size: -1 }, 'valid.jsonl': sampleEntry() },
    }), 'utf8')
    configureAgentHistoryIndex(indexPath)
    await ensureAgentHistoryIndexLoaded()
    assert.equal(getStoredTranscript('broken.jsonl'), undefined)
    assert.deepEqual(getStoredTranscript('valid.jsonl'), sampleEntry())
  } finally {
    configureAgentHistoryIndex(null)
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('prunes entries under the root that are no longer live', async () => {
  configureAgentHistoryIndex(null)
  try {
    const rootA = 'C:\\roots\\alpha'
    const rootB = 'C:\\roots\\beta'
    const livePath = join(rootA, 'live.jsonl')
    const deadPath = join(rootA, 'dead.jsonl')
    const otherRootPath = join(rootB, 'kept.jsonl')
    setStoredTranscript(livePath, sampleEntry())
    setStoredTranscript(deadPath, sampleEntry())
    setStoredTranscript(otherRootPath, sampleEntry())

    pruneStoredTranscripts(rootA, new Set([livePath]))
    assert.notEqual(getStoredTranscript(livePath), undefined)
    assert.equal(getStoredTranscript(deadPath), undefined)
    assert.notEqual(getStoredTranscript(otherRootPath), undefined)
  } finally {
    clearAgentHistoryIndex()
  }
})
