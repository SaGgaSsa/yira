import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import type { WorkspaceMetadata } from '@shared/types'
import { i18n, initializeI18n } from '@/i18n'
import { buildWorkspaceActivityCards } from '@/utils/workspaceActivity'
import { WorkspaceActivityView } from './WorkspaceActivityView'

await initializeI18n('en')

const allAgents = { claude: { enabled: true }, codex: { enabled: true } }
const claudeOnly = { claude: { enabled: true }, codex: { enabled: false } }

function workspace(id: string, name = id, agentProvider?: 'claude' | 'codex'): WorkspaceMetadata {
  return {
    id,
    name,
    path: `/workspaces/${id}`,
    config: {
      type: 'canvas', sourceControlRepositoryPaths: [], workspacePanelOpen: false,
      sourceControlViewMode: 'list', agentProviders: { claude: { enabled: false, args: [] }, codex: { enabled: false, args: [] } }, agentProvider,
    },
  }
}

function renderView(markup: React.ReactElement): string {
  return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{markup}</I18nextProvider>)
}

test('renders compact visited workspaces and the usage dashboard', () => {
  const cards = buildWorkspaceActivityCards({
    workspaces: [workspace('visited'), workspace('saved')], sessionActiveIds: new Set(['visited']),
    attentionCounts: {}, terminalCounts: { visited: 2 }, activeWorkspaceId: 'visited', recentOutputCounts: { visited: 1 },
  })
  const markup = renderView(
    <WorkspaceActivityView
      agents={allAgents}
      cards={cards}
      onOpenWorkspace={() => undefined}
      onGoToTerminal={() => undefined}
    />,
  )
  assert.match(markup, /data-activity-card="visited"/)
  assert.doesNotMatch(markup, /data-activity-card="saved"/)
  assert.match(markup, /Total tokens/)
  assert.match(markup, /Plan limits/)
  assert.match(markup, /By workspace/)
  assert.match(markup, /By model/)
  assert.match(markup, /Tokens per hour/)
  assert.match(markup, /No data in this period/)
})

test('shows a single-line empty state for an empty visited-workspace strip', () => {
  const markup = renderView(
    <WorkspaceActivityView
      agents={allAgents}
      cards={[]}
      onOpenWorkspace={() => undefined}
      onGoToTerminal={() => undefined}
    />,
  )
  assert.match(markup, /data-activity-empty="true"/)
  assert.match(markup, /Only workspaces visited in this session appear/)
})

test('uses the open-workspace arrow and hides a disabled workspace agent', () => {
  const configured = workspace('codex-workspace', 'Codex workspace', 'codex')
  const cards = buildWorkspaceActivityCards({
    workspaces: [configured],
    sessionActiveIds: new Set(['codex-workspace']),
    attentionCounts: {},
    terminalCounts: {},
    activeWorkspaceId: null,
  })
  const markup = renderView(
    <WorkspaceActivityView
      agents={claudeOnly}
      cards={cards}
      onOpenWorkspace={() => undefined}
      onGoToTerminal={() => undefined}
    />,
  )
  assert.match(markup, /data-open-workspace-icon="arrow-up-right"/)
  assert.match(markup, /data-icon="ArrowUpRight"/)
  assert.doesNotMatch(markup, /data-agent-provider-chip="codex"/)
  assert.doesNotMatch(markup, /data-agent-filter-provider="codex"/)
})
