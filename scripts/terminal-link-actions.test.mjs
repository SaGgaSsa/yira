import { readFile } from 'node:fs/promises'

const providerSource = await readFile(new URL('../src/renderer/src/components/TerminalRuntimeProvider.tsx', import.meta.url), 'utf8')
for (const required of [
  '@xterm/addon-web-links',
  'new WebLinksAddon',
  'terminalMarkdownLinks',
  'createTerminalMarkdownLinkProvider',
  'window.electron.shell.openExternal',
]) {
  if (!providerSource.includes(required)) throw new Error(`TerminalRuntimeProvider is missing ${required}`)
}

const tileSource = await readFile(new URL('../src/renderer/src/components/TerminalTile.tsx', import.meta.url), 'utf8')
for (const required of [
  'onOpenBrowserTile',
  'onOpenFileTile',
  'buildTerminalContextMenuItems',
]) {
  if (!tileSource.includes(required)) throw new Error(`TerminalTile is missing ${required}`)
}
