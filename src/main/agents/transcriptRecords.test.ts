import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyClaudeRecord,
  classifyCodexRecord,
  isCodexExecSession,
  isCodexWorkerSession,
} from './transcriptRecords'

test('Claude ignores metadata, sidechains, local output, and tool results', () => {
  assert.deepEqual(classifyClaudeRecord({
    type: 'user',
    isMeta: true,
    content: 'expanded skill contents',
  }).events, [])
  assert.deepEqual(classifyClaudeRecord({
    type: 'user',
    isMeta: true,
    content: '<local-command-caveat>commands are local</local-command-caveat>',
  }).events, [])
  assert.deepEqual(classifyClaudeRecord({
    type: 'user',
    isSidechain: true,
    content: 'sidechain prompt',
  }).events, [])
  assert.deepEqual(classifyClaudeRecord({
    type: 'system',
    subtype: 'local_command',
    content: 'internal system row',
  }).events, [])
  assert.deepEqual(classifyClaudeRecord({
    type: 'user',
    content: [{ type: 'tool_result', content: 'tool output' }],
  }).events, [])
})

test('Claude filters local command notices and task notifications', () => {
  for (const content of [
    '<local-command-caveat>commands are local</local-command-caveat>',
    '<local-command-stdout>cleared</local-command-stdout>',
    '<local-command-stderr>failed</local-command-stderr>',
    '<task-notification>task finished</task-notification>',
    '<system-reminder>reminder only</system-reminder>',
  ]) {
    assert.deepEqual(classifyClaudeRecord({ type: 'user', content }).events, [])
  }
})

test('Claude classifies local commands with optional arguments', () => {
  assert.deepEqual(classifyClaudeRecord({
    type: 'user',
    timestamp: '2026-08-10T12:00:00.000Z',
    message: {
      content: '<command-name>/trivia</command-name>\n<command-message>trivia</command-message>\n<command-args>history</command-args>',
    },
  }).events, [{ kind: 'command', name: '/trivia', args: 'history', timestamp: '2026-08-10T12:00:00.000Z' }])
  assert.deepEqual(classifyClaudeRecord({
    type: 'user',
    content: '<command-name>/clear</command-name>\n<command-message>clear</command-message>',
  }).events, [{ kind: 'command', name: '/clear' }])
})

test('Claude removes embedded system reminders and retains prompt line breaks', () => {
  assert.deepEqual(classifyClaudeRecord({
    type: 'user',
    message: { content: [{ type: 'text', text: 'Please review this.\n<system-reminder>private hint</system-reminder>\nFocus on safety.' }] },
  }).events, [{ kind: 'prompt', text: 'Please review this.\n\nFocus on safety.' }])
})

test('Claude assistant exposes text blocks only and retains its message id', () => {
  assert.deepEqual(classifyClaudeRecord({
    type: 'assistant',
    timestamp: '2026-08-10T12:01:00.000Z',
    message: {
      id: 'message-1',
      content: [
        { type: 'thinking', thinking: 'private reasoning' },
        { type: 'text', text: 'Visible reply' },
        { type: 'tool_use', name: 'read_file', input: {} },
      ],
    },
  }).events, [{
    kind: 'reply',
    text: 'Visible reply',
    messageId: 'message-1',
    timestamp: '2026-08-10T12:01:00.000Z',
  }])
})

test('Claude classifies custom, AI, and summary titles', () => {
  assert.deepEqual(classifyClaudeRecord({ type: 'custom-title', customTitle: 'Reviewed changes' }).events, [
    { kind: 'title', source: 'custom', text: 'Reviewed changes' },
  ])
  assert.deepEqual(classifyClaudeRecord({ type: 'ai-title', aiTitle: 'Review changes' }).events, [
    { kind: 'title', source: 'ai', text: 'Review changes' },
  ])
  assert.deepEqual(classifyClaudeRecord({ type: 'summary', summary: 'Short summary', title: 'Fallback' }).events, [
    { kind: 'title', source: 'summary', text: 'Short summary' },
  ])
})

test('Claude carries safe session context and rejects control characters', () => {
  assert.deepEqual(classifyClaudeRecord({
    type: 'system',
    session_id: 'session-1',
    cwd: 'C:\\repo',
    message: { model: 'sonnet' },
  }).context, { sessionId: 'session-1', cwd: 'C:\\repo', model: 'sonnet' })
  assert.deepEqual(classifyClaudeRecord({ type: 'user', sessionId: 'bad\u0000id', content: 'safe' }).context, {})
})

test('Codex classifies current and legacy user prompts', () => {
  assert.deepEqual(classifyCodexRecord({
    type: 'event_msg',
    timestamp: '2026-08-10T13:00:00.000Z',
    payload: {
      type: 'item_completed',
      item: { type: 'UserMessage', content: [{ type: 'text', text: 'Current prompt\ncontinued' }] },
    },
  }).events, [{ kind: 'prompt', text: 'Current prompt\ncontinued', timestamp: '2026-08-10T13:00:00.000Z' }])
  assert.deepEqual(classifyCodexRecord({
    type: 'event_msg',
    payload: { type: 'user_message', message: 'Legacy prompt' },
  }).events, [{ kind: 'prompt', text: 'Legacy prompt' }])
  assert.deepEqual(classifyCodexRecord({
    type: 'event_msg',
    payload: { type: 'item_completed', item: { type: 'AgentMessage', content: [{ type: 'text', text: 'duplicate reply' }] } },
  }).events, [])
})

test('Codex ignores injected messages and exposes assistant response items', () => {
  for (const role of ['user', 'developer', 'system']) {
    assert.deepEqual(classifyCodexRecord({
      type: 'response_item',
      payload: { type: 'message', role, content: [{ type: 'input_text', text: 'injected instructions' }] },
    }).events, [])
  }
  assert.deepEqual(classifyCodexRecord({
    type: 'response_item',
    timestamp: '2026-08-10T13:00:02.000Z',
    payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Visible answer' }] },
  }).events, [{ kind: 'reply', text: 'Visible answer', timestamp: '2026-08-10T13:00:02.000Z' }])
  assert.deepEqual(classifyCodexRecord({
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'Legacy answer' }],
  }).events, [{ kind: 'reply', text: 'Legacy answer' }])
  assert.deepEqual(classifyCodexRecord({ type: 'message', role: 'user', content: 'legacy user row' }).events, [])
})

test('Codex session metadata supplies identity and turn context supplies cwd and model', () => {
  assert.deepEqual(classifyCodexRecord({
    type: 'session_meta',
    payload: { id: 'codex-1', cwd: 'C:\\repo', model: 'gpt-6', originator: 'codex-tui', source: 'cli' },
  }), {
    context: { sessionId: 'codex-1', cwd: 'C:\\repo', model: 'gpt-6' },
    events: [],
    sessionMeta: { id: 'codex-1', cwd: 'C:\\repo', model: 'gpt-6', originator: 'codex-tui', source: 'cli' },
  })
  assert.deepEqual(classifyCodexRecord({
    type: 'turn_context',
    payload: { cwd: 'C:\\repo\\nested', model: 'gpt-6-mini' },
  }).context, { cwd: 'C:\\repo\\nested', model: 'gpt-6-mini' })
})

test('Codex exec and worker session classification follows observed metadata', () => {
  for (const meta of [
    { originator: 'codex_exec', source: 'exec', thread_source: 'user' },
    { originator: 'CODEX_EXEC', source: 'cli', thread_source: 'user' },
    { originator: 'Codex Desktop', source: 'exec', thread_source: 'user' },
  ]) {
    assert.equal(isCodexExecSession(meta), true)
  }
  for (const meta of [
    { originator: 'codex-tui', source: 'cli', thread_source: 'user' },
    { originator: 'codex-tui', source: 'vscode', thread_source: 'user' },
    { originator: 'Codex Desktop', source: 'vscode', thread_source: 'user' },
  ]) {
    assert.equal(isCodexExecSession(meta), false)
  }
  assert.equal(isCodexWorkerSession({ thread_source: 'USER' }), false)
  assert.equal(isCodexWorkerSession({ thread_source: 'guardian_review' }), true)
  assert.equal(isCodexWorkerSession({ source: { subagent: {} } }), true)
})

test('Claude ignores synthetic interruption notices', () => {
  for (const content of ['[Request interrupted by user]', '[Request interrupted by user for tool use]']) {
    assert.deepEqual(classifyClaudeRecord({ type: 'user', content }).events, [])
  }
  assert.equal(classifyClaudeRecord({ type: 'user', content: '[Image #1] why does this fail?' }).events[0]?.kind, 'prompt')
})

test('Codex ignores answers to agent questions', () => {
  assert.deepEqual(classifyCodexRecord({
    type: 'event_msg',
    payload: {
      type: 'item_completed',
      item: { type: 'UserMessage', content: [{ type: 'text', text: '<send_user_message_question_reply> [{"answer":"yes"}]' }] },
    },
  }).events, [])
})
