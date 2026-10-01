import assert from 'node:assert/strict'
import test from 'node:test'

import { parseProcStat, parsePsOutput, parseWindowsProcessList } from './processTree'

test('parses Windows process rows and preserves command lines', () => {
  assert.deepEqual(parseWindowsProcessList(
    '30260\t1000\tClaude.exe\t"C:\\Program Files\\Claude.exe" --flag\r\n__YIRA_END__\r\ninvalid',
  ), [{
    pid: 30260,
    ppid: 1000,
    name: 'claude.exe',
    args: '"C:\\Program Files\\Claude.exe" --flag',
  }])
  assert.deepEqual(parseWindowsProcessList('99\t1\tnode.exe\t'), [{
    pid: 99,
    ppid: 1,
    name: 'node.exe',
    args: '',
  }])
})

test('parses proc stat names containing spaces and parentheses', () => {
  assert.deepEqual(parseProcStat('42 (worker (busy) name) S 8 1 0 0'), {
    pid: 42,
    ppid: 8,
    name: 'worker (busy) name',
  })
  assert.equal(parseProcStat('broken'), null)
})

test('parses ps rows with command arguments', () => {
  assert.deepEqual(parsePsOutput('  12   4 /usr/local/bin/codex exec "task"'), [{
    pid: 12,
    ppid: 4,
    name: 'codex',
    args: '/usr/local/bin/codex exec "task"',
  }])
})
