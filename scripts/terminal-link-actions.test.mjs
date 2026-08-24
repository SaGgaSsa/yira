import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/renderer/src/components/TerminalTile.tsx', import.meta.url), 'utf8')
for (const required of [
  '@xterm/addon-web-links',
  'new WebLinksAddon',
  'terminalMarkdownLinks',
  'createTerminalMarkdownLinkProvider',
  'window.electron.shell.openExternal',
  'onOpenBrowserTile',
  'onOpenFileTile',
  'buildTerminalContextMenuItems',
]) {
  if (!source.includes(required)) throw new Error(`TerminalTile is missing ${required}`)
}
