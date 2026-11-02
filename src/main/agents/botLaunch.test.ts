import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBotLaunchArgs } from './botLaunch'

test('claude bot adds the model and the role file', () => {
  assert.deepEqual(
    buildBotLaunchArgs({ provider: 'claude', model: 'sonnet', role: 'Be brief', roleFilePath: 'C:/roles/bot.md' }),
    ['--model', 'sonnet', '--append-system-prompt-file', 'C:/roles/bot.md'],
  )
})

test('claude bot without a role does not need a file path', () => {
  assert.deepEqual(buildBotLaunchArgs({ provider: 'claude', model: 'opus', role: '  ' }), ['--model', 'opus'])
})

test('claude bot with a role and no file path throws', () => {
  assert.throws(() => buildBotLaunchArgs({ provider: 'claude', model: '', role: 'Be brief' }), Error)
})

test('codex bot flattens the role to one line', () => {
  assert.deepEqual(
    buildBotLaunchArgs({ provider: 'codex', model: 'gpt-5', role: 'línea 1\r\nlínea "2" 50%' }),
    ['-m', 'gpt-5', '-c', "developer_instructions=línea 1 línea '2' 50％"],
  )
})

test('codex bot without model or role adds no flags', () => {
  assert.deepEqual(buildBotLaunchArgs({ provider: 'codex', model: '', role: '' }), [])
})
