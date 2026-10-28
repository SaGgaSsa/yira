import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentActiveSession, FileSearchEntry, WorkspaceMetadata } from '@shared/types'
import {
  actionItemKey,
  buildCommandPaletteHome,
  buildCommandPaletteResults,
  fileItemKey,
  matchCommandPaletteText,
  parseCommandPaletteQuery,
  resolveCommandPaletteRecent,
  sessionItemKey,
  workspaceItemKey,
  type CommandPaletteAction,
  type CommandPaletteCatalog,
  type CommandPaletteRecent,
  type CommandPaletteSection,
} from './commandPalette'

function session(overrides: Partial<AgentActiveSession> = {}): AgentActiveSession {
  return {
    sessionId: 'session-a',
    tileId: 'agent-a',
    workspaceId: 'workspace-a',
    provider: 'claude',
    status: 'working',
    startedAt: '2026-01-01T00:00:00.000Z',
    lastActivityAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function workspace(id: string, name = id): WorkspaceMetadata {
  return {
    id,
    name,
    path: `/workspaces/${id}`,
    config: {
      type: 'canvas',
      sourceControlRepositoryPaths: [],
      workspacePanelOpen: false,
      sourceControlViewMode: 'list',
      agentProviders: { claude: { enabled: true, args: [] }, codex: { enabled: true, args: [] } },
    },
  }
}

function action(id: string, label: string, overrides: Partial<CommandPaletteAction> = {}): CommandPaletteAction {
  return { id, label, icon: 'terminal', ...overrides }
}

function sectionKeys(sections: readonly CommandPaletteSection[]): Record<string, string[]> {
  return Object.fromEntries(sections.map((section) => [section.id, section.items.map((item) => item.key)]))
}

function catalog(overrides: Partial<CommandPaletteCatalog> = {}): CommandPaletteCatalog {
  return {
    sessions: [],
    workspaces: [workspace('workspace-a', 'Alpha')],
    actions: [action('open-settings', 'Open settings')],
    activeWorkspaceId: 'workspace-a',
    ...overrides,
  }
}

test('parses the mode prefix and trims the search text', () => {
  assert.deepEqual(parseCommandPaletteQuery(''), { mode: 'all', text: '' })
  assert.deepEqual(parseCommandPaletteQuery('  alpha  '), { mode: 'all', text: 'alpha' })
  assert.deepEqual(parseCommandPaletteQuery('> open'), { mode: 'actions', text: 'open' })
  assert.deepEqual(parseCommandPaletteQuery('@  session  '), { mode: 'sessions', text: 'session' })
  assert.deepEqual(parseCommandPaletteQuery('# workspace'), { mode: 'workspaces', text: 'workspace' })
  assert.deepEqual(parseCommandPaletteQuery('/ src/index.ts'), { mode: 'files', text: 'src/index.ts' })
  assert.deepEqual(parseCommandPaletteQuery('? not a prefix'), { mode: 'all', text: '? not a prefix' })
})

test('scores prefix, word start, substring, keyword, and fuzzy matches', () => {
  assert.deepEqual(matchCommandPaletteText('Alpha', ''), { score: 0, ranges: [] })

  const prefix = matchCommandPaletteText('Alpha', 'al')
  assert.ok(prefix)
  assert.ok(prefix.score > 399 && prefix.score < 400)
  assert.deepEqual(prefix.ranges, [[0, 2]])

  const wordStart = matchCommandPaletteText('Project Alpha', 'al')
  assert.ok(wordStart)
  assert.ok(wordStart.score > 299 && wordStart.score < 300)
  assert.deepEqual(wordStart.ranges, [[8, 10]])

  const substring = matchCommandPaletteText('Malpractice', 'alp')
  assert.ok(substring)
  assert.ok(substring.score > 199 && substring.score < 200)
  assert.deepEqual(substring.ranges, [[1, 4]])

  const keyword = matchCommandPaletteText('Deploy', 'ship', ['ship it'])
  assert.ok(keyword)
  assert.ok(keyword.score > 149 && keyword.score < 150)
  assert.deepEqual(keyword.ranges, [])

  const fuzzy = matchCommandPaletteText('Configuration', 'cfgn')
  assert.ok(fuzzy)
  assert.ok(fuzzy.score > 90 && fuzzy.score < 100)
  assert.deepEqual(fuzzy.ranges, [[0, 1], [3, 4], [5, 6], [12, 13]])

  assert.equal(matchCommandPaletteText('Configuration', 'xyz'), null)
})

test('ignores case and accents while keeping ranges on the original label', () => {
  const match = matchCommandPaletteText('Configuración', 'CONFIGURACION')
  assert.ok(match)
  assert.ok(match.score > 399 && match.score < 400)
  assert.deepEqual(match.ranges, [[0, 13]])

  const accentless = matchCommandPaletteText('Configuración', 'configuracion')
  assert.ok(accentless)
  assert.equal(accentless.ranges[0][1], 13)
})

test('prefers the shorter label inside a score level', () => {
  const short = matchCommandPaletteText('Alpha', 'alp')
  const long = matchCommandPaletteText('Alpha extended workspace', 'alp')
  assert.ok(short && long)
  assert.ok(short.score > long.score)
})

test('home without recents starts with a new session and previews active agents', () => {
  const sections = buildCommandPaletteHome({
    catalog: catalog({
      sessions: [
        session({ sessionId: 'input-late', tileId: 'tile-2', status: 'needs-input', startedAt: '2026-01-01T00:02:00.000Z' }),
        session({ sessionId: 'input-early', tileId: 'tile-1', status: 'needs-input', startedAt: '2026-01-01T00:01:00.000Z' }),
        session({ sessionId: 'working-c', tileId: 'tile-c', startedAt: '2026-01-01T00:05:00.000Z' }),
        session({ sessionId: 'working-a', tileId: 'tile-a', startedAt: '2026-01-01T00:03:00.000Z' }),
        session({ sessionId: 'working-b', tileId: 'tile-b', startedAt: '2026-01-01T00:04:00.000Z' }),
        session({ sessionId: 'done', tileId: 'tile-d', status: 'done', startedAt: '2026-01-01T00:06:00.000Z' }),
        session({ sessionId: 'exited', tileId: 'tile-e', status: 'exited', startedAt: '2026-01-01T00:00:00.000Z' }),
      ],
    }),
    recents: [],
    activeExpanded: false,
  })

  assert.deepEqual(sectionKeys(sections), {
    top: ['new-session'],
    attention: [sessionItemKey('input-early'), sessionItemKey('input-late')],
    active: [
      sessionItemKey('working-a'),
      sessionItemKey('working-b'),
      sessionItemKey('working-c'),
    ],
  })
  const active = sections.find((section) => section.id === 'active')
  assert.equal(active?.total, 4)

  const expanded = buildCommandPaletteHome({
    catalog: catalog({
      sessions: [
        session({ sessionId: 'working-a', startedAt: '2026-01-01T00:03:00.000Z' }),
        session({ sessionId: 'working-b', startedAt: '2026-01-01T00:04:00.000Z' }),
        session({ sessionId: 'working-c', startedAt: '2026-01-01T00:05:00.000Z' }),
        session({ sessionId: 'done', status: 'done', startedAt: '2026-01-01T00:06:00.000Z' }),
      ],
    }),
    recents: [],
    activeExpanded: true,
  })
  assert.deepEqual(
    expanded.find((section) => section.id === 'active')?.items.map((item) => item.key),
    [
      sessionItemKey('working-a'),
      sessionItemKey('working-b'),
      sessionItemKey('working-c'),
      sessionItemKey('done'),
    ],
  )
})

test('orders active agents working first, then done, each by start time and tile id', () => {
  const sections = buildCommandPaletteHome({
    catalog: catalog({
      sessions: [
        session({ sessionId: 'done-late', tileId: 'tile-d2', status: 'done', startedAt: '2026-01-01T00:01:00.000Z' }),
        session({ sessionId: 'done-early', tileId: 'tile-d1', status: 'done', startedAt: '2026-01-01T00:01:00.000Z' }),
        session({ sessionId: 'working-b', tileId: 'tile-b', startedAt: '2026-01-01T00:02:00.000Z' }),
        session({ sessionId: 'working-a', tileId: 'tile-a', startedAt: '2026-01-01T00:02:00.000Z' }),
      ],
    }),
    recents: [],
    activeExpanded: true,
  })

  assert.deepEqual(
    sections.find((section) => section.id === 'active')?.items.map((item) => item.key),
    [
      sessionItemKey('working-a'),
      sessionItemKey('working-b'),
      sessionItemKey('done-early'),
      sessionItemKey('done-late'),
    ],
  )
})

test('home puts the last used item first and never repeats it below', () => {
  const recents: CommandPaletteRecent[] = [
    { key: actionItemKey('open-settings') },
    { key: sessionItemKey('working') },
    { key: workspaceItemKey('workspace-b') },
    { key: 'new-session' },
    { key: sessionItemKey('input') },
    { key: sessionItemKey('exited') },
    { key: actionItemKey('removed') },
  ]
  const sections = buildCommandPaletteHome({
    catalog: catalog({
      workspaces: [workspace('workspace-a', 'Alpha'), workspace('workspace-b', 'Beta')],
      sessions: [
        session({ sessionId: 'input', status: 'needs-input', startedAt: '2026-01-01T00:00:00.000Z' }),
        session({ sessionId: 'working', startedAt: '2026-01-01T00:01:00.000Z' }),
        session({ sessionId: 'exited', status: 'exited' }),
      ],
    }),
    recents,
    activeExpanded: false,
  })

  assert.deepEqual(sectionKeys(sections), {
    top: [actionItemKey('open-settings'), 'new-session'],
    attention: [sessionItemKey('input')],
    recent: [sessionItemKey('working'), workspaceItemKey('workspace-b')],
  })

  const allKeys = sections.flatMap((section) => section.items.map((item) => item.key))
  assert.equal(new Set(allKeys).size, allKeys.length)
})

test('resolves live recents and drops targets that are gone', () => {
  const target = session({ sessionId: 'live' })
  const file: FileSearchEntry = { name: 'index.ts', relativePath: 'src/index.ts' }
  const base = catalog({
    sessions: [target, session({ sessionId: 'exited', status: 'exited' })],
    workspaces: [workspace('workspace-a', 'Alpha')],
    actions: [action('open-settings', 'Open settings')],
  })

  assert.deepEqual(resolveCommandPaletteRecent({ key: 'new-session' }, base), { key: 'new-session', kind: 'new-session' })
  assert.equal(resolveCommandPaletteRecent({ key: sessionItemKey('live') }, base)?.kind, 'session')
  assert.equal(resolveCommandPaletteRecent({ key: sessionItemKey('exited') }, base), null)
  assert.equal(resolveCommandPaletteRecent({ key: sessionItemKey('closed') }, base), null)
  assert.equal(resolveCommandPaletteRecent({ key: workspaceItemKey('workspace-a') }, base)?.kind, 'workspace')
  assert.equal(resolveCommandPaletteRecent({ key: workspaceItemKey('workspace-z') }, base), null)
  assert.equal(resolveCommandPaletteRecent({ key: actionItemKey('open-settings') }, base)?.kind, 'action')
  assert.equal(resolveCommandPaletteRecent({ key: actionItemKey('removed') }, base), null)
  assert.equal(resolveCommandPaletteRecent({ key: fileItemKey('workspace-a', 'src/index.ts'), file: { workspaceId: 'workspace-a', entry: file } }, base)?.kind, 'file')
  assert.equal(resolveCommandPaletteRecent({ key: fileItemKey('workspace-b', 'src/index.ts'), file: { workspaceId: 'workspace-b', entry: file } }, base), null)
  assert.equal(resolveCommandPaletteRecent({ key: 'unknown:item' }, base), null)
})

test('limits the recent group to five resolved items', () => {
  const sessions = Array.from({ length: 8 }, (_, index) => session({ sessionId: `session-${index}` }))
  const recents: CommandPaletteRecent[] = sessions.map((entry) => ({ key: sessionItemKey(entry.sessionId) }))
  const sections = buildCommandPaletteHome({
    catalog: catalog({ sessions, workspaces: [workspace('workspace-a', 'Alpha')] }),
    recents,
    activeExpanded: false,
  })

  assert.equal(sections.find((section) => section.id === 'top')?.items.length, 2)
  assert.equal(sections.find((section) => section.id === 'recent')?.items.length, 5)
})

test('orders search groups by their best score with a fixed tie-break', () => {
  const catalogWithMatches = catalog({
    workspaces: [workspace('workspace-a', 'Beta')],
    sessions: [
      session({ sessionId: 'beta-session', title: 'Beta fix', workspaceId: 'workspace-a' }),
      session({ sessionId: 'other-session', title: 'Other task', workspaceId: 'workspace-z' }),
    ],
    actions: [action('deploy', 'Deploy', { keywords: ['beta'] }), action('other', 'Other')],
  })

  const sections = buildCommandPaletteResults({
    catalog: catalogWithMatches,
    query: { mode: 'all', text: 'beta' },
    files: [],
    sessionLabel: (entry) => entry.title ?? '',
  })

  assert.deepEqual(sections.map((section) => section.id), ['workspaces', 'sessions', 'actions', 'create'])
  assert.deepEqual(sections[0].items.map((item) => item.key), [workspaceItemKey('workspace-a')])
  assert.deepEqual(sections[1].items.map((item) => item.key), [sessionItemKey('beta-session')])
  assert.deepEqual(sections[2].items.map((item) => item.key), [actionItemKey('deploy')])
  assert.deepEqual(sections[0].matches?.[workspaceItemKey('workspace-a')]?.ranges, [[0, 4]])
  assert.equal(sections[2].matches?.[actionItemKey('deploy')]?.ranges.length, 0)
})

test('orders actions inside search results by score', () => {
  const actions = [
    action('keyword', 'Deploy', { keywords: ['workflow'] }),
    action('substring', 'Networkflow'),
    action('word', 'Open workflow'),
    action('prefix', 'Workflow'),
  ]
  const sections = buildCommandPaletteResults({
    catalog: catalog({ workspaces: [], actions, sessions: [] }),
    query: { mode: 'all', text: 'workflow' },
    files: [],
    sessionLabel: () => '',
  })

  const actionsSection = sections.find((section) => section.id === 'actions')
  assert.ok(actionsSection)
  assert.deepEqual(actionsSection.items.map((item) => item.key), [
    actionItemKey('prefix'),
    actionItemKey('word'),
    actionItemKey('substring'),
    actionItemKey('keyword'),
  ])
})

test('caps each search group at eight rows', () => {
  const workspaces = Array.from({ length: 10 }, (_, index) => workspace(`workspace-${index}`, `Workflow ${index}`))
  const sections = buildCommandPaletteResults({
    catalog: catalog({ workspaces, actions: [], sessions: [] }),
    query: { mode: 'all', text: 'workflow' },
    files: [],
    sessionLabel: () => '',
  })

  const workspacesSection = sections.find((section) => section.id === 'workspaces')
  assert.equal(workspacesSection?.items.length, 8)
  assert.equal(workspacesSection?.total, 8)
})

test('adds the prompt row only for all or sessions when there is text', () => {
  const queryFor = (raw: string) => parseCommandPaletteQuery(raw)
  const build = (raw: string) => buildCommandPaletteResults({
    catalog: catalog({ sessions: [], workspaces: [], actions: [] }),
    query: queryFor(raw),
    files: [],
    sessionLabel: () => '',
  })

  const all = build('  fix login  ')
  assert.deepEqual(all.map((section) => section.id), ['create'])
  assert.deepEqual(all[0].items[0], { key: 'new-session-prompt', kind: 'new-session-prompt', prompt: 'fix login' })

  assert.deepEqual(build('@ fix login').map((section) => section.id), ['create'])
  assert.deepEqual(build('> fix login'), [])
  assert.deepEqual(build('# fix login'), [])
  assert.deepEqual(build('/ fix login'), [])
  assert.deepEqual(build('   '), [])
})

test('searches files only in all or files mode with two or more characters', () => {
  const files: FileSearchEntry[] = [
    { name: 'notes.md', relativePath: 'docs/notes.md' },
    { name: 'index.ts', relativePath: 'src/index.ts' },
  ]
  const build = (raw: string) => buildCommandPaletteResults({
    catalog: catalog({ sessions: [], workspaces: [], actions: [] }),
    query: parseCommandPaletteQuery(raw),
    files,
    sessionLabel: () => '',
  })

  const all = build('notes')
  assert.deepEqual(all.map((section) => section.id), ['files', 'create'])
  assert.deepEqual(all[0].items[0], {
    key: fileItemKey('workspace-a', 'docs/notes.md'),
    kind: 'file',
    workspaceId: 'workspace-a',
    entry: files[0],
  })
  assert.deepEqual(all[0].matches?.[fileItemKey('workspace-a', 'docs/notes.md')]?.ranges, [[0, 5]])

  assert.deepEqual(build('/ notes').map((section) => section.id), ['files'])
  assert.deepEqual(build('@ notes').map((section) => section.id), ['create'])
  assert.deepEqual(build('# notes'), [])
  assert.deepEqual(build('> notes'), [])
  assert.deepEqual(build('n').map((section) => section.id), ['create'])
  assert.deepEqual(build('/ n'), [])
})

test('matches a file by its relative path without highlight ranges', () => {
  const entry: FileSearchEntry = { name: 'index.ts', relativePath: 'src/deep/index.ts' }
  const sections = buildCommandPaletteResults({
    catalog: catalog({ sessions: [], workspaces: [], actions: [] }),
    query: parseCommandPaletteQuery('/ deep'),
    files: [entry],
    sessionLabel: () => '',
  })

  const match = sections[0].matches?.[fileItemKey('workspace-a', entry.relativePath)]
  assert.ok(match)
  assert.deepEqual(match.ranges, [])
})

test('home section items are built from live sessions only', () => {
  const sections = buildCommandPaletteHome({
    catalog: catalog({
      sessions: [
        session({ sessionId: 'exited', status: 'exited' }),
        session({ sessionId: 'done', status: 'done' }),
      ],
    }),
    recents: [{ key: sessionItemKey('exited') }],
    activeExpanded: false,
  })

  assert.deepEqual(sectionKeys(sections), {
    top: ['new-session'],
    active: [sessionItemKey('done')],
  })
})
