import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { Routine } from '@shared/routines'

// routines.ts imports electron for IPC; the store itself never touches it.
function loadRoutinesModule(): typeof import('./routines') {
  const nodeRequire = createRequire(import.meta.url)
  const nodeModule = nodeRequire('node:module') as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown
    _cache: Record<string, unknown>
  }
  const originalLoad = nodeModule._load
  const modulePath = nodeRequire.resolve('./routines.ts')
  const fakeElectron = {
    ipcMain: { handle: () => undefined },
    BrowserWindow: { getAllWindows: () => [] },
  }

  nodeModule._load = function(request, parent, isMain) {
    if (request === 'electron') return fakeElectron
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    delete nodeModule._cache[modulePath]
    return nodeRequire(modulePath) as typeof import('./routines')
  } finally {
    nodeModule._load = originalLoad
  }
}

const { createRoutineStore } = loadRoutinesModule()

const validInput = {
  botId: 'bot-abc',
  workspaceId: 'workspace-1',
  name: 'Morning check',
  instruction: 'Look for new failures.',
  schedule: { kind: 'daily', time: '09:00', days: [] },
  enabled: true,
}

async function withStoreFile(run: (filePath: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'yira-routines-'))
  try {
    await run(join(directory, 'routines.json'))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function sequentialIds(): () => string {
  let counter = 0
  return () => `routine-id-${++counter}`
}

function steppingClock(): { now: () => string; set: (value: string) => void } {
  let current = '2026-01-01T00:00:00.000Z'
  return { now: () => current, set: (value) => { current = value } }
}

test('lists no routines when the file does not exist', async () => {
  await withStoreFile(async (filePath) => {
    assert.deepEqual(await createRoutineStore(filePath).list(), [])
  })
})

test('create sets the anchor and defaults, and survives a reopen', async () => {
  await withStoreFile(async (filePath) => {
    const store = createRoutineStore(filePath, () => '2026-01-01T00:00:00.000Z', sequentialIds())
    const created = await store.save(validInput)
    assert.equal(created.id, 'routine-id-1')
    assert.equal(created.anchorAt, '2026-01-01T00:00:00.000Z')
    assert.equal(created.createdAt, '2026-01-01T00:00:00.000Z')
    assert.equal(created.consecutiveFailures, 0)
    assert.equal(created.lastRunAt, undefined)

    assert.equal(JSON.parse(await readFile(filePath, 'utf8')).version, 1)
    const reopened = createRoutineStore(filePath)
    assert.deepEqual(await reopened.list(), [created])
    assert.deepEqual(await reopened.get(created.id), created)
  })
})

test('update keeps run state and the anchor when the schedule is unchanged', async () => {
  await withStoreFile(async (filePath) => {
    const clock = steppingClock()
    const store = createRoutineStore(filePath, clock.now, sequentialIds())
    const created = await store.save(validInput)
    await store.recordRun(created.id, { lastRunAt: '2026-01-01T09:00:00.000Z', lastResult: 'started', lastTileId: 'tile-1' })

    clock.set('2026-01-02T00:00:00.000Z')
    const updated = await store.save({ ...validInput, id: created.id, name: 'Renamed' })
    assert.equal(updated.name, 'Renamed')
    assert.equal(updated.anchorAt, '2026-01-01T00:00:00.000Z')
    assert.equal(updated.createdAt, '2026-01-01T00:00:00.000Z')
    assert.equal(updated.updatedAt, '2026-01-02T00:00:00.000Z')
    assert.equal(updated.lastRunAt, '2026-01-01T09:00:00.000Z')
    assert.equal(updated.lastResult, 'started')
    assert.equal(updated.lastTileId, 'tile-1')
  })
})

test('a schedule change resets the anchor', async () => {
  await withStoreFile(async (filePath) => {
    const clock = steppingClock()
    const store = createRoutineStore(filePath, clock.now, sequentialIds())
    const created = await store.save(validInput)

    clock.set('2026-01-03T00:00:00.000Z')
    const updated = await store.save({
      ...validInput,
      id: created.id,
      schedule: { kind: 'interval', every: 2, unit: 'hours' },
    })
    assert.equal(updated.anchorAt, '2026-01-03T00:00:00.000Z')
  })
})

test('re-enabling resets the anchor and clears pause and failures', async () => {
  await withStoreFile(async (filePath) => {
    const clock = steppingClock()
    const store = createRoutineStore(filePath, clock.now, sequentialIds())
    const created = await store.save(validInput)
    await store.recordRun(created.id, {
      enabled: false,
      consecutiveFailures: 5,
      pausedAt: '2026-01-01T10:00:00.000Z',
      lastResult: 'failed',
      lastError: 'boom',
    })

    clock.set('2026-01-05T00:00:00.000Z')
    const updated = await store.save({ ...validInput, id: created.id, enabled: true })
    assert.equal(updated.enabled, true)
    assert.equal(updated.anchorAt, '2026-01-05T00:00:00.000Z')
    assert.equal(updated.pausedAt, undefined)
    assert.equal(updated.consecutiveFailures, 0)
    assert.equal(updated.lastResult, 'failed')

    const stored = JSON.parse(await readFile(filePath, 'utf8')).routines[0]
    assert.equal('pausedAt' in stored, false)
  })
})

test('recordRun persists, notifies subscribers and clears fields set to undefined', async () => {
  await withStoreFile(async (filePath) => {
    const store = createRoutineStore(filePath, () => '2026-01-01T00:00:00.000Z', sequentialIds())
    const created = await store.save(validInput)
    const seen: Routine[][] = []
    const unsubscribe = store.subscribe((routines) => seen.push(routines))

    const recorded = await store.recordRun(created.id, {
      lastRunAt: '2026-01-01T09:00:00.000Z',
      lastResult: 'failed',
      lastError: 'x'.repeat(600),
      consecutiveFailures: 1,
    })
    assert.equal(recorded?.lastError?.length, 500)
    assert.equal(seen.length, 1)
    assert.equal(seen[0][0].consecutiveFailures, 1)

    const cleared = await store.recordRun(created.id, { lastError: undefined })
    assert.equal(cleared?.lastError, undefined)
    assert.equal(seen.length, 2)

    const reopened = createRoutineStore(filePath)
    const [stored] = await reopened.list()
    assert.equal(stored.lastResult, 'failed')
    assert.equal(stored.lastError, undefined)

    unsubscribe()
    await store.recordRun(created.id, { consecutiveFailures: 2 })
    assert.equal(seen.length, 2)
    assert.equal(await store.recordRun('routine-missing', { consecutiveFailures: 1 }), null)
  })
})

test('save notifies subscribers and remove drops the routine', async () => {
  await withStoreFile(async (filePath) => {
    const store = createRoutineStore(filePath, undefined, sequentialIds())
    let notifications = 0
    store.subscribe(() => { notifications += 1 })
    const created = await store.save(validInput)
    assert.equal(await store.remove('routine-missing'), false)
    assert.equal(await store.remove(created.id), true)
    assert.deepEqual(await store.list(), [])
    assert.equal(notifications, 2)
  })
})

test('rejects an unknown bot when getBot is provided', async () => {
  await withStoreFile(async (filePath) => {
    const store = createRoutineStore(filePath, undefined, sequentialIds(), {
      getBot: async (id) => (id === 'bot-abc' ? { id } : null),
    })
    await assert.rejects(() => store.save({ ...validInput, botId: 'bot-other' }), /Bot not found/)
    assert.equal((await store.save(validInput)).botId, 'bot-abc')
  })
})

test('rejects an update for an unknown routine', async () => {
  await withStoreFile(async (filePath) => {
    const store = createRoutineStore(filePath)
    await assert.rejects(() => store.save({ ...validInput, id: 'routine-missing' }), /Routine not found/)
  })
})

test('broken JSON reads as an empty list', async () => {
  await withStoreFile(async (filePath) => {
    await writeFile(filePath, '{ not json', 'utf8')
    assert.deepEqual(await createRoutineStore(filePath).list(), [])
  })
})

test('concurrent saves are both kept', async () => {
  await withStoreFile(async (filePath) => {
    const store = createRoutineStore(filePath, undefined, sequentialIds())
    await Promise.all([
      store.save({ ...validInput, name: 'First' }),
      store.save({ ...validInput, name: 'Second' }),
    ])
    const names = (await createRoutineStore(filePath).list()).map((routine) => routine.name).sort()
    assert.deepEqual(names, ['First', 'Second'])
  })
})
