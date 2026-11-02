import assert from 'node:assert/strict'
import test from 'node:test'

import type { BotDefinition } from '@shared/bots'
import { ROUTINE_FAILURE_PAUSE_LIMIT, type Routine } from '@shared/routines'
import type { AgentActiveSession, AgentSessionStatus } from '@shared/types'

import {
  ROUTINE_NO_UPDATE,
  RoutineScheduler,
  buildRoutinePrompt,
  type RoutineSchedulerDependencies,
} from './routineScheduler'

const NOW = new Date('2026-05-04T12:00:00.000Z')
const LONG_AGO = '2026-05-04T08:00:00.000Z'

function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: 'routine-1',
    botId: 'bot-1',
    workspaceId: 'ws-1',
    name: 'Check inbox',
    instruction: 'Look at the inbox.',
    schedule: { kind: 'interval', every: 1, unit: 'hours' },
    enabled: true,
    anchorAt: LONG_AGO,
    consecutiveFailures: 0,
    createdAt: LONG_AGO,
    updatedAt: LONG_AGO,
    ...overrides,
  }
}

function makeBot(overrides: Partial<BotDefinition> = {}): BotDefinition {
  return {
    id: 'bot-1',
    name: 'Helper',
    icon: 'search',
    color: 'sky',
    provider: 'claude',
    model: '',
    description: '',
    role: '',
    workspaces: { mode: 'all' },
    tools: [],
    callable: false,
    createdAt: LONG_AGO,
    updatedAt: LONG_AGO,
    ...overrides,
  }
}

function makeSession(status: AgentSessionStatus, tileId = 'tile-1'): AgentActiveSession {
  return {
    sessionId: tileId,
    tileId,
    workspaceId: 'ws-1',
    provider: 'claude',
    status,
    startedAt: LONG_AGO,
    lastActivityAt: LONG_AGO,
    surface: 'agents-view',
  }
}

interface Harness {
  scheduler: RoutineScheduler
  routines: Map<string, Routine>
  launches: unknown[]
  closed: string[]
  notices: Array<{ title: string; body: string }>
  sessions: Map<string, AgentActiveSession>
  deps: RoutineSchedulerDependencies
}

function createHarness(
  initial: Routine[],
  overrides: Partial<RoutineSchedulerDependencies> = {},
  options: { reply?: string | null } = {},
): Harness {
  const routines = new Map(initial.map((routine) => [routine.id, routine]))
  const sessions = new Map<string, AgentActiveSession>()
  const launches: unknown[] = []
  const closed: string[] = []
  const notices: Array<{ title: string; body: string }> = []
  const deps: RoutineSchedulerDependencies = {
    store: {
      list: async () => [...routines.values()],
      get: async (id) => routines.get(id) ?? null,
      recordRun: async (id, patch) => {
        const existing = routines.get(id)
        if (!existing) return null
        // Like the real store: keys set to undefined clear the field.
        const merged = Object.fromEntries(
          Object.entries({ ...existing, ...patch }).filter(([, value]) => value !== undefined),
        ) as unknown as Routine
        routines.set(id, merged)
        return merged
      },
    },
    getBot: async () => makeBot(),
    getLauncher: () => async (input) => {
      launches.push(input)
      return { workspaceId: 'ws-1', tileId: 'tile-1', provider: 'claude' }
    },
    getSession: (workspaceId, tileId) => sessions.get(`${workspaceId}/${tileId}`) ?? null,
    readLastReply: async () => options.reply ?? null,
    closeSession: async (workspaceId, tileId) => { closed.push(`${workspaceId}/${tileId}`) },
    notify: (title, body) => { notices.push({ title, body }) },
    now: () => NOW,
    ...overrides,
  }
  return { scheduler: new RoutineScheduler(deps), routines, launches, closed, notices, sessions, deps }
}

function stored(harness: Harness, id = 'routine-1'): Routine {
  const routine = harness.routines.get(id)
  assert.ok(routine)
  return routine
}

test('builds the run prompt from the instruction and the routine name', () => {
  assert.equal(
    buildRoutinePrompt({ name: 'Check inbox', instruction: 'Look at the inbox.' }),
    'Look at the inbox.\n\n---\nScheduled run of the Yira routine "Check inbox". '
      + 'Do the task once. If there is nothing new to report, reply with exactly NO_UPDATE and nothing else.',
  )
})

test('a due routine starts a session with the built prompt and records started', async () => {
  const harness = createHarness([makeRoutine({ lastError: 'old', consecutiveFailures: 2 })])

  await harness.scheduler.tick()

  assert.deepEqual(harness.launches, [{
    workspaceId: 'ws-1',
    botId: 'bot-1',
    prompt: buildRoutinePrompt(makeRoutine()),
  }])
  const routine = stored(harness)
  assert.equal(routine.lastResult, 'started')
  assert.equal(routine.lastTileId, 'tile-1')
  assert.equal(routine.lastRunAt, NOW.toISOString())
  assert.equal(routine.consecutiveFailures, 0)
  assert.equal('lastError' in routine, false)
})

test('a routine that is not due does nothing', async () => {
  const harness = createHarness([makeRoutine({ lastRunAt: '2026-05-04T11:30:00.000Z' })])

  await harness.scheduler.tick()

  assert.deepEqual(harness.launches, [])
  assert.equal(stored(harness).lastResult, undefined)
})

test('a previous run that is still working skips the new run', async () => {
  const harness = createHarness([makeRoutine({ lastResult: 'started', lastTileId: 'tile-1' })])
  harness.sessions.set('ws-1/tile-1', makeSession('working'))

  await harness.scheduler.tick()

  assert.deepEqual(harness.launches, [])
  assert.equal(stored(harness).lastResult, 'skipped-busy')
  assert.equal(stored(harness).lastRunAt, NOW.toISOString())
})

test('a finished run that replied NO_UPDATE is closed and recorded as no-update', async () => {
  const harness = createHarness(
    [makeRoutine({ lastResult: 'started', lastTileId: 'tile-1', lastRunAt: '2026-05-04T11:30:00.000Z' })],
    {},
    { reply: `  ${ROUTINE_NO_UPDATE}\n` },
  )
  harness.sessions.set('ws-1/tile-1', makeSession('done'))

  await harness.scheduler.tick()

  assert.deepEqual(harness.closed, ['ws-1/tile-1'])
  assert.equal(stored(harness).lastResult, 'no-update')
})

test('a finished run with another reply is kept open and recorded as reported', async () => {
  const harness = createHarness(
    [makeRoutine({ lastResult: 'started', lastTileId: 'tile-1', lastRunAt: '2026-05-04T11:30:00.000Z' })],
    {},
    { reply: 'You have 3 new messages.' },
  )
  harness.sessions.set('ws-1/tile-1', makeSession('done'))

  await harness.scheduler.tick()

  assert.deepEqual(harness.closed, [])
  assert.equal(stored(harness).lastResult, 'reported')
})

test('a finished run is reported, not hidden, when the reply cannot be read or the close fails', async () => {
  const unreadable = createHarness(
    [makeRoutine({ lastResult: 'started', lastTileId: 'tile-1', lastRunAt: '2026-05-04T11:30:00.000Z' })],
    { readLastReply: async () => { throw new Error('no transcript') } },
  )
  unreadable.sessions.set('ws-1/tile-1', makeSession('done'))
  await unreadable.scheduler.tick()
  assert.equal(stored(unreadable).lastResult, 'reported')

  const unclosable = createHarness(
    [makeRoutine({ lastResult: 'started', lastTileId: 'tile-1', lastRunAt: '2026-05-04T11:30:00.000Z' })],
    {
      readLastReply: async () => ROUTINE_NO_UPDATE,
      closeSession: async () => { throw new Error('cannot close') },
    },
  )
  unclosable.sessions.set('ws-1/tile-1', makeSession('done'))
  await unclosable.scheduler.tick()
  assert.equal(stored(unclosable).lastResult, 'reported')
})

test('a session that is gone or exited is recorded as reported', async () => {
  for (const exited of [false, true]) {
    const harness = createHarness(
      [makeRoutine({ lastResult: 'started', lastTileId: 'tile-1', lastRunAt: '2026-05-04T11:30:00.000Z' })],
    )
    if (exited) harness.sessions.set('ws-1/tile-1', makeSession('exited'))

    await harness.scheduler.tick()

    assert.equal(stored(harness).lastResult, 'reported')
    assert.deepEqual(harness.closed, [])
  }
})

test('a session that is still working is left alone while it is not due', async () => {
  const harness = createHarness(
    [makeRoutine({ lastResult: 'started', lastTileId: 'tile-1', lastRunAt: '2026-05-04T11:30:00.000Z' })],
  )
  harness.sessions.set('ws-1/tile-1', makeSession('needs-input'))

  await harness.scheduler.tick()

  assert.equal(stored(harness).lastResult, 'started')
})

test('a launcher that throws records a failure and notifies', async () => {
  const harness = createHarness([makeRoutine()], {
    getLauncher: () => async () => { throw new Error('No agent available') },
  })

  await harness.scheduler.tick()

  const routine = stored(harness)
  assert.equal(routine.lastResult, 'failed')
  assert.equal(routine.lastError, 'No agent available')
  assert.equal(routine.consecutiveFailures, 1)
  assert.equal(routine.pausedAt, undefined)
  assert.deepEqual(harness.notices, [{ title: 'Routine failed: Check inbox', body: 'No agent available' }])
})

test('a missing bot, a disabled bot and a missing launcher fail with a clear message', async () => {
  const cases: Array<[Partial<RoutineSchedulerDependencies>, string]> = [
    [{ getBot: async () => null }, 'The bot of this routine no longer exists.'],
    [
      { getBot: async () => makeBot({ workspaces: { mode: 'selected', workspaceIds: ['other'] } }) },
      'The bot is not enabled for this workspace.',
    ],
    [{ getLauncher: () => null }, 'Yira is still starting.'],
  ]
  for (const [overrides, message] of cases) {
    const harness = createHarness([makeRoutine()], overrides)

    assert.equal(await harness.scheduler.runRoutine('routine-1', 'schedule'), 'failed')

    assert.equal(stored(harness).lastError, message)
  }
})

test('the fifth failure in a row pauses the routine and notifies again', async () => {
  const harness = createHarness([makeRoutine({ consecutiveFailures: ROUTINE_FAILURE_PAUSE_LIMIT - 1 })], {
    getLauncher: () => async () => { throw new Error('boom') },
  })

  await harness.scheduler.tick()

  const routine = stored(harness)
  assert.equal(routine.consecutiveFailures, ROUTINE_FAILURE_PAUSE_LIMIT)
  assert.equal(routine.pausedAt, NOW.toISOString())
  assert.deepEqual(harness.notices.map((notice) => notice.title), [
    'Routine failed: Check inbox',
    'Routine paused: Check inbox',
  ])
  assert.match(harness.notices[1].body, /failed 5 times in a row/)
})

test('a manual run starts a disabled, paused routine regardless of its schedule', async () => {
  const harness = createHarness([makeRoutine({
    enabled: false,
    pausedAt: LONG_AGO,
    schedule: { kind: 'manual' },
  })])

  assert.equal(await harness.scheduler.runRoutine('routine-1', 'manual'), 'started')

  assert.equal(harness.launches.length, 1)
  assert.equal(stored(harness).lastResult, 'started')
})

test('a scheduled run of a routine that is no longer due does not start', async () => {
  const harness = createHarness([makeRoutine({ enabled: false })])

  assert.equal(await harness.scheduler.runRoutine('routine-1', 'schedule'), 'skipped-busy')

  assert.deepEqual(harness.launches, [])
})

test('running an unknown routine fails', async () => {
  const harness = createHarness([])

  await assert.rejects(() => harness.scheduler.runRoutine('routine-missing', 'manual'), /Routine not found/)
})

test('concurrent runs of the same routine start once and skip the other', async () => {
  const harness = createHarness([makeRoutine()])

  const results = await Promise.all([
    harness.scheduler.runRoutine('routine-1', 'manual'),
    harness.scheduler.runRoutine('routine-1', 'manual'),
  ])

  assert.deepEqual([...results].sort(), ['skipped-busy', 'started'])
  assert.equal(harness.launches.length, 1)
})

test('overlapping ticks do not run a routine twice', async () => {
  const harness = createHarness([makeRoutine()])

  await Promise.all([harness.scheduler.tick(), harness.scheduler.tick()])

  assert.equal(harness.launches.length, 1)
})

test('an error in one routine does not stop the others', async () => {
  const harness = createHarness([
    makeRoutine({ id: 'routine-1', botId: 'bot-broken' }),
    makeRoutine({ id: 'routine-2', botId: 'bot-1' }),
  ], {
    getBot: async (id) => {
      if (id === 'bot-broken') throw new Error('bot store failed')
      return makeBot()
    },
  })

  await harness.scheduler.tick()

  assert.equal(stored(harness, 'routine-1').lastResult, 'failed')
  assert.equal(stored(harness, 'routine-2').lastResult, 'started')
})
