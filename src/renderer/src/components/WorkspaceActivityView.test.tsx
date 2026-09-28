import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import type { WorkspaceMetadata } from '@shared/types'
import { i18n, initializeI18n } from '@/i18n'
import { resources } from '@/i18n/resources'
import { buildWorkspaceActivityCards } from '@/utils/workspaceActivity'
import { WorkspaceActivityView } from './WorkspaceActivityView'

await initializeI18n('en')

function workspace(id: string, name = id, agentProvider?: 'claude' | 'codex'): WorkspaceMetadata {
  return {
    id,
    name,
    path: `/workspaces/${id}`,
    pinned: false,
    config: {
      type: 'canvas',
      sourceControlRepositoryPaths: [],
      workspacePanelOpen: false,
      sourceControlViewMode: 'list',
      agentProviders: { claude: { enabled: false, args: [] }, codex: { enabled: false, args: [] } },
      agentProvider,
    },
  }
}

function renderView(markup: React.ReactElement): string {
  return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{markup}</I18nextProvider>)
}

test('renders one card per workspace visited this session and excludes the rest', () => {
  const cards = buildWorkspaceActivityCards({
    workspaces: [workspace('visited'), workspace('saved', 'Saved')],
    sessionActiveIds: new Set(['visited']),
    attentionCounts: {},
    terminalCounts: { visited: 2 },
    activeWorkspaceId: 'visited',
    recentOutputCounts: { visited: 1 },
  })

  const markup = renderView(
    <WorkspaceActivityView
      cards={cards}
      onOpenWorkspace={() => undefined}
      onGoToTerminal={() => undefined}
    />,
  )

  assert.match(markup, /data-activity-view="true"/)
  assert.match(markup, /data-activity-card="visited"/)
  assert.doesNotMatch(markup, /data-activity-card="saved"/)
  assert.match(markup, /2 terminals/)
  assert.match(markup, /Terminals active/)
  assert.match(markup, /data-activity-status="active"/)
  assert.match(markup, /animate-spin/)
  assert.match(markup, /Open workspace/)
  assert.match(markup, /aria-current="true"/)
  assert.doesNotMatch(markup, /agent/i)
  assert.doesNotMatch(markup, /Sessions/)
})

test('shows an empty state when no workspace is active this session', () => {
  const markup = renderView(
    <WorkspaceActivityView
      cards={[]}
      onOpenWorkspace={() => undefined}
      onGoToTerminal={() => undefined}
    />,
  )

  assert.match(markup, /data-activity-empty="true"/)
  assert.match(markup, /No active workspaces/)
  assert.match(markup, /Only workspaces visited in this session appear/)
})

test('keeps the sidebar order without inventing data', () => {
  const cards = buildWorkspaceActivityCards({
    workspaces: [workspace('idle'), workspace('busy'), workspace('blocked')],
    sessionActiveIds: new Set(['idle', 'busy', 'blocked']),
    attentionCounts: { blocked: 1 },
    terminalCounts: {},
    activeWorkspaceId: null,
    recentOutputCounts: { busy: 2 },
  })

  assert.deepEqual(cards.map((card) => card.workspace.id), ['idle', 'busy', 'blocked'])
  assert.deepEqual(
    cards.map((card) => card.status),
    ['idle', 'active', 'unread'],
  )
})

test('omits the terminal button when no real attention target exists', () => {
  const cards = buildWorkspaceActivityCards({
    workspaces: [workspace('idle')],
    sessionActiveIds: new Set(['idle']),
    attentionCounts: {},
    terminalCounts: {},
    activeWorkspaceId: null,
  })

  const markup = renderView(
    <WorkspaceActivityView
      cards={cards}
      onOpenWorkspace={() => undefined}
      onGoToTerminal={() => undefined}
    />,
  )

  assert.match(markup, /Open workspace/)
  assert.doesNotMatch(markup, /Go to terminal/)
  assert.doesNotMatch(markup, /Sessions/)
  assert.doesNotMatch(markup, /agent/i)
  assert.match(markup, /No activity/)
})

test('renders recent terminal output with an animated status', () => {
  const cards = buildWorkspaceActivityCards({
    workspaces: [workspace('common', 'Common')],
    sessionActiveIds: new Set(['common']),
    attentionCounts: {},
    terminalCounts: { common: 3 },
    activeWorkspaceId: null,
    recentOutputCounts: { common: 2 },
  })

  const markup = renderView(
    <WorkspaceActivityView
      cards={cards}
      onOpenWorkspace={() => undefined}
      onGoToTerminal={() => undefined}
    />,
  )

  assert.equal(cards[0].status, 'active')
  assert.match(markup, /data-activity-card="common"/)
  assert.match(markup, /data-activity-status="active"/)
  assert.match(markup, /Terminals active/)
  assert.match(markup, /animate-spin/)
  assert.doesNotMatch(markup, /Sessions/)
  assert.doesNotMatch(markup, /agent/i)
  assert.doesNotMatch(markup, /Go to terminal/)
})

test('keeps the Spanish empty copy with accents', () => {
  assert.equal(resources.es.translation.activity.emptyTitle, 'Sin espacios de trabajo activos')
  assert.equal(resources.es.translation.activity.openWorkspace, 'Abrir espacio de trabajo')
  assert.equal(resources.en.translation.activity.emptyTitle, 'No active workspaces')
})

test('shows only the provider configured on an available workspace', () => {
  const configured = workspace('configured', 'Configured', 'codex')
  const cards = buildWorkspaceActivityCards({
    workspaces: [configured], sessionActiveIds: new Set(['configured']), attentionCounts: {}, terminalCounts: {}, activeWorkspaceId: null,
  })
  const markup = renderView(<WorkspaceActivityView cards={cards} workspaces={[configured]} onOpenWorkspace={() => undefined} onGoToTerminal={() => undefined} />)
  assert.match(markup, /data-agent-panel-provider="codex"/)
  assert.doesNotMatch(markup, /data-agent-panel-provider="claude"/)
})
