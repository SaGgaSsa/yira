import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  clearAgentHistoryCache,
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

test('omits current and legacy Codex subagent transcripts', async () => {
  const root = await makeFixtureRoot()
  try {
    const cwd = join(root, 'repo')
    await fs.mkdir(cwd, { recursive: true })
    await writeJsonLines(join(root, 'codex', 'user.jsonl'), [
      { type: 'session_meta', payload: { id: 'user-session', cwd, thread_source: 'user' } },
      { type: 'event_msg', payload: { type: 'user_message', message: 'Top-level task' } },
    ])
    await writeJsonLines(join(root, 'codex', 'worker.jsonl'), [
      { type: 'session_meta', payload: { id: 'worker-session', cwd, thread_source: 'subagent' } },
      { type: 'event_msg', payload: { type: 'user_message', message: 'Internal task' } },
    ])
    await writeJsonLines(join(root, 'codex', 'legacy-worker.jsonl'), [
      { type: 'session_meta', payload: { id: 'legacy-worker-session', cwd, source: { subagent: {} } } },
      { type: 'event_msg', payload: { type: 'user_message', message: 'Legacy internal task' } },
    ])

    const result = await readCodexSessionHistory({ rootPath: join(root, 'codex') })
    assert.deepEqual(result.items.map((item) => item.identifier), ['user-session'])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('accepts case-insensitive user sources and rejects invalid present thread_source values', async () => {
  const root = await makeFixtureRoot()
  try {
    const cwd = join(root, 'repo')
    await fs.mkdir(cwd, { recursive: true })
    await writeJsonLines(join(root, 'codex', 'uppercase-user.jsonl'), [
      { type: 'session_meta', payload: { id: 'uppercase-user-session', cwd, thread_source: 'USER' } },
      { type: 'event_msg', payload: { type: 'user_message', message: 'Top-level task' } },
    ])
    await writeJsonLines(join(root, 'codex', 'invalid-empty.jsonl'), [
      { type: 'session_meta', payload: { id: 'invalid-empty-session', cwd, thread_source: '' } },
      { type: 'event_msg', payload: { type: 'user_message', message: 'Invalid empty source' } },
    ])
    await writeJsonLines(join(root, 'codex', 'invalid-null.jsonl'), [
      { type: 'session_meta', payload: { id: 'invalid-null-session', cwd, thread_source: null } },
      { type: 'event_msg', payload: { type: 'user_message', message: 'Invalid null source' } },
    ])
    await writeJsonLines(join(root, 'codex', 'invalid-type.jsonl'), [
      { type: 'session_meta', payload: { id: 'invalid-type-session', cwd, thread_source: { value: 'user' } } },
      { type: 'event_msg', payload: { type: 'user_message', message: 'Invalid typed source' } },
    ])
    await writeJsonLines(join(root, 'codex', 'invalid-control.jsonl'), [
      { type: 'session_meta', payload: { id: 'invalid-control-session', cwd, thread_source: '\u0000' } },
      { type: 'event_msg', payload: { type: 'user_message', message: 'Invalid control source' } },
    ])

    const result = await readCodexSessionHistory({ rootPath: join(root, 'codex') })
    assert.deepEqual(result.items.map((item) => item.identifier), ['uppercase-user-session'])
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

test('normalizes multiline provider messages while retaining counts and timestamps', async () => {
  const root = await makeFixtureRoot()
  try {
    await writeJsonLines(join(root, 'claude', 'multiline-claude.jsonl'), [
      { type: 'system', sessionId: 'multiline-claude', timestamp: '2026-08-10T16:00:00.000Z' },
      { type: 'user', sessionId: 'multiline-claude', timestamp: '2026-08-10T16:00:01.000Z', message: { role: 'user', content: 'First line\nSecond\tline' } },
      { type: 'assistant', sessionId: 'multiline-claude', timestamp: '2026-08-10T16:00:02.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Reply line\r\nnext' }] } },
    ])
    await writeJsonLines(join(root, 'codex', 'multiline-codex.jsonl'), [
      { type: 'session_meta', timestamp: '2026-08-10T16:01:00.000Z', payload: { id: 'multiline-codex' } },
      { type: 'event_msg', timestamp: '2026-08-10T16:01:01.000Z', payload: { type: 'user_message', message: 'Codex\tquestion\ncontinued' } },
      { type: 'response_item', timestamp: '2026-08-10T16:01:02.000Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Codex answer\nnext' }] } },
    ])
    await writeJsonLines(join(root, 'claude', 'unsafe-control.jsonl'), [
      { type: 'user', sessionId: 'unsafe-control', timestamp: '2026-08-10T16:02:01.000Z', message: { role: 'user', content: 'unsafe\u0000content' } },
    ])

    const claude = await readClaudeSessionHistory({ rootPath: join(root, 'claude') })
    const codex = await readCodexSessionHistory({ rootPath: join(root, 'codex') })
    assert.deepEqual(claude.items, [{
      identifier: 'multiline-claude',
      provider: 'claude',
      startedAt: '2026-08-10T16:00:01.000Z',
      lastActivityAt: '2026-08-10T16:00:02.000Z',
      title: 'First line Second line',
      preview: 'Reply line next',
      messageCount: 2,
    }])
    assert.deepEqual(codex.items, [{
      identifier: 'multiline-codex',
      provider: 'codex',
      startedAt: '2026-08-10T16:01:01.000Z',
      lastActivityAt: '2026-08-10T16:01:02.000Z',
      title: 'Codex question continued',
      preview: 'Codex answer next',
      messageCount: 2,
    }])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('chooses the newest title at the highest available priority', async () => {
  const root = await makeFixtureRoot()
  try {
    const claudeRoot = join(root, 'claude')
    await writeJsonLines(join(claudeRoot, 'custom.jsonl'), [
      { type: 'system', sessionId: 'custom-title-session' },
      { type: 'user', sessionId: 'custom-title-session', content: 'First prompt' },
      { type: 'user', sessionId: 'custom-title-session', content: 'Second prompt' },
      { type: 'ai-title', sessionId: 'custom-title-session', aiTitle: 'Older AI title' },
      { type: 'ai-title', sessionId: 'custom-title-session', aiTitle: 'Newest AI title' },
      { type: 'custom-title', sessionId: 'custom-title-session', customTitle: 'Older custom title' },
      { type: 'custom-title', sessionId: 'custom-title-session', customTitle: 'Newest custom title' },
      { type: 'summary', sessionId: 'custom-title-session', summary: 'Summary title' },
    ])
    await writeJsonLines(join(claudeRoot, 'ai.jsonl'), [
      { type: 'system', sessionId: 'ai-title-session' },
      { type: 'user', sessionId: 'ai-title-session', content: 'Prompt title' },
      { type: 'ai-title', sessionId: 'ai-title-session', aiTitle: 'Older AI title' },
      { type: 'ai-title', sessionId: 'ai-title-session', aiTitle: 'Newest AI title' },
    ])
    await writeJsonLines(join(claudeRoot, 'summary.jsonl'), [
      { type: 'system', sessionId: 'summary-title-session' },
      { type: 'user', sessionId: 'summary-title-session', content: 'Prompt title' },
      { type: 'summary', sessionId: 'summary-title-session', summary: 'Older summary' },
      { type: 'summary', sessionId: 'summary-title-session', summary: 'Newest summary' },
    ])
    await writeJsonLines(join(claudeRoot, 'prompt.jsonl'), [
      { type: 'system', sessionId: 'prompt-title-session' },
      { type: 'user', sessionId: 'prompt-title-session', content: 'First prompt' },
      { type: 'user', sessionId: 'prompt-title-session', content: 'Second prompt' },
    ])

    const result = await readClaudeSessionHistory({ rootPath: claudeRoot })
    const titles = Object.fromEntries(result.items.map((item) => [item.identifier, item.title]))
    assert.deepEqual(titles, {
      'custom-title-session': 'Newest custom title',
      'ai-title-session': 'Newest AI title',
      'summary-title-session': 'Newest summary',
      'prompt-title-session': 'First prompt',
    })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('omits Claude sessions containing only local commands and command notices', async () => {
  const root = await makeFixtureRoot()
  try {
    await writeJsonLines(join(root, 'claude', 'local-only.jsonl'), [
      { type: 'system', sessionId: 'local-only' },
      { type: 'user', sessionId: 'local-only', content: '<command-name>/trivia</command-name><command-message>trivia</command-message>' },
      { type: 'user', sessionId: 'local-only', content: '<local-command-caveat>local command</local-command-caveat>' },
      { type: 'user', sessionId: 'local-only', content: '<local-command-stdout>done</local-command-stdout>' },
    ])

    const result = await readClaudeSessionHistory({ rootPath: join(root, 'claude') })
    assert.deepEqual(result.items, [])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('uses the first local command as title when a reply makes the session visible', async () => {
  const root = await makeFixtureRoot()
  try {
    await writeJsonLines(join(root, 'claude', 'simplify.jsonl'), [
      { type: 'system', sessionId: 'simplify-session' },
      { type: 'user', sessionId: 'simplify-session', content: '<command-name>/simplify</command-name>' },
      { type: 'assistant', sessionId: 'simplify-session', message: { content: [{ type: 'text', text: 'Simplified response' }] } },
    ])

    const result = await readClaudeSessionHistory({ rootPath: join(root, 'claude') })
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].title, '/simplify')
    assert.equal(result.items[0].preview, 'Simplified response')
    assert.equal(result.items[0].messageCount, 1)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('history titles and previews exclude local command and system reminder tags', async () => {
  const root = await makeFixtureRoot()
  try {
    await writeJsonLines(join(root, 'claude', 'clean-visible.jsonl'), [
      { type: 'system', sessionId: 'clean-visible' },
      { type: 'user', sessionId: 'clean-visible', content: '<command-name>/trivia</command-name>' },
      {
        type: 'user',
        sessionId: 'clean-visible',
        content: 'Explain this change.\n<system-reminder>internal hint</system-reminder>\nMention risks.',
      },
      { type: 'assistant', sessionId: 'clean-visible', message: { content: [{ type: 'text', text: 'Visible answer only' }] } },
    ])

    const result = await readClaudeSessionHistory({ rootPath: join(root, 'claude') })
    assert.equal(result.items[0].title, 'Explain this change. Mention risks.')
    assert.equal(result.items[0].preview, 'Visible answer only')
    assert.doesNotMatch(`${result.items[0].title} ${result.items[0].preview}`, /<local-command|<command-name|<system-reminder/i)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('omits Codex exec sessions and uses current UserMessage records for titles', async () => {
  const root = await makeFixtureRoot()
  try {
    const codexRoot = join(root, 'codex')
    await writeJsonLines(join(codexRoot, 'exec.jsonl'), [
      { type: 'session_meta', payload: { id: 'exec-session', originator: 'codex_exec', source: 'exec', thread_source: 'user' } },
      { type: 'event_msg', payload: { type: 'user_message', message: 'Internal exec task' } },
    ])
    await writeJsonLines(join(codexRoot, 'current.jsonl'), [
      { type: 'session_meta', payload: { id: 'current-session', originator: 'codex-tui', source: 'vscode', thread_source: 'user' } },
      { type: 'response_item', payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'Injected instructions' }] } },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Injected environment context' }] } },
      { type: 'event_msg', payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'text', text: 'Real Codex prompt' }] } } },
      { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Codex reply' }] } },
    ])

    const result = await readCodexSessionHistory({ rootPath: codexRoot })
    assert.deepEqual(result.items.map((item) => ({ identifier: item.identifier, title: item.title, messageCount: item.messageCount })), [{
      identifier: 'current-session',
      title: 'Real Codex prompt',
      messageCount: 2,
    }])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('streams Codex transcripts larger than 2 MiB', async () => {
  const root = await makeFixtureRoot()
  try {
    const rows = [
      { type: 'session_meta', payload: { id: 'large-session' } },
      { type: 'event_msg', payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'text', text: 'Large transcript prompt' }] } } },
      ...Array.from({ length: 1_100 }, () => ({
        type: 'response_item',
        payload: { type: 'reasoning', summary: 'x'.repeat(2_048) },
      })),
    ]
    const transcriptPath = join(root, 'codex', 'large.jsonl')
    await writeJsonLines(transcriptPath, rows)
    assert.ok((await fs.stat(transcriptPath)).size > 2 * 1024 * 1024)

    const result = await readCodexSessionHistory({ rootPath: join(root, 'codex') })
    assert.equal(result.items[0].identifier, 'large-session')
    assert.equal(result.items[0].title, 'Large transcript prompt')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('reuses cached transcripts and refreshes them when size or mtime changes', async () => {
  const root = await makeFixtureRoot()
  const transcriptPath = join(root, 'claude', 'cached.jsonl')
  const stableMtime = new Date('2026-08-10T17:00:00.000Z')
  clearAgentHistoryCache()
  try {
    const originalRows = [
      { type: 'system', sessionId: 'cached-session' },
      { type: 'user', sessionId: 'cached-session', content: 'Original' },
    ]
    await writeJsonLines(transcriptPath, originalRows)
    await fs.utimes(transcriptPath, stableMtime, stableMtime)
    const initial = await readClaudeSessionHistory({ rootPath: join(root, 'claude') })
    assert.equal(initial.items[0].title, 'Original')

    await writeJsonLines(transcriptPath, [
      { type: 'system', sessionId: 'cached-session' },
      { type: 'user', sessionId: 'cached-session', content: 'Replaced' },
    ])
    await fs.utimes(transcriptPath, stableMtime, stableMtime)
    const reused = await readClaudeSessionHistory({ rootPath: join(root, 'claude') })
    assert.equal(reused.items[0].title, 'Original')

    await writeJsonLines(transcriptPath, [
      { type: 'system', sessionId: 'cached-session' },
      { type: 'user', sessionId: 'cached-session', content: 'Updated prompt with a new size' },
    ])
    const refreshed = await readClaudeSessionHistory({ rootPath: join(root, 'claude') })
    assert.equal(refreshed.items[0].title, 'Updated prompt with a new size')
  } finally {
    clearAgentHistoryCache()
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('deduplicates Claude assistant blocks that share a message id', async () => {
  const root = await makeFixtureRoot()
  try {
    await writeJsonLines(join(root, 'claude', 'deduplicated.jsonl'), [
      { type: 'system', sessionId: 'deduplicated-session' },
      { type: 'user', sessionId: 'deduplicated-session', content: 'Question' },
      { type: 'assistant', sessionId: 'deduplicated-session', message: { id: 'reply-id', content: [{ type: 'text', text: 'First block' }] } },
      { type: 'assistant', sessionId: 'deduplicated-session', message: { id: 'reply-id', content: [{ type: 'text', text: 'Second block' }] } },
    ])

    const result = await readClaudeSessionHistory({ rootPath: join(root, 'claude') })
    assert.equal(result.items[0].messageCount, 2)
    assert.equal(result.items[0].preview, 'Second block')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
