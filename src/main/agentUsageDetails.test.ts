import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { AgentUsageDetailsService } from './agentUsageDetails'

test('summarizes current-day Claude and Codex transcripts and reuses unchanged file cache', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'yira-agent-usage-'))
  try {
    let now = new Date(2026, 8, 28, 12, 15).getTime()
    const today = new Date(now).toISOString()
    const yesterday = new Date(now - 24 * 60 * 60_000).toISOString()
    const claudeRoot = join(temporary, 'claude')
    const claudeProject = join(claudeRoot, 'project')
    const codexRoot = join(temporary, 'codex')
    const codexDay = join(codexRoot, '2026', '09', '28')
    await mkdir(claudeProject, { recursive: true })
    await mkdir(codexDay, { recursive: true })
    const claudeFile = join(claudeProject, 'session.jsonl')
    await writeFile(claudeFile, [
      { type: 'assistant', timestamp: today, sessionId: 'claude-session', cwd: '/work/app', message: { id: 'message-1', model: 'claude-sonnet', usage: { input_tokens: 20, cache_creation_input_tokens: 5, cache_read_input_tokens: 10, output_tokens: 4 } } },
      { type: 'assistant', timestamp: today, sessionId: 'claude-session', cwd: '/work/app', message: { id: 'message-1', model: 'claude-sonnet', usage: { input_tokens: 20, cache_creation_input_tokens: 5, cache_read_input_tokens: 10, output_tokens: 8 } } },
      { type: 'assistant', timestamp: yesterday, sessionId: 'claude-session', message: { id: 'old', model: 'claude-sonnet', usage: { input_tokens: 500, output_tokens: 500 } } },
    ].map((row) => JSON.stringify(row)).join('\n'))
    const codexFile = join(codexDay, 'session.jsonl')
    await writeFile(codexFile, [
      { type: 'session_meta', payload: { id: 'codex-session', cwd: '/work/app', model: 'gpt-5' } },
      { type: 'event_msg', timestamp: today, payload: { type: 'token_count', info: null } },
      { type: 'event_msg', timestamp: today, payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 100, cached_input_tokens: 60, cache_write_input_tokens: 3, output_tokens: 10, reasoning_output_tokens: 7 }, model_context_window: 258400 } } },
      { type: 'session_meta', payload: { id: 'codex-worker', cwd: '/work/app', model: 'gpt-5', thread_source: 'subagent' } },
      { type: 'event_msg', timestamp: today, payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 50, cached_input_tokens: 10, output_tokens: 2 } } } },
    ].map((row) => JSON.stringify(row)).join('\n'))
    await Promise.all([utimes(claudeFile, now / 1000, now / 1000), utimes(codexFile, now / 1000, now / 1000)])
    const service = new AgentUsageDetailsService({
      now: () => now,
      roots: { claude: claudeRoot, codex: codexRoot },
      getConfiguredProviders: async () => ['claude', 'codex'],
      getWorkspaces: async () => [{ id: 'workspace-1', rootFolderPath: '/work/app' }],
    })
    const snapshot = await service.getSnapshot()
    assert.deepEqual(snapshot.providers.claude?.tokens, { input: 20, cacheRead: 10, cacheWrite: 5, output: 8, reasoning: 0 })
    assert.equal(snapshot.providers.claude?.hourly[new Date(now).getHours()], 43)
    assert.equal(snapshot.providers.claude?.sessionCount, 1)
    assert.deepEqual(snapshot.providers.claude?.topModel, { name: 'claude-sonnet', share: 1 })
    assert.equal(snapshot.providers.claude?.tokensByWorkspace['workspace-1'], 43)
    assert.deepEqual(snapshot.providers.codex?.tokens, { input: 80, cacheRead: 70, cacheWrite: 3, output: 12, reasoning: 7 })
    assert.equal(snapshot.providers.codex?.sessionCount, 1)
    assert.equal(snapshot.providers.codex?.tokensByWorkspace['workspace-1'], 172)
    assert.equal(snapshot.recentSessions.length, 3)
    assert.ok(snapshot.recentSessions.some((session) => session.provider === 'codex' && session.contextWindow === 258400))
    assert.equal(await service.getSnapshot(), snapshot)

    now += 61_000
    const existing = await readFile(claudeFile, 'utf8')
    await writeFile(claudeFile, `${existing}\n${JSON.stringify({ type: 'assistant', timestamp: today, sessionId: 'claude-session', cwd: '/work/app', message: { id: 'message-2', model: 'claude-sonnet', usage: { input_tokens: 2, output_tokens: 1 } } })}`)
    await utimes(claudeFile, now / 1000, now / 1000)
    const refreshed = await service.getSnapshot()
    assert.notEqual(refreshed, snapshot)
    assert.equal(refreshed.providers.claude?.tokens.input, 22)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
