import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AgentProvidersConfig } from '@shared/types'
import { AgentPanel } from './AgentPanel'
import { initializeI18n } from '../i18n'

await initializeI18n()

const source = readFileSync(new URL('./AgentPanel.tsx', import.meta.url), 'utf8')
const workspacePanelSource = readFileSync(new URL('./WorkspacePanel.tsx', import.meta.url), 'utf8')

const configuredAgentProviders: AgentProvidersConfig = {
  claude: { enabled: true, args: [] },
  codex: { enabled: false, args: [] },
}

function renderConfiguredAgentPanel(): string {
  return renderToStaticMarkup(
    <AgentPanel
      workspaceId="workspace-1"
      selectedProvider="claude"
      agentProviders={configuredAgentProviders}
      tiles={[]}
      terminalTitles={{}}
      onFocusTile={() => undefined}
      onOpenAgentsSession={() => undefined}
      onOpenWorkspaceSettings={() => undefined}
    />,
  )
}

test('renders configured agent history without a standalone Agents heading', () => {
  const markup = renderConfiguredAgentPanel()

  assert.doesNotMatch(markup, /class="nd-label flex-1 text-text-display">Agents<\/div>/)
  assert.match(markup, /<h3 class="nd-label text-text-display">History<\/h3>/)
})

const standaloneAgentsHeader = `      <div className="shrink-0 border-b border-border px-4 py-4">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-text-secondary" />
          <div className="nd-label flex-1 text-text-display">{copy.title}</div>
        </div>
      </div>
`

if (source.includes(standaloneAgentsHeader)) throw new Error('configured Agents panel must not render a standalone Agents header')
if (!source.includes('<h3 className="nd-label text-text-display">{copy.history}</h3>')) throw new Error('configured Agents panel must keep its History content')

for (const requiredBridgeCall of [
  'window.electron.agents.availability()',
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
if (!source.includes('agentProviders')) throw new Error('resume must use workspace provider configuration')
if (!source.includes('availability')) throw new Error('resume must use provider availability')
if (!source.includes('provider: selectedProvider')) throw new Error('history queries must include the selected provider')
if (!source.includes('onOpenWorkspaceSettings')) throw new Error('unconfigured state must offer workspace configuration')
if (source.includes('New agent session')) throw new Error('Agents panel must not render new session launch UI')
if (source.includes('All local')) throw new Error('Agents panel must not offer all-local history')
if (source.includes('historyScope')) throw new Error('Agents panel must not track a history scope')
if (source.includes('launchAgent')) throw new Error('Agents panel must not launch new sessions')
if (!source.includes('buildAgentHistoryQuery')) throw new Error('history refresh must build a scoped bridge query')
if (!source.includes('shouldRequestAgentData')) throw new Error('agent data requests must be gated by provider selection')
if (!source.includes('filterAgentSessions')) throw new Error('session snapshots must use a testable provider filter')
if (!source.includes('sanitizeAgentCwd')) throw new Error('history cwd must be sanitized before display and resume')
if (!source.includes('useAgentSessionSnapshot(shouldRequestAgentData(selectedProvider))')) throw new Error('running sessions must share the live subscription and retain provider gating')
if (!source.includes("session.surface === 'agents-view'")) throw new Error('Agents View sessions must open and focus Agents View from the running list')
if (!source.includes('onFocusTile(session.tileId)')) throw new Error('running legacy tile sessions must keep focusing their terminal tile')
if (!source.includes('canResume(item.provider)')) throw new Error('resume must gate the selected provider before creating a session')
if (!source.includes('window.electron.agents.createSession({')) throw new Error('history resume must create an Agents View session')
if (!source.includes('resumeSessionId: item.identifier')) throw new Error('history resume must pass its provider session identifier')
if (!source.includes('resumeCwd: sanitizeAgentCwd(item.cwd) ?? undefined')) throw new Error('history resume must pass a sanitized workspace-relative cwd')
if (!source.includes('onOpenAgentsSession(result.tileId)')) throw new Error('resumed sessions must open and focus Agents View')
if (source.includes('addTerminal(availableProfile.id')) throw new Error('history resume must not create a terminal tile')
if (!source.includes('resumeDisabled={!canResume(item.provider)}')) throw new Error('unavailable providers must disable resume actions')
if (!source.includes('}, [historySearch, workspaceId, selectedProvider])')) throw new Error('search changes must invalidate in-flight history requests')
if (!workspacePanelSource.includes('key={`${workspaceId}:${effectiveAgentProvider ?? \'none\'}`}')) throw new Error('Agents panel must remount when its workspace provider scope changes')
