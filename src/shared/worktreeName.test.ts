import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAX_WORKTREE_NAME_LENGTH,
  isValidWorktreeName,
  normalizeWorktreeName,
  worktreeFolderName,
} from './worktreeName'

test('accepts branch names with letters, numbers, separators and accents', () => {
  for (const name of [
    'bug-389',
    'feat/bug-389',
    '1985',
    'release/6.32.0-migraweb',
    'migración',
    'yira/agent-abc12345',
    'yira/agent-abc12345-1',
  ]) {
    assert.equal(isValidWorktreeName(name), true, name)
  }
})

test('rejects unsafe or malformed branch names', () => {
  for (const name of [
    '',
    '-x',
    '.x',
    'a..b',
    'a//b',
    'a/',
    'a/.b',
    'a/-b',
    'a.lock',
    'a.lock/b',
    'a.',
    'a./b',
    'HEAD',
    'con',
    'nul.txt',
    'a b',
    'a:b',
    'a\\b',
    'a'.repeat(MAX_WORKTREE_NAME_LENGTH + 1),
  ]) {
    assert.equal(isValidWorktreeName(name), false, name)
  }
})

test('rejects values that are not strings', () => {
  for (const value of [undefined, null, 42, ['bug-389'], { name: 'bug-389' }]) {
    assert.equal(isValidWorktreeName(value), false)
  }
})

test('normalizes whitespace into hyphens and maps a name to a flat folder', () => {
  assert.equal(normalizeWorktreeName('  bug 389  '), 'bug-389')
  assert.equal(worktreeFolderName('feat/bug-389'), 'feat-bug-389')
})
