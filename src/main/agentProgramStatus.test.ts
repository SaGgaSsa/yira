import assert from 'node:assert/strict'
import test from 'node:test'

import { parseProgramStatus } from './agentProgramStatus'

function encodeMessage(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

test('parses the program status query', () => {
  assert.deepEqual(parseProgramStatus('?'), { type: 'query' })
  assert.deepEqual(parseProgramStatus('?:states=idle,working'), { type: 'query' })
})

test('parses the Claude idle and working reports', () => {
  assert.deepEqual(parseProgramStatus('state=idle:app=claude-code'), {
    type: 'status',
    state: 'idle',
    provider: 'claude',
  })
  assert.deepEqual(parseProgramStatus('state=working:app=claude-code'), {
    type: 'status',
    state: 'working',
    provider: 'claude',
  })
})

test('decodes a base64 working message', () => {
  const payload = `state=working:app=claude-code:msg=${encodeMessage('Writing prueba.txt')}`
  assert.deepEqual(parseProgramStatus(payload), {
    type: 'status',
    state: 'working',
    provider: 'claude',
    detail: 'Writing prueba.txt',
  })
})

test('parses a blocked permission report with its message', () => {
  const payload = `state=blocked:app=claude-code:kind=permission:msg=${encodeMessage('approve Bash: ping -n 1 127.0.0.1')}`
  assert.deepEqual(parseProgramStatus(payload), {
    type: 'status',
    state: 'blocked',
    provider: 'claude',
    kind: 'permission',
    detail: 'approve Bash: ping -n 1 127.0.0.1',
  })
})

test('parses the Codex reports', () => {
  assert.deepEqual(parseProgramStatus('state=blocked:app=codex:kind=permission'), {
    type: 'status',
    state: 'blocked',
    provider: 'codex',
    kind: 'permission',
  })
  assert.deepEqual(parseProgramStatus('state=done:app=codex'), {
    type: 'status',
    state: 'done',
    provider: 'codex',
  })
  assert.deepEqual(parseProgramStatus('state=error:app=codex'), {
    type: 'status',
    state: 'error',
    provider: 'codex',
  })
})

test('parses clear without an app', () => {
  assert.deepEqual(parseProgramStatus('state=clear'), {
    type: 'status',
    state: 'clear',
    provider: null,
  })
})

test('returns no provider for an unknown app and no kind for an unknown kind', () => {
  assert.deepEqual(parseProgramStatus('state=working:app=cursor'), {
    type: 'status',
    state: 'working',
    provider: null,
  })
  assert.deepEqual(parseProgramStatus('state=blocked:app=claude-code:kind=other'), {
    type: 'status',
    state: 'blocked',
    provider: 'claude',
  })
})

test('rejects missing or unknown states', () => {
  assert.equal(parseProgramStatus('app=claude-code'), null)
  assert.equal(parseProgramStatus('state=paused:app=claude-code'), null)
})

test('replaces control characters in messages and omits empty details', () => {
  assert.deepEqual(parseProgramStatus(`state=working:app=claude-code:msg=${encodeMessage('line one\nline two\ttabbed')}`), {
    type: 'status',
    state: 'working',
    provider: 'claude',
    detail: 'line one line two tabbed',
  })
  assert.deepEqual(parseProgramStatus(`state=working:app=claude-code:msg=${encodeMessage(' \n\t ')}`), {
    type: 'status',
    state: 'working',
    provider: 'claude',
  })
})

test('limits long messages to 300 characters', () => {
  const report = parseProgramStatus(`state=working:app=claude-code:msg=${encodeMessage('y'.repeat(400))}`)
  assert.equal(report?.type, 'status')
  assert.equal(report?.type === 'status' ? report.detail?.length : undefined, 300)
})
