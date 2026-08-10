import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./AgentPanel.tsx', import.meta.url), 'utf8')

for (const requiredBridgeCall of [
  'window.electron.agents.sessionsSnapshot(workspaceId)',
  'window.electron.agents.subscribeSessions(workspaceId)',
  'window.electron.agents.unsubscribeSessions()',
  'window.electron.agents.history(query)',
]) {
  if (!source.includes(requiredBridgeCall)) throw new Error(`Agents panel must use ${requiredBridgeCall}`)
}

for (const requiredCopy of [
  'Claude',
  'Codex',
  'Running sessions',
  'History',
  'Resume',
]) {
  if (!source.includes(requiredCopy)) throw new Error(`Agents panel must render ${requiredCopy}`)
}

if (!source.includes('selectedProvider')) throw new Error('Agents panel must use the selected workspace provider')
if (!source.includes('provider: selectedProvider')) throw new Error('history queries must include the selected provider')
if (!source.includes('onOpenWorkspaceSettings')) throw new Error('unconfigured state must offer workspace configuration')
if (source.includes('New agent session')) throw new Error('Agents panel must not render new session launch UI')
if (source.includes('All local')) throw new Error('Agents panel must not offer all-local history')
if (source.includes('historyScope')) throw new Error('Agents panel must not track a history scope')
if (source.includes('launchAgent')) throw new Error('Agents panel must not launch new sessions')
if (source.includes('agents.availability()')) throw new Error('Agents panel must not query provider availability')
if (!source.includes('buildAgentHistoryQuery')) throw new Error('history refresh must build a scoped bridge query')
if (!source.includes('sanitizeAgentCwd')) throw new Error('history cwd must be sanitized before display and resume')
if (!source.includes('onSessionsChanged')) throw new Error('running sessions must subscribe to live changes')
if (!source.includes('onFocusTile(session.tileId)')) throw new Error('running cards must focus their terminal tile')
if (!source.includes('canResume(item.provider)')) throw new Error('resume must gate the selected provider before creating a tile')
if (!source.includes('resumeDisabled={!canResume(item.provider)}')) throw new Error('unavailable providers must disable resume actions')
if (!source.includes('}, [historySearch, workspaceId, selectedProvider])')) throw new Error('search changes must invalidate in-flight history requests')
if (!source.includes('sessionSubscriptionRef')) throw new Error('session cleanup must be tied to a subscription generation')
if (!source.includes('sessionSubscriptionRef.current !== subscription')) throw new Error('stale subscription cleanup must not unsubscribe a newer subscription')
