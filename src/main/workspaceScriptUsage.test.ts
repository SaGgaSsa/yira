import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createWorkspaceScriptUsageStore } from './workspaceScriptUsage'

async function createBaseDirectory(context: test.TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'yira-script-usage-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

test('reads an empty usage map when nothing was recorded', async (context) => {
  const store = createWorkspaceScriptUsageStore(await createBaseDirectory(context))

  assert.deepEqual(await store.read('workspace-a'), {})
})

test('records accumulate run counts and keep the last run time', async (context) => {
  const store = createWorkspaceScriptUsageStore(await createBaseDirectory(context))
  const first = new Date('2026-01-01T10:00:00.000Z')
  const second = new Date('2026-01-02T10:00:00.000Z')

  await store.record('workspace-a', 'package:.:dev', first)
  await store.record('workspace-a', 'package:.:dev', second)
  await store.record('workspace-a', 'package:.:build', first)

  assert.deepEqual(await store.read('workspace-a'), {
    'package:.:dev': { runCount: 2, lastRunAt: second.toISOString() },
    'package:.:build': { runCount: 1, lastRunAt: first.toISOString() },
  })
  assert.deepEqual(await store.read('workspace-b'), {})
})

test('concurrent records are serialized without losing counts', async (context) => {
  const store = createWorkspaceScriptUsageStore(await createBaseDirectory(context))

  await Promise.all(Array.from({ length: 10 }, () => store.record('workspace-a', 'package:.:dev')))

  assert.equal((await store.read('workspace-a'))['package:.:dev']?.runCount, 10)
})

test('rejects invalid workspace ids', async (context) => {
  const store = createWorkspaceScriptUsageStore(await createBaseDirectory(context))

  assert.deepEqual(await store.read('../escape'), {})
  await assert.rejects(() => store.record('../escape', 'package:.:dev'), /Invalid scripts workspace id/)
})

test('a corrupt file reads as empty and invalid entries are dropped', async (context) => {
  const baseDirectory = await createBaseDirectory(context)
  const store = createWorkspaceScriptUsageStore(baseDirectory)
  const directory = join(baseDirectory, 'workspace-a', '.yira')
  const file = join(directory, 'script-usage.json')
  await mkdir(directory, { recursive: true })

  await writeFile(file, '{ not json', 'utf8')
  assert.deepEqual(await store.read('workspace-a'), {})

  await writeFile(file, JSON.stringify({
    version: 1,
    scripts: {
      good: { runCount: 3, lastRunAt: '2026-01-01T00:00:00.000Z' },
      zero: { runCount: 0, lastRunAt: '2026-01-01T00:00:00.000Z' },
      fractional: { runCount: 1.5, lastRunAt: '2026-01-01T00:00:00.000Z' },
      badDate: { runCount: 1, lastRunAt: 'yesterday' },
      missing: { runCount: 1 },
    },
  }), 'utf8')
  assert.deepEqual(await store.read('workspace-a'), {
    good: { runCount: 3, lastRunAt: '2026-01-01T00:00:00.000Z' },
  })

  await store.record('workspace-a', 'good', new Date('2026-02-01T00:00:00.000Z'))
  const saved = JSON.parse(await readFile(file, 'utf8')) as { version: number }
  assert.equal(saved.version, 1)
})

test('keeps only the 500 most recently used scripts', async (context) => {
  const store = createWorkspaceScriptUsageStore(await createBaseDirectory(context))
  const start = Date.parse('2026-01-01T00:00:00.000Z')

  for (let index = 0; index < 501; index += 1) {
    await store.record('workspace-a', `custom:${index}`, new Date(start + index * 1000))
  }

  const usage = await store.read('workspace-a')
  assert.equal(Object.keys(usage).length, 500)
  assert.equal('custom:0' in usage, false)
  assert.equal('custom:500' in usage, true)
})
