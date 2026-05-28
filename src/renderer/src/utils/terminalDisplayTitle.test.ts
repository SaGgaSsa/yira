import {
  getTerminalDisplayTitle,
  normalizeTerminalWindowTitle,
} from './terminalDisplayTitle'
import type { TileState } from '@shared/types'

const terminalTile: TileState = {
  id: 'terminal-abcd',
  type: 'terminal',
  x: 0,
  y: 0,
  width: 640,
  height: 420,
  zIndex: 1,
  label: 'API',
}

if (getTerminalDisplayTitle(terminalTile, { [terminalTile.id]: 'yira' }) !== 'API') {
  throw new Error('manual terminal label must win over the dynamic terminal title')
}

if (getTerminalDisplayTitle({ ...terminalTile, label: '   ' }, { [terminalTile.id]: ' yira ' }) !== 'yira') {
  throw new Error('whitespace-only terminal label must fall back to the trimmed dynamic terminal title')
}

if (getTerminalDisplayTitle({ ...terminalTile, label: undefined }, {}) !== 'Terminal abcd') {
  throw new Error('missing terminal label and dynamic title must fall back to Terminal ####')
}

const normalizedWindowTitle = normalizeTerminalWindowTitle(`  ${'dev '.repeat(40)}  `)
if (normalizedWindowTitle.length > 120) {
  throw new Error('normalized terminal window title must be capped at 120 characters')
}

if (normalizedWindowTitle !== `${'dev '.repeat(30)}`.trim()) {
  throw new Error('normalized terminal window title must trim and collapse whitespace')
}
