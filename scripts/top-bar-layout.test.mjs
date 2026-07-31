import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const topBar = await readFile(new URL('../src/renderer/src/components/TopBar.tsx', import.meta.url), 'utf8')
const app = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/renderer/src/index.css', import.meta.url), 'utf8')
const main = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
const windowIpc = await readFile(new URL('../src/main/ipc/window.ts', import.meta.url), 'utf8')
const preload = await readFile(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
const electronWorld = await readFile(new URL('../src/renderer/src/electron.d.ts', import.meta.url), 'utf8')
const themeHook = await readFile(new URL('../src/renderer/src/hooks/useTheme.ts', import.meta.url), 'utf8')

test('uses a compact native title bar with safe areas and drag regions', () => {
  assert.match(styles, /--window-titlebar-height: 36px;/)
  assert.match(styles, /\.window-titlebar\s*\{[\s\S]*height: var\(--window-titlebar-height\);/)
  assert.match(styles, /env\(titlebar-area-x, 0px\)/)
  assert.match(styles, /env\(titlebar-area-width, 100vw\)/)
  assert.match(styles, /\.window-titlebar\s*\{[\s\S]*-webkit-app-region: drag;/)
  assert.match(styles, /\.window-titlebar button\s*\{[\s\S]*-webkit-app-region: no-drag;/)
})

test('renders the view selector in the compact title bar without a portal', () => {
  assert.match(topBar, /className="window-titlebar nd-panel grid shrink-0 grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/)
  assert.match(topBar, /<Icon size=\{14\} \/>/)
  assert.match(topBar, /h-7 w-7/)
  assert.doesNotMatch(topBar, /createPortal|ResizeObserver|useLayoutEffect|getBoundingClientRect/)
})

test('places the title bar globally and leaves an empty draggable strip without a workspace', () => {
  assert.match(app, /<TopBar\s+hasWorkspace=\{Boolean\(activeWorkspaceId\)\}/)
  assert.doesNotMatch(app, /\{activeWorkspaceId \? \(\s*<>\s*<TopBar/)
})

test('configures and synchronizes the native title bar overlay through a typed IPC bridge', () => {
  assert.match(main, /process\.platform === 'win32' \|\| process\.platform === 'linux'/)
  assert.match(main, /titleBarStyle: 'hidden'/)
  assert.match(main, /titleBarOverlay[,:]/)
  assert.match(windowIpc, /window:setTitleBarOverlayTheme/)
  assert.match(windowIpc, /theme !== 'dark' && theme !== 'light'/)
  assert.match(windowIpc, /nativeWindow !== getMainWindow\(\)/)
  assert.match(windowIpc, /setTitleBarOverlay/)
  assert.match(preload, /setTitleBarOverlayTheme: \(theme: 'dark' \| 'light'\)/)
  assert.match(electronWorld, /setTitleBarOverlayTheme: \(theme: 'dark' \| 'light'\)/)
  assert.match(themeHook, /setTitleBarOverlayTheme\(dark \? 'dark' : 'light'\)/)
})
