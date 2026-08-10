import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./AgentPanel.tsx', import.meta.url), 'utf8')

for (const requiredBridgeCall of [
  'window.electron.agents.availability()',
  'window.electron.agents.sessionsSnapshot(workspaceId)',
  'window.electron.agents.subscribeSessions(workspaceId)',
  'window.electron.agents.unsubscribeSessions()',
  'window.electron.agents.history(query)',
]) {
  if (!source.includes(requiredBridgeCall)) throw new Error(`Agents panel must use ${requiredBridgeCall}`)
}

for (const requiredCopy of [
  'New agent session',
  'Claude',
  'Codex',
  'Running sessions',
  'History',
  'All local',
  'Resume',
  'Open Settings',
]) {
  if (!source.includes(requiredCopy)) throw new Error(`Agents panel must render ${requiredCopy}`)
}

if (!source.includes('buildAgentHistoryQuery')) throw new Error('history refresh must build a scoped bridge query')
if (!source.includes('sanitizeAgentCwd')) throw new Error('history cwd must be sanitized before display and resume')
if (!source.includes('onSessionsChanged')) throw new Error('running sessions must subscribe to live changes')
if (!source.includes('onFocusTile(session.tileId)')) throw new Error('running cards must focus their terminal tile')
if (!source.includes('addTerminal(availableProfile.id')) throw new Error('new sessions must use the existing terminal creation flow')
