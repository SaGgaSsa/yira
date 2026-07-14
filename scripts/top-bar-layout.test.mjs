import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../src/renderer/src/components/TopBar.tsx', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/renderer/src/index.css', import.meta.url), 'utf8')

test('anchors the view selector to the geometric center of the top bar', () => {
  assert.match(source, /<header className="nd-panel app-chrome-row relative flex shrink-0 items-center justify-between/)
  assert.match(source, /<div className="absolute left-1\/2 top-1\/2 flex h-full -translate-x-1\/2 -translate-y-1\/2 items-center gap-2/)
})

test('keeps the workspace selector and top bar on the shared chrome row', () => {
  assert.match(styles, /--app-chrome-control-height: 3rem;/)
  assert.match(styles, /\.app-chrome-row\s*\{[\s\S]*height: var\(--app-chrome-control-height\);/)
  assert.match(source, /<header className="nd-panel app-chrome-row relative flex shrink-0 items-center justify-between/)
  assert.match(source, /top-1\/2 flex h-full -translate-x-1\/2 -translate-y-1\/2 items-center gap-2/)
  assert.match(appSource, /className="app-chrome-row relative border-b border-border px-4"/)
  assert.match(appSource, /className="flex h-full w-full items-center justify-between rounded-2xl border/)
})
