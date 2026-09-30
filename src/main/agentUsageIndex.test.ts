import assert from 'node:assert/strict'
import { appendFile, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { AgentUsageIndex } from './agentUsageIndex'

const row = (id: string, output: number, timestamp: string) => JSON.stringify({
  type: 'assistant',
  timestamp,
  sessionId: 'claude-1',
  cwd: '/work/app',
  message: { id, model: 'claude-sonnet', usage: { input_tokens: 5, output_tokens: output } },
})

test('incremental Claude reads wait for complete lines and deduplicate message ids across refreshes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yira-index-'))
  try {
    const root = join(dir, 'claude')
    const project = join(root, 'project')
    await mkdir(project, { recursive: true })
    let now = new Date(2026, 8, 28, 12).getTime()
    const stamp = new Date(now).toISOString()
    const file = join(project, 'session.jsonl')
    await writeFile(file, row('m1', 2, stamp))
    await utimes(file, now / 1000, now / 1000)
    const index = new AgentUsageIndex({ now: () => now, roots: { claude: root }, indexPath: join(dir, 'usage-index.json') })
    const request = { period: 'today' as const }
    const first = await index.getHistory(request, ['claude'])
    assert.equal(first.totals.total, 0)
    assert.equal(first.indexing, true)
    await index.refresh(['claude'])
    assert.equal((await index.getHistory(request, ['claude'])).indexing, false)

    now += 61_000
    await appendFile(file, '\n')
    await utimes(file, now / 1000, now / 1000)
    assert.equal((await index.getHistory(request, ['claude'])).totals.total, 7)

    now += 61_000
    await appendFile(file, `${row('m1', 9, stamp)}\n`)
    await utimes(file, now / 1000, now / 1000)
    const snapshot = await index.getHistory(request, ['claude'])
    assert.equal(snapshot.totals.total, 14)
    assert.equal(snapshot.byModel[0]?.tokens, 14)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('Codex context persists across appended reads and truncation replaces old contributions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yira-index-'))
  try {
    const root = join(dir, 'codex')
    const day = join(root, '2026', '09', '28')
    await mkdir(day, { recursive: true })
    let now = new Date(2026, 8, 28, 12).getTime()
    const stamp = new Date(now).toISOString()
    const file = join(day, 'session.jsonl')
    const meta = JSON.stringify({ type: 'session_meta', payload: { id: 'codex-1', cwd: '/work/app', model: 'gpt-test' } })
    await writeFile(file, `${meta}\n`)
    await utimes(file, now / 1000, now / 1000)
    const index = new AgentUsageIndex({ now: () => now, roots: { codex: root }, indexPath: join(dir, 'usage-index.json') })
    const request = { period: 'today' as const }
    const first = await index.getHistory(request, ['codex'])
    assert.equal(first.indexing, true)
    await index.refresh(['codex'])

    now += 61_000
    const event = JSON.stringify({
      type: 'event_msg',
      timestamp: stamp,
      payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 3 } } },
    })
    await appendFile(file, `${event}\n`)
    await utimes(file, now / 1000, now / 1000)
    assert.equal((await index.getHistory(request, ['codex'])).totals.total, 13)

    now += 61_000
    await writeFile(file, `${meta}\n`)
    await utimes(file, now / 1000, now / 1000)
    assert.equal((await index.getHistory(request, ['codex'])).totals.total, 0)
    assert.equal((await index.getHistory(request, ['codex'], [])).byWorkspace.length, 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('history builds zero-filled local series, filters providers and skips disabled agents', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yira-index-'))
  try {
    const root = join(dir, 'claude')
    const project = join(root, 'project')
    await mkdir(project, { recursive: true })
    const now = new Date(2026, 8, 28, 12).getTime()
    const disabledFile = join(project, 'disabled.jsonl')
    await writeFile(disabledFile, `${row('disabled-message', 10, new Date(now).toISOString())}\n`)
    await utimes(disabledFile, now / 1000, now / 1000)
    const index = new AgentUsageIndex({ now: () => now, roots: { claude: root }, indexPath: join(dir, 'usage-index.json') })
    const first = await index.getHistory({ period: 'today', providers: ['claude'] }, ['claude', 'codex'])
    assert.equal(first.indexing, true)
    await index.refresh(['claude', 'codex'])

    const today = await index.getHistory({ period: 'today', providers: ['claude'] }, ['claude', 'codex'])
    assert.equal(today.series.points.length, 24)
    assert.equal(today.byModel[0]?.model, 'claude-sonnet')
    assert.deepEqual(today.providers, ['claude'])
    const week = await index.getHistory({ period: '7d', providers: ['claude'] }, ['claude'])
    assert.equal(week.series.points.length, 7)
    const disabled = await index.getHistory({ period: '30d' }, [])
    assert.deepEqual(disabled.providers, [])
    assert.equal(disabled.series.points.length, 30)
    assert.deepEqual(Object.keys(JSON.parse(await readFile(join(dir, 'usage-index.json'), 'utf8')).files), [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('unchanged index is not persisted again after an incremental refresh', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yira-index-'))
  try {
    const root = join(dir, 'claude')
    const project = join(root, 'project')
    await mkdir(project, { recursive: true })
    let now = new Date(2026, 8, 28, 12).getTime()
    const file = join(project, 'session.jsonl')
    await writeFile(file, `${row('stable', 1, new Date(now).toISOString())}\n`)
    await utimes(file, now / 1000, now / 1000)
    let writes = 0
    const index = new AgentUsageIndex({
      now: () => now,
      roots: { claude: root },
      indexPath: join(dir, 'usage-index.json'),
      onPersist: () => { writes += 1 },
    })
    await index.getHistory({ period: 'today' }, ['claude'])
    await index.refresh(['claude'])
    assert.equal(writes, 1)
    now += 61_000
    await index.refresh(['claude'])
    assert.equal(writes, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
