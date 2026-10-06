import {
  getAgentSessionTitles,
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

const agentTile: TileState = { ...terminalTile, label: undefined, agent: { provider: 'claude' } }

if (getTerminalDisplayTitle(agentTile, { [agentTile.id]: 'shell title' }, { [agentTile.id]: '✳ Fix login' }) !== '✳ Fix login') {
  throw new Error('agent session name must win over the dynamic terminal title')
}

if (getTerminalDisplayTitle(agentTile, {}) !== 'Claude') {
  throw new Error('an agent tile without a title must fall back to the agent name')
}

const agentTitles = getAgentSessionTitles([
  { sessionId: 's1', tileId: 'tile-1', workspaceId: 'w1', provider: 'claude', status: 'working', startedAt: '', lastActivityAt: '', title: 'Prompt', liveTitle: 'Live' },
  { sessionId: 's2', tileId: 'tile-2', workspaceId: 'w1', provider: 'codex', status: 'working', startedAt: '', lastActivityAt: '', liveTitle: '⠂ Live' },
  { sessionId: 's3', tileId: 'tile-3', workspaceId: 'w1', provider: 'claude', status: 'working', startedAt: '', lastActivityAt: '' },
  { sessionId: 's4', tileId: 'tile-4', workspaceId: 'w2', provider: 'claude', status: 'working', startedAt: '', lastActivityAt: '', liveTitle: 'Other' },
], 'w1')
if (JSON.stringify(agentTitles) !== JSON.stringify({ 'tile-1': 'Prompt', 'tile-2': '⠂ Live' })) {
  throw new Error('agent session titles must prefer the prompt title and keep only named sessions of the workspace')
}

const normalizedWindowTitle = normalizeTerminalWindowTitle(`  ${'dev '.repeat(40)}  `)
if (normalizedWindowTitle.length > 120) {
  throw new Error('normalized terminal window title must be capped at 120 characters')
}

if (normalizedWindowTitle !== `${'dev '.repeat(30)}`.trim()) {
  throw new Error('normalized terminal window title must trim and collapse whitespace')
}
