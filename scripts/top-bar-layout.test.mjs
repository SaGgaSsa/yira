import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../src/renderer/src/components/TopBar.tsx', import.meta.url), 'utf8')

test('anchors the view selector to the geometric center of the top bar', () => {
  assert.match(source, /<header className="nd-panel relative flex shrink-0 items-center justify-between/)
  assert.match(source, /<div className="absolute left-1\/2 top-1\/2 flex h-12 -translate-x-1\/2 -translate-y-1\/2 items-center gap-2/)
})
