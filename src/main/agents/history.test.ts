import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  readAgentSessionHistory,
  readClaudeSessionHistory,
  readCodexSessionHistory,
} from './history'

async function makeFixtureRoot(): Promise<string> {
  return fs.mkdtemp(join(process.cwd(), '.tmp-agent-history-'))
}

async function writeJsonLines(path: string, rows: unknown[]): Promise<void> {
  await fs.mkdir(join(path, '..'), { recursive: true })
  await fs.writeFile(path, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8')
}

test('reads Claude JSONL sessions into bounded normalized metadata', async () => {
  const root = await makeFixtureRoot()
  try {
    const cwd = join(root, 'project')
    await fs.mkdir(cwd, { recursive: true })
    await writeJsonLines(join(root, 'claude', 'session-claude.jsonl'), [
      { type: 'system', sessionId: 'session-claude', cwd, timestamp: '2026-08-10T12:00:00.000Z', model: 'sonnet' },
      { type: 'user', sessionId: 'session-claude', cwd, timestamp: '2026-08-10T12:00:01.000Z', message: { role: 'user', content: 'Plan the release' } },
      { type: 'assistant', sessionId: 'session-claude', cwd, timestamp: '2026-08-10T12:00:02.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'I will inspect the release checklist.' }] } },
    ])

    const result = await readClaudeSessionHistory({ rootPath: join(root, 'claude') })
    assert.equal(result.hasMore, false)
    assert.deepEqual(result.items.map(({ identifier, provider, model, messageCount, title, preview, startedAt, lastActivityAt }) => ({
      identifier, provider, model, messageCount, title, preview, startedAt, lastActivityAt,
    })), [{
      identifier: 'session-claude',
      provider: 'claude',
      model: 'sonnet',
      messageCount: 2,
      title: 'Plan the release',
      preview: 'I will inspect the release checklist.',
      startedAt: '2026-08-10T12:00:01.000Z',
      lastActivityAt: '2026-08-10T12:00:02.000Z',
    }])
    assert.equal(result.items[0].cwd, undefined)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('reads Codex rollout metadata and tolerates malformed or unknown files', async () => {
  const root = await makeFixtureRoot()
  try {
    const cwd = join(root, 'repo')
    await fs.mkdir(cwd, { recursive: true })
    await writeJsonLines(join(root, 'codex', 'rollout-session-codex.jsonl'), [
      { timestamp: '2026-08-10T13:00:00.000Z', type: 'session_meta', payload: { id: 'session-codex', cwd, model: 'o3' } },
      { timestamp: '2026-08-10T13:00:01.000Z', type: 'event_msg', payload: { type: 'user_message', message: 'Review this change' } },
      { timestamp: '2026-08-10T13:00:03.000Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'The change is safe.' }] } },
    ])
    await fs.writeFile(join(root, 'codex', 'malformed.jsonl'), '{not-json}\n', 'utf8')
    await writeJsonLines(join(root, 'codex', 'unknown.jsonl'), [{ type: 'event_msg', payload: { type: 'unknown' } }])
    await writeJsonLines(join(root, 'codex', 'missing-cwd.jsonl'), [
      { timestamp: '2026-08-10T13:00:00.000Z', type: 'session_meta', payload: { id: 'session-no-cwd' } },
      { timestamp: '2026-08-10T13:00:01.000Z', type: 'event_msg', payload: { type: 'user_message', message: 'No cwd is okay' } },
    ])

    const result = await readCodexSessionHistory({ rootPath: join(root, 'codex') })
    assert.equal(result.hasMore, false)
    assert.equal(result.items.length, 2)
    assert.deepEqual(result.items[0], {
      identifier: 'session-codex',
      provider: 'codex',
      model: 'o3',
      messageCount: 2,
      title: 'Review this change',
      preview: 'The change is safe.',
      startedAt: '2026-08-10T13:00:01.000Z',
      lastActivityAt: '2026-08-10T13:00:03.000Z',
    })
    assert.equal(result.items[0].cwd, undefined)
    assert.equal(result.items[1].cwd, undefined)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('filters history to a canonical workspace root and enforces result limits', async () => {
  const root = await makeFixtureRoot()
  try {
    const inside = join(root, 'workspace')
    const outside = join(root, 'outside')
    await fs.mkdir(inside, { recursive: true })
    await fs.mkdir(outside, { recursive: true })
    for (const [id, cwd, time] of [['inside-1', inside, '2026-08-10T14:00:00.000Z'], ['inside-2', inside, '2026-08-10T13:00:00.000Z'], ['outside', outside, '2026-08-10T15:00:00.000Z']] as const) {
      await writeJsonLines(join(root, 'claude', `${id}.jsonl`), [
        { type: 'system', sessionId: id, cwd, timestamp: time },
        { type: 'user', sessionId: id, cwd, timestamp: time, message: { role: 'user', content: id } },
      ])
    }

    const result = await readAgentSessionHistory({
      provider: 'claude',
      roots: { claude: join(root, 'claude'), codex: join(root, 'unused-codex') },
      workspaceRoot: `${inside}/`,
      limit: 1,
    })
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].identifier, 'inside-1')
    assert.equal(result.items[0].cwd, '.')
    assert.equal(result.hasMore, true)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('isolates pathological transcript payloads to their individual files', async () => {
  const root = await makeFixtureRoot()
  try {
    const cwd = join(root, 'project')
    await fs.mkdir(cwd, { recursive: true })
    await writeJsonLines(join(root, 'claude', 'good.jsonl'), [
      { type: 'system', sessionId: 'good-session', cwd, timestamp: '2026-08-10T15:00:00.000Z' },
      { type: 'user', sessionId: 'good-session', cwd, timestamp: '2026-08-10T15:00:01.000Z', message: { role: 'user', content: 'Keep this session' } },
    ])
    const nested = `${'{"text":'.repeat(12_000)}"ignored"${'}'.repeat(12_000)}`
    const pathological = `{"type":"assistant","sessionId":"pathological-session","message":{"role":"assistant","content":${nested}}}`
    await fs.writeFile(join(root, 'claude', 'pathological.jsonl'), `${pathological}\n`, 'utf8')

    const result = await readClaudeSessionHistory({ rootPath: join(root, 'claude') })
    assert.deepEqual(result.items.map((item) => item.identifier), ['good-session'])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
