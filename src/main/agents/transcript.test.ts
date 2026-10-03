import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { MAX_AGENT_TRANSCRIPT_ENTRY_BYTES, readAgentSessionTranscript } from './transcript'

async function makeFixtureRoot(): Promise<string> {
  return fs.mkdtemp(join(tmpdir(), 'yira-agent-transcript-'))
}

async function writeJsonLines(path: string, rows: unknown[]): Promise<void> {
  await fs.mkdir(join(path, '..'), { recursive: true })
  await fs.writeFile(path, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8')
}

test('reads visible Claude prompts, commands, and merged replies with their line breaks', async () => {
  const root = await makeFixtureRoot()
  const cwd = join(root, 'project')
  const identifier = 'claude-transcript'
  try {
    await fs.mkdir(cwd, { recursive: true })
    await writeJsonLines(join(root, 'claude', `${identifier}.jsonl`), [
      { type: 'system', sessionId: identifier, cwd },
      { type: 'user', sessionId: identifier, timestamp: '2026-09-01T10:00:00.000Z', content: 'Explain this change.\nKeep the details.' },
      { type: 'user', sessionId: identifier, content: '<command-name>/review</command-name><command-args>src/main</command-args>' },
      { type: 'user', sessionId: identifier, content: '<local-command-caveat>internal caveat</local-command-caveat>' },
      { type: 'user', sessionId: identifier, content: 'Check this.\n<system-reminder>internal hint</system-reminder>\nDiscuss risks.' },
      { type: 'user', sessionId: identifier, content: '[Request interrupted by user]' },
      { type: 'user', sessionId: identifier, isMeta: true, content: 'meta prompt' },
      { type: 'assistant', sessionId: identifier, isSidechain: true, message: { content: [{ type: 'text', text: 'sidechain reply' }] } },
      { type: 'assistant', sessionId: identifier, message: { content: [{ type: 'tool_result', text: 'tool result' }] } },
      {
        type: 'assistant',
        sessionId: identifier,
        timestamp: '2026-09-01T10:00:01.000Z',
        message: { id: 'reply-1', content: [{ type: 'text', text: 'First answer line.\nSecond answer line.' }] },
      },
      { type: 'assistant', sessionId: identifier, message: { id: 'reply-1', content: [{ type: 'text', text: 'A follow-up block.' }] } },
    ])

    const result = await readAgentSessionTranscript({ provider: 'claude', identifier }, { rootPath: join(root, 'claude') })
    assert.equal(result.found, true)
    assert.equal(result.total, 4)
    assert.deepEqual(result.entries.map(({ kind, text }) => ({ kind, text })), [
      { kind: 'prompt', text: 'Explain this change.\nKeep the details.' },
      { kind: 'command', text: '/review src/main' },
      { kind: 'prompt', text: 'Check this.\n\nDiscuss risks.' },
      { kind: 'reply', text: 'First answer line.\nSecond answer line.\n\nA follow-up block.' },
    ])
    assert.equal(result.entries[0].timestamp, '2026-09-01T10:00:00.000Z')
    assert.equal(result.entries[3].timestamp, '2026-09-01T10:00:01.000Z')
    assert.doesNotMatch(JSON.stringify(result.entries), /internal caveat|internal hint|interrupted|meta prompt|sidechain|tool result/)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('reads Codex UserMessage and assistant replies while excluding injected messages and exec sessions', async () => {
  const root = await makeFixtureRoot()
  const identifier = 'codex-transcript'
  try {
    await writeJsonLines(join(root, 'codex', `rollout-${identifier}.jsonl`), [
      { type: 'session_meta', payload: { id: identifier, thread_source: 'user' } },
      {
        type: 'response_item',
        payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'Injected developer instructions' }] },
      },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Injected context' }] } },
      {
        type: 'event_msg',
        payload: {
          type: 'item_completed',
          item: { type: 'UserMessage', content: [{ type: 'text', text: 'A Codex prompt.\nSecond line.' }] },
        },
      },
      {
        type: 'response_item',
        payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'A Codex answer.' }] },
      },
    ])
    await writeJsonLines(join(root, 'codex', 'rollout-exec-transcript.jsonl'), [
      { type: 'session_meta', payload: { id: 'exec-transcript', originator: 'codex_exec', source: 'exec' } },
      { type: 'event_msg', payload: { type: 'user_message', message: 'Internal exec prompt' } },
    ])

    const queryOptions = { rootPath: join(root, 'codex') }
    const result = await readAgentSessionTranscript({ provider: 'codex', identifier }, queryOptions)
    const execResult = await readAgentSessionTranscript({ provider: 'codex', identifier: 'exec-transcript' }, queryOptions)

    assert.equal(result.found, true)
    assert.deepEqual(result.entries.map(({ kind, text }) => ({ kind, text })), [
      { kind: 'prompt', text: 'A Codex prompt.\nSecond line.' },
      { kind: 'reply', text: 'A Codex answer.' },
    ])
    assert.doesNotMatch(JSON.stringify(result.entries), /Injected/)
    assert.deepEqual(execResult, { entries: [], start: 0, total: 0, found: false })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('pages from the end with default and capped limits and truncates oversized entries', async () => {
  const root = await makeFixtureRoot()
  const identifier = 'paging-session'
  try {
    const rows = [
      { type: 'system', sessionId: identifier },
      ...Array.from({ length: 210 }, (_, index) => ({
        type: 'user',
        sessionId: identifier,
        content: `Message ${index}`,
      })),
      {
        type: 'assistant',
        sessionId: identifier,
        message: { content: [{ type: 'text', text: 'z'.repeat(MAX_AGENT_TRANSCRIPT_ENTRY_BYTES + 5) }] },
      },
    ]
    await writeJsonLines(join(root, 'claude', `${identifier}.jsonl`), rows)
    const options = { rootPath: join(root, 'claude') }

    const defaultPage = await readAgentSessionTranscript({ provider: 'claude', identifier }, options)
    const priorPage = await readAgentSessionTranscript({ provider: 'claude', identifier, before: 205, limit: 3 }, options)
    const cappedPage = await readAgentSessionTranscript({ provider: 'claude', identifier, limit: 500 }, options)

    assert.equal(defaultPage.total, 211)
    assert.equal(defaultPage.start, 131)
    assert.equal(defaultPage.entries.length, 80)
    assert.equal(defaultPage.entries[0].text, 'Message 131')
    assert.deepEqual(priorPage, {
      entries: [
        { kind: 'prompt', text: 'Message 202' },
        { kind: 'prompt', text: 'Message 203' },
        { kind: 'prompt', text: 'Message 204' },
      ],
      start: 202,
      total: 211,
      found: true,
    })
    assert.equal(cappedPage.entries.length, 200)
    assert.equal(cappedPage.start, 11)
    assert.equal(cappedPage.entries.at(-1)?.truncated, true)
    assert.equal(Buffer.byteLength(cappedPage.entries.at(-1)?.text ?? '', 'utf8'), MAX_AGENT_TRANSCRIPT_ENTRY_BYTES)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('returns not found for missing IDs and sessions outside the requested workspace', async () => {
  const root = await makeFixtureRoot()
  const workspace = join(root, 'workspace')
  const outside = join(root, 'outside')
  const identifier = 'workspace-session'
  try {
    await fs.mkdir(workspace, { recursive: true })
    await fs.mkdir(outside, { recursive: true })
    await writeJsonLines(join(root, 'claude', `${identifier}.jsonl`), [
      { type: 'system', sessionId: identifier, cwd: workspace },
      { type: 'user', sessionId: identifier, content: 'Workspace prompt' },
    ])

    const options = { rootPath: join(root, 'claude') }
    const missing = await readAgentSessionTranscript({ provider: 'claude', identifier: 'missing-session' }, options)
    const outsideWorkspace = await readAgentSessionTranscript(
      { provider: 'claude', identifier },
      { ...options, workspaceRoot: outside },
    )

    assert.deepEqual(missing, { entries: [], start: 0, total: 0, found: false })
    assert.deepEqual(outsideWorkspace, { entries: [], start: 0, total: 0, found: false })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('streams provider transcripts larger than 2 MiB', async () => {
  const root = await makeFixtureRoot()
  const identifier = 'large-transcript'
  try {
    const rows = [
      { type: 'session_meta', payload: { id: identifier } },
      {
        type: 'event_msg',
        payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'text', text: 'Large transcript prompt' }] } },
      },
      ...Array.from({ length: 1_100 }, () => ({
        type: 'response_item',
        payload: { type: 'reasoning', summary: 'x'.repeat(2_048) },
      })),
    ]
    const transcriptPath = join(root, 'codex', `${identifier}.jsonl`)
    await writeJsonLines(transcriptPath, rows)
    assert.ok((await fs.stat(transcriptPath)).size > 2 * 1024 * 1024)

    const result = await readAgentSessionTranscript(
      { provider: 'codex', identifier },
      { rootPath: join(root, 'codex') },
    )
    assert.equal(result.found, true)
    assert.equal(result.total, 1)
    assert.equal(result.entries[0].text, 'Large transcript prompt')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
