import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

// bots.ts imports electron for IPC; the store itself never touches it.
function loadBotsModule(): typeof import('./bots') {
  const nodeRequire = createRequire(import.meta.url)
  const nodeModule = nodeRequire('node:module') as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown
    _cache: Record<string, unknown>
  }
  const originalLoad = nodeModule._load
  const modulePath = nodeRequire.resolve('./bots.ts')
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
    return nodeRequire(modulePath) as typeof import('./bots')
  } finally {
    nodeModule._load = originalLoad
  }
}

const { createBotStore } = loadBotsModule()

const validInput = {
  name: 'Reviewer',
  icon: 'shield',
  color: 'emerald',
  provider: 'claude',
  model: '',
  description: 'Reviews changes.',
  role: 'Review the diff.',
  workspaces: { mode: 'all' },
}

async function withStoreFile(run: (filePath: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'yira-bots-'))
  try {
    await run(join(directory, 'bots.json'))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function sequentialIds(): () => string {
  let counter = 0
  return () => `bot-id-${++counter}`
}

test('lists no bots when the file does not exist', async () => {
  await withStoreFile(async (filePath) => {
    assert.deepEqual(await createBotStore(filePath).list(), [])
  })
})

test('creates a bot and reads it back from a new store', async () => {
  await withStoreFile(async (filePath) => {
    const store = createBotStore(filePath, () => '2026-01-01T00:00:00.000Z', sequentialIds())
    const created = await store.save(validInput)
    assert.equal(created.id, 'bot-id-1')
    assert.equal(created.createdAt, '2026-01-01T00:00:00.000Z')

    const stored = JSON.parse(await readFile(filePath, 'utf8'))
    assert.equal(stored.version, 1)

    const reopened = createBotStore(filePath)
    assert.deepEqual(await reopened.list(), [created])
    assert.deepEqual(await reopened.get(created.id), created)
    assert.equal(await reopened.get('bot-missing'), null)
  })
})

test('updating a bot keeps createdAt and refreshes updatedAt', async () => {
  await withStoreFile(async (filePath) => {
    const times = ['2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z']
    const store = createBotStore(filePath, () => times.shift() ?? '2026-03-01T00:00:00.000Z', sequentialIds())
    const created = await store.save(validInput)
    const updated = await store.save({ ...validInput, id: created.id, name: 'Renamed' })

    assert.equal(updated.id, created.id)
    assert.equal(updated.name, 'Renamed')
    assert.equal(updated.createdAt, '2026-01-01T00:00:00.000Z')
    assert.equal(updated.updatedAt, '2026-02-01T00:00:00.000Z')
    assert.equal((await store.list()).length, 1)
  })
})

test('saving an unknown id throws', async () => {
  await withStoreFile(async (filePath) => {
    const store = createBotStore(filePath)
    await assert.rejects(store.save({ ...validInput, id: 'bot-unknown' }), /Bot not found/)
  })
})

test('removes an existing bot and reports unknown ids', async () => {
  await withStoreFile(async (filePath) => {
    const store = createBotStore(filePath, undefined, sequentialIds())
    const created = await store.save(validInput)

    assert.equal(await store.remove('not-a-bot-id'), false)
    assert.equal(await store.remove('bot-unknown'), false)
    assert.equal(await store.remove(created.id), true)
    assert.deepEqual(await store.list(), [])
    assert.deepEqual(await createBotStore(filePath).list(), [])
  })
})

test('treats broken JSON as an empty list and recovers on save', async () => {
  await withStoreFile(async (filePath) => {
    await writeFile(filePath, '{ not json', 'utf8')
    const store = createBotStore(filePath, undefined, sequentialIds())
    assert.deepEqual(await store.list(), [])
    assert.equal(await readFile(filePath, 'utf8'), '{ not json')

    await store.save(validInput)
    assert.equal((await createBotStore(filePath).list()).length, 1)
  })
})

test('drops stored entries that fail validation', async () => {
  await withStoreFile(async (filePath) => {
    const store = createBotStore(filePath, undefined, sequentialIds())
    const created = await store.save(validInput)
    const stored = JSON.parse(await readFile(filePath, 'utf8'))
    stored.bots.push({ id: 'bot-broken', name: '' })
    await writeFile(filePath, JSON.stringify(stored), 'utf8')

    assert.deepEqual(await createBotStore(filePath).list(), [created])
  })
})

test('concurrent saves keep both bots', async () => {
  await withStoreFile(async (filePath) => {
    const store = createBotStore(filePath, undefined, sequentialIds())
    await Promise.all([
      store.save({ ...validInput, name: 'First' }),
      store.save({ ...validInput, name: 'Second' }),
    ])

    const names = (await createBotStore(filePath).list()).map((bot) => bot.name)
    assert.deepEqual(names, ['First', 'Second'])
  })
})
