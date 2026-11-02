import assert from 'node:assert/strict'
import test from 'node:test'

import type { BotCallConfirmRequest, BotDefinition, BotOpenSessionEvent } from '@shared/bots'
import type { AgentActiveSession, AgentProvider } from '@shared/types'

import type { BotToolContext, BotToolProvider } from './botBridge'
import { createBotToolProviders, type BotToolDependencies } from './botTools'

const workspaces = [
  { id: 'ws-1', name: 'Alpha', rootFolderPath: '/repos/alpha' },
  { id: 'ws-2', name: 'Beta', rootFolderPath: '/repos/beta' },
]

function makeBot(overrides: Partial<BotDefinition> = {}): BotDefinition {
  return {
    id: 'bot-caller',
    name: 'Caller',
    icon: 'search',
    color: 'sky',
    provider: 'claude',
    model: '',
    description: 'Calls others',
    role: '',
    workspaces: { mode: 'all' },
    tools: ['sessions_search', 'session_read', 'session_open', 'session_create', 'bots_call'],
    callable: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function contextFor(bot: BotDefinition, workspaceId = 'ws-1'): BotToolContext {
  return { scope: { workspaceId, tileId: 'tile-caller', botId: bot.id }, bot }
}

interface Harness {
  providers: BotToolProvider[]
  launches: unknown[]
  opened: BotOpenSessionEvent[]
  confirmations: Array<Omit<BotCallConfirmRequest, 'requestId'>>
  searchRoots: string[][]
  transcriptRoots: string[]
  historyRoots: string[]
  call: (name: string, args: Record<string, unknown>, context: BotToolContext) => Promise<string>
}

interface HarnessOptions {
  bots?: BotDefinition[]
  activeSessions?: AgentActiveSession[]
  confirmAnswer?: boolean
  noLauncher?: boolean
  transcriptWorkspaceRoot?: string
  historyWorkspaceRoot?: string
}

function makeSession(overrides: Partial<AgentActiveSession>): AgentActiveSession {
  return {
    sessionId: 'sess-1',
    tileId: 'tile-1',
    workspaceId: 'ws-1',
    provider: 'claude',
    status: 'running',
    startedAt: '2026-01-01T00:00:00.000Z',
    lastActivityAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as AgentActiveSession
}

function makeHarness(options: HarnessOptions = {}): Harness {
  const harness: Harness = {
    providers: [],
    launches: [],
    opened: [],
    confirmations: [],
    searchRoots: [],
    transcriptRoots: [],
    historyRoots: [],
    call: async (name, args, context) => {
      const provider = harness.providers.find((candidate) => candidate.definitions.some((tool) => tool.name === name))
      assert.ok(provider, `missing provider for ${name}`)
      return provider.call(name, args, context)
    },
  }

  const deps: BotToolDependencies = {
    getWorkspaces: async () => workspaces,
    getBots: async () => options.bots ?? [],
    getLauncher: () => options.noLauncher ? null : async (input) => {
      harness.launches.push(input)
      const requested = input as { workspaceId: string; provider?: AgentProvider }
      return { workspaceId: requested.workspaceId, tileId: 'tile-new', provider: requested.provider ?? 'claude' }
    },
    getActiveSessions: () => options.activeSessions ?? [],
    openSession: (event) => harness.opened.push(event),
    confirmBotCall: async (input) => {
      harness.confirmations.push(input)
      return options.confirmAnswer ?? true
    },
    searchContent: async (input) => {
      harness.searchRoots.push(input.workspaceRoots)
      return [{
        provider: 'claude',
        identifier: 'sess-9',
        workspaceRoot: input.workspaceRoots[0],
        title: 'Fix login',
        lastActivityAt: '2026-03-04T10:00:00.000Z',
        matchCount: 3,
        snippets: ['first snippet', 'second snippet'],
      }]
    },
    readTranscript: async (_query, readOptions) => {
      harness.transcriptRoots.push(readOptions?.workspaceRoot ?? '')
      const found = readOptions?.workspaceRoot === options.transcriptWorkspaceRoot
      return {
        found,
        start: found ? 2 : 0,
        total: found ? 4 : 0,
        entries: found
          ? [{ kind: 'prompt', text: 'hello' }, { kind: 'reply', text: 'x'.repeat(2_500) }]
          : [],
      }
    },
    readHistory: async (readOptions) => {
      harness.historyRoots.push(readOptions?.workspaceRoot ?? '')
      const found = readOptions?.workspaceRoot === options.historyWorkspaceRoot
      return {
        hasMore: false,
        items: found
          ? [{
            identifier: 'sess-old',
            provider: 'claude',
            cwd: 'packages/app',
            startedAt: '2026-01-01T00:00:00.000Z',
            lastActivityAt: '2026-01-02T00:00:00.000Z',
            messageCount: 3,
          }]
          : [],
      }
    },
  }
  harness.providers = createBotToolProviders(deps)
  return harness
}

test('every grant has a provider and tool names are unique', () => {
  const { providers } = makeHarness()
  assert.deepEqual(providers.map((provider) => provider.grant), [
    'sessions_search', 'session_read', 'session_open', 'session_create', 'bots_call',
  ])
  const names = providers.flatMap((provider) => provider.definitions.map((tool) => tool.name))
  assert.equal(new Set(names).size, names.length)
  for (const definition of providers.flatMap((provider) => provider.definitions)) {
    assert.equal(definition.inputSchema.type, 'object')
    assert.equal(definition.inputSchema.additionalProperties, false)
  }
})

test('sessions_search defaults to the own workspace and formats matches', async () => {
  const harness = makeHarness()
  const text = await harness.call('sessions_search', { query: 'login' }, contextFor(makeBot()))
  assert.deepEqual(harness.searchRoots, [['/repos/alpha']])
  assert.equal(text, [
    '1. claude sess-9 · Alpha · 2026-03-04 · "Fix login" (3 matches)',
    '   first snippet',
    '   second snippet',
    'Read one with session_read(provider, sessionId).',
  ].join('\n'))
})

test('sessions_search with scope all uses every allowed workspace', async () => {
  const harness = makeHarness()
  await harness.call('sessions_search', { query: 'login', scope: 'all' }, contextFor(makeBot()))
  assert.deepEqual(harness.searchRoots, [['/repos/alpha', '/repos/beta']])

  const limited = makeBot({ workspaces: { mode: 'selected', workspaceIds: ['ws-1'] } })
  await harness.call('sessions_search', { query: 'login', scope: 'all' }, contextFor(limited))
  assert.deepEqual(harness.searchRoots[1], ['/repos/alpha'])
})

test('sessions_search rejects bad arguments', async () => {
  const harness = makeHarness()
  await assert.rejects(harness.call('sessions_search', {}, contextFor(makeBot())), /"query" is required/)
  await assert.rejects(
    harness.call('sessions_search', { query: 'login', scope: 'everywhere' }, contextFor(makeBot())),
    /"scope"/,
  )
  await assert.rejects(
    harness.call('sessions_search', { query: 'login', limit: 500 }, contextFor(makeBot())),
    /"limit"/,
  )
})

test('session_read formats entries and offers older ones', async () => {
  const harness = makeHarness({ transcriptWorkspaceRoot: '/repos/alpha' })
  const text = await harness.call('session_read', { provider: 'claude', sessionId: 'sess-1' }, contextFor(makeBot()))
  const lines = text.split('\n')
  assert.equal(lines[0], 'Session sess-1 (claude), entries 3-4 of 4:')
  assert.equal(lines[1], '[2] prompt: hello')
  assert.equal(lines[2], `[3] reply: ${'x'.repeat(2_000)}…`)
  assert.equal(lines[3], 'Older entries: session_read with before=2.')
})

test('session_read tries the own workspace first and stops when found', async () => {
  const harness = makeHarness({ transcriptWorkspaceRoot: '/repos/beta' })
  await harness.call('session_read', { provider: 'claude', sessionId: 'sess-1' }, contextFor(makeBot(), 'ws-2'))
  assert.deepEqual(harness.transcriptRoots, ['/repos/beta'])
})

test('session_read cannot reach a workspace the bot is not enabled for', async () => {
  const harness = makeHarness({ transcriptWorkspaceRoot: '/repos/beta' })
  const limited = makeBot({ workspaces: { mode: 'selected', workspaceIds: ['ws-1'] } })
  await assert.rejects(
    harness.call('session_read', { provider: 'claude', sessionId: 'sess-1' }, contextFor(limited)),
    /Session not found in the workspaces this bot can access\./,
  )
  assert.deepEqual(harness.transcriptRoots, ['/repos/alpha'])
})

test('session_open focuses a running session without launching', async () => {
  const harness = makeHarness({
    activeSessions: [makeSession({ sessionId: 'sess-run', tileId: 'tile-run', workspaceId: 'ws-2' })],
  })
  const text = await harness.call('session_open', { provider: 'claude', sessionId: 'sess-run' }, contextFor(makeBot()))
  assert.equal(text, 'Showing the running session in Yira.')
  assert.deepEqual(harness.opened, [{ workspaceId: 'ws-2', tileId: 'tile-run' }])
  assert.deepEqual(harness.launches, [])
})

test('session_open does not focus a running session in a workspace the bot cannot access', async () => {
  const harness = makeHarness({
    activeSessions: [makeSession({ sessionId: 'sess-run', workspaceId: 'ws-2' })],
  })
  const limited = makeBot({ workspaces: { mode: 'selected', workspaceIds: ['ws-1'] } })
  await assert.rejects(
    harness.call('session_open', { provider: 'claude', sessionId: 'sess-run' }, contextFor(limited)),
    /Session not found/,
  )
  assert.deepEqual(harness.opened, [])
})

test('session_open resumes a stopped session with its cwd', async () => {
  const harness = makeHarness({ historyWorkspaceRoot: '/repos/beta' })
  const text = await harness.call('session_open', { provider: 'claude', sessionId: 'sess-old' }, contextFor(makeBot()))
  assert.equal(text, 'Reopened session sess-old in a new tile of Beta.')
  assert.deepEqual(harness.historyRoots, ['/repos/alpha', '/repos/beta'])
  assert.deepEqual(harness.launches, [{
    workspaceId: 'ws-2',
    provider: 'claude',
    resumeSessionId: 'sess-old',
    resumeCwd: 'packages/app',
  }])
  assert.deepEqual(harness.opened, [{ workspaceId: 'ws-2', tileId: 'tile-new' }])
})

test('session_open reports a missing launcher', async () => {
  const harness = makeHarness({ historyWorkspaceRoot: '/repos/alpha', noLauncher: true })
  await assert.rejects(
    harness.call('session_open', { provider: 'claude', sessionId: 'sess-old' }, contextFor(makeBot())),
    /Yira is still starting; try again\./,
  )
})

test('session_create launches a regular session in the own workspace', async () => {
  const harness = makeHarness()
  const text = await harness.call(
    'session_create',
    { prompt: '  Continue the migration  ', provider: 'codex' },
    contextFor(makeBot(), 'ws-2'),
  )
  assert.equal(text, 'Started a new session in tile tile-new.')
  assert.deepEqual(harness.launches, [{ workspaceId: 'ws-2', prompt: 'Continue the migration', provider: 'codex' }])
  assert.deepEqual(harness.opened, [{ workspaceId: 'ws-2', tileId: 'tile-new' }])
})

test('session_create validates the prompt', async () => {
  const harness = makeHarness()
  await assert.rejects(harness.call('session_create', { prompt: '   ' }, contextFor(makeBot())), /"prompt"/)
  await assert.rejects(
    harness.call('session_create', { prompt: 'x'.repeat(20_001) }, contextFor(makeBot())),
    /20000 characters or fewer/,
  )
  assert.deepEqual(harness.launches, [])
})

const reviewer = makeBot({ id: 'bot-reviewer', name: 'Reviewer', description: 'Reviews diffs', provider: 'codex', callable: true })

test('bots_list shows only other callable bots available in the workspace', async () => {
  const caller = makeBot({ callable: true })
  const harness = makeHarness({
    bots: [
      caller,
      reviewer,
      makeBot({ id: 'bot-private', name: 'Private', callable: false }),
      makeBot({ id: 'bot-elsewhere', name: 'Elsewhere', callable: true, workspaces: { mode: 'selected', workspaceIds: ['ws-2'] } }),
    ],
  })
  const text = await harness.call('bots_list', {}, contextFor(caller))
  assert.equal(text, '- Reviewer (id bot-reviewer, codex): Reviews diffs')
})

test('bots_list says when nothing can be called', async () => {
  const harness = makeHarness({ bots: [makeBot()] })
  assert.equal(
    await harness.call('bots_list', {}, contextFor(makeBot())),
    'No other bots can be called in this workspace.',
  )
})

test('bot_send returns the declined text and does not launch', async () => {
  const harness = makeHarness({ bots: [reviewer], confirmAnswer: false })
  const text = await harness.call('bot_send', { botId: 'bot-reviewer', prompt: 'Review it' }, contextFor(makeBot()))
  assert.equal(text, 'The user declined starting Reviewer.')
  assert.deepEqual(harness.confirmations, [
    { workspaceId: 'ws-1', callerName: 'Caller', targetName: 'Reviewer', prompt: 'Review it' },
  ])
  assert.deepEqual(harness.launches, [])
})

test('bot_send launches the bot without stealing focus and reports the session id', async () => {
  const harness = makeHarness({
    bots: [reviewer],
    activeSessions: [makeSession({ sessionId: 'sess-bot', tileId: 'tile-new', provider: 'codex' })],
  })
  const text = await harness.call('bot_send', { botId: 'bot-reviewer', prompt: 'Review it' }, contextFor(makeBot()))
  assert.deepEqual(harness.launches, [{ workspaceId: 'ws-1', botId: 'bot-reviewer', prompt: 'Review it' }])
  assert.deepEqual(harness.opened, [])
  assert.equal(
    text,
    'Started Reviewer in tile tile-new. When it finishes, read its answer with session_read(provider: "claude", sessionId: "sess-bot").',
  )
})

test('bot_send points to the sidebar when the session id is not known yet', async () => {
  const harness = makeHarness({ bots: [reviewer] })
  const text = await harness.call('bot_send', { botId: 'bot-reviewer', prompt: 'Review it' }, contextFor(makeBot()))
  assert.match(text, /^Started Reviewer in tile tile-new\. .*sidebar/)
})

test('bot_send refuses missing, non-callable, self and other-workspace targets', async () => {
  const caller = makeBot({ callable: true })
  const harness = makeHarness({
    bots: [
      caller,
      makeBot({ id: 'bot-private', name: 'Private', callable: false }),
      makeBot({ id: 'bot-elsewhere', name: 'Elsewhere', callable: true, workspaces: { mode: 'selected', workspaceIds: ['ws-2'] } }),
    ],
  })
  const send = (botId: string) => harness.call('bot_send', { botId, prompt: 'Hi' }, contextFor(caller))
  await assert.rejects(send('bot-missing'), /No bot has the id/)
  await assert.rejects(send('bot-caller'), /cannot start itself/)
  await assert.rejects(send('bot-private'), /cannot be called/)
  await assert.rejects(send('bot-elsewhere'), /not available in this workspace/)
  assert.deepEqual(harness.confirmations, [])
  assert.deepEqual(harness.launches, [])
})
