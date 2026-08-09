import assert from 'node:assert/strict'
import test from 'node:test'
import { compileFileSearchQuery } from './fileSearch'

test('matches a literal query as a case-insensitive substring', () => {
  const result = compileFileSearchQuery('Report[1].TXT')

  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.equal(result.mode, 'literal')
  assert.equal(result.matches('annual report[1].txt.backup'), true)
  assert.equal(result.matches('annual report1.txt.backup'), false)
})

test('matches queries containing .* as a case-insensitive regular expression', () => {
  const result = compileFileSearchQuery('^src/.*\\.test\\.ts$')

  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.equal(result.mode, 'regex')
  assert.equal(result.matches('src/FILE.TEST.TS'), true)
  assert.equal(result.matches('archive/src/file.test.ts.bak'), false)
})

test('returns an error for an invalid regular-expression query', () => {
  const result = compileFileSearchQuery('file.*(')

  assert.equal(result.ok, false)
  if (result.ok) return

  assert.equal(result.mode, 'regex')
  assert.equal(result.query, 'file.*(')
  assert.match(result.error, /regular expression/i)
})
