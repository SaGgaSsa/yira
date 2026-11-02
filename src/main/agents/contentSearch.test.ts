import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { clearAgentHistoryCache } from './history'
import { searchSessionContent } from './contentSearch'

interface Fixture {
  root: string
  workspace: string
  outside: string
}

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(join(process.cwd(), '.tmp-agent-content-search-'))
  clearAgentHistoryCache()
  try {
    const workspace = join(root, 'workspace')
    const outside = join(root, 'outside')
    await fs.mkdir(workspace, { recursive: true })
    await fs.mkdir(outside, { recursive: true })
    await run({ root, workspace, outside })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

async function writeSession(
  fixture: Fixture,
  identifier: string,
  cwd: string,
  extraRows: unknown[],
  time = '2026-08-10T12:00:00.000Z',
): Promise<void> {
  const rows = [
    { type: 'system', sessionId: identifier, cwd, timestamp: time },
    { type: 'user', sessionId: identifier, cwd, timestamp: time, message: { role: 'user', content: `Task for ${identifier}` } },
    ...extraRows,
  ]
  await fs.mkdir(join(fixture.root, 'claude'), { recursive: true })
  await fs.writeFile(join(fixture.root, 'claude', `${identifier}.jsonl`), rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8')
}

function toolResultRow(identifier: string, cwd: string, text: string): unknown {
  return {
    type: 'user',
    sessionId: identifier,
    cwd,
    timestamp: '2026-08-10T12:00:05.000Z',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: text }] },
  }
}

function search(fixture: Fixture, query: string, extra: { limit?: number } = {}) {
  return searchSessionContent({
    query,
    workspaceRoots: [fixture.workspace],
    provider: 'claude',
    roots: { claude: join(fixture.root, 'claude'), codex: join(fixture.root, 'unused-codex') },
    ...extra,
  })
}

test('finds a phrase inside a tool result line', async () => {
  await withFixture(async (fixture) => {
    await writeSession(fixture, 'session-hit', fixture.workspace, [
      toolResultRow('session-hit', fixture.workspace, 'Error: EADDRINUSE port 4317 already in use'),
    ])
    await writeSession(fixture, 'session-miss', fixture.workspace, [])

    const matches = await search(fixture, 'eaddrinuse')
    assert.deepEqual(matches.map((match) => match.identifier), ['session-hit'])
    assert.equal(matches[0].provider, 'claude')
    assert.equal(matches[0].matchCount, 1)
    assert.equal(matches[0].title, 'Task for session-hit')
    assert.match(matches[0].snippets[0], /EADDRINUSE port 4317/)
  })
})

test('requires every term to appear on the same line', async () => {
  await withFixture(async (fixture) => {
    await writeSession(fixture, 'both-terms', fixture.workspace, [
      toolResultRow('both-terms', fixture.workspace, 'timeout while reading the cache'),
    ])
    await writeSession(fixture, 'split-terms', fixture.workspace, [
      toolResultRow('split-terms', fixture.workspace, 'timeout in the socket'),
      toolResultRow('split-terms', fixture.workspace, 'the cache was cleared'),
    ])

    const matches = await search(fixture, 'timeout cache')
    assert.deepEqual(matches.map((match) => match.identifier), ['both-terms'])
  })
})

test('ignores sessions outside the workspace roots', async () => {
  await withFixture(async (fixture) => {
    await writeSession(fixture, 'inside', fixture.workspace, [
      toolResultRow('inside', fixture.workspace, 'flaky snapshot test'),
    ])
    await writeSession(fixture, 'elsewhere', fixture.outside, [
      toolResultRow('elsewhere', fixture.outside, 'flaky snapshot test'),
    ])

    const matches = await search(fixture, 'flaky snapshot')
    assert.deepEqual(matches.map((match) => match.identifier), ['inside'])
  })
})

test('orders by match count and honors the limit', async () => {
  await withFixture(async (fixture) => {
    await writeSession(fixture, 'once', fixture.workspace, [
      toolResultRow('once', fixture.workspace, 'deadlock found'),
    ], '2026-08-10T15:00:00.000Z')
    await writeSession(fixture, 'twice', fixture.workspace, [
      toolResultRow('twice', fixture.workspace, 'deadlock found'),
      toolResultRow('twice', fixture.workspace, 'deadlock again'),
    ], '2026-08-10T10:00:00.000Z')

    const all = await search(fixture, 'deadlock')
    assert.deepEqual(all.map((match) => [match.identifier, match.matchCount]), [['twice', 2], ['once', 1]])
    assert.equal(all[0].snippets.length, 2)

    const limited = await search(fixture, 'deadlock', { limit: 1 })
    assert.deepEqual(limited.map((match) => match.identifier), ['twice'])
  })
})

test('trims snippets around the first term with ellipses', async () => {
  await withFixture(async (fixture) => {
    const text = `${'a'.repeat(300)} NEEDLE ${'b'.repeat(300)}`
    await writeSession(fixture, 'long-line', fixture.workspace, [toolResultRow('long-line', fixture.workspace, text)])

    const [match] = await search(fixture, 'needle')
    const snippet = match.snippets[0]
    assert.ok(snippet.startsWith('…'))
    assert.ok(snippet.endsWith('…'))
    assert.ok(snippet.includes('NEEDLE'))
    assert.ok(snippet.length <= 240)
  })
})

test('rejects invalid input with a clear error', async () => {
  const roots = { claude: 'unused', codex: 'unused' }
  await assert.rejects(() => searchSessionContent({ query: ' a ', workspaceRoots: ['x'], roots }), /Search query must be 2 to 200/)
  await assert.rejects(() => searchSessionContent({ query: 'ok', workspaceRoots: [], roots }), /workspace roots/)
  await assert.rejects(() => searchSessionContent({ query: 'ok', workspaceRoots: ['x'], limit: 0, roots }), /limit/)
})
