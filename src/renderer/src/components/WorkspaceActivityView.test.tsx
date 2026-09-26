import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import type { AgentActiveSession, WorkspaceMetadata } from '@shared/types'
import { i18n, initializeI18n } from '@/i18n'
import { resources } from '@/i18n/resources'
import { buildWorkspaceActivityCards } from '@/utils/workspaceActivity'
import { WorkspaceActivityView } from './WorkspaceActivityView'

await initializeI18n('en')

function workspace(id: string, name = id): WorkspaceMetadata {
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
    },
  }
}

function agentSession(workspaceId: string, tileId: string, status: AgentActiveSession['status']): AgentActiveSession {
  return { sessionId: `${workspaceId}/${tileId}/${status}`, tileId, workspaceId, status, provider: 'codex', startedAt: '', lastActivityAt: '' }
}

function renderView(markup: React.ReactElement): string {
  return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{markup}</I18nextProvider>)
}

test('renders one card per workspace visited this session and excludes the rest', () => {
  const cards = buildWorkspaceActivityCards({
    workspaces: [workspace('visited'), workspace('saved', 'Saved')],
    sessionActiveIds: new Set(['visited']),
    sessions: [agentSession('visited', 't1', 'working')],
    attentionCounts: {},
    terminalCounts: { visited: 2 },
    activeWorkspaceId: 'visited',
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
  assert.match(markup, /1 active agent/)
  assert.match(markup, /Working/)
  assert.match(markup, /data-activity-sessions="1"/)
  assert.match(markup, /Sessions/)
  assert.match(markup, /Codex/)
  assert.match(markup, /Open workspace/)
  assert.match(markup, /Go to terminal/)
  assert.match(markup, /aria-current="true"/)
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
    sessions: [agentSession('busy', 't1', 'working'), agentSession('blocked', 't9', 'needs-input')],
    attentionCounts: {},
    terminalCounts: {},
    activeWorkspaceId: null,
  })

  assert.deepEqual(cards.map((card) => card.workspace.id), ['idle', 'busy', 'blocked'])
  assert.deepEqual(
    cards.map((card) => card.activity.status),
    ['idle', 'working', 'needs-input'],
  )
})

test('omits the terminal button when no real attention target exists', () => {
  const cards = buildWorkspaceActivityCards({
    workspaces: [workspace('idle')],
    sessionActiveIds: new Set(['idle']),
    sessions: [],
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
  assert.match(markup, /No detected activity/)
})

test('caps session rows at three with an overflow indicator', () => {
  const cards = buildWorkspaceActivityCards({
    workspaces: [workspace('busy')],
    sessionActiveIds: new Set(['busy']),
    sessions: [
      agentSession('busy', 't1', 'needs-input'),
      agentSession('busy', 't2', 'working'),
      agentSession('busy', 't3', 'working'),
      agentSession('busy', 't4', 'done'),
      agentSession('busy', 't5', 'exited'),
    ],
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

  assert.match(markup, /data-activity-sessions="5"/)
  assert.match(markup, /Needs input/)
  assert.match(markup, /Working/)
  assert.doesNotMatch(markup, /Exited/)
  assert.match(markup, /\+2 more/)
})

test('keeps the Spanish empty copy with accents', () => {
  assert.equal(resources.es.translation.activity.emptyTitle, 'Sin espacios de trabajo activos')
  assert.equal(resources.es.translation.activity.openWorkspace, 'Abrir espacio de trabajo')
  assert.equal(resources.en.translation.activity.emptyTitle, 'No active workspaces')
})
