import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  createDevDataDirectory,
  getDefaultDevDataDirectory,
  seedDevDataDirectory,
} from './dev-workspace.mjs'

test('uses a persistent isolated data directory for default development data', () => {
  assert.equal(getDefaultDevDataDirectory('/home/alice'), '/home/alice/.yira-dev')
})

test('uses an explicitly requested development data directory without treating it as temporary', async () => {
  const rootDirectory = await mkdtemp(join(tmpdir(), 'yira-dev-data-test-'))
  const configuredDirectory = join(rootDirectory, 'configured')

  try {
    const { dataDirectory, temporary } = await createDevDataDirectory({ YIRA_DEV_DATA_DIR: configuredDirectory })

    assert.equal(dataDirectory, configuredDirectory)
    assert.equal(temporary, false)
    assert.ok((await stat(dataDirectory)).isDirectory())
  } finally {
    await rm(rootDirectory, { recursive: true, force: true })
  }
})

test('seeds persistent development data once with three example workspaces', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'yira-dev-seed-'))
  const configPath = join(dataDirectory, 'config.json')

  try {
    await seedDevDataDirectory(dataDirectory)

    const config = JSON.parse(await readFile(configPath, 'utf8'))
    assert.deepEqual(
      config.workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name, type: workspace.config.type })),
      [
        { id: 'dev-development', name: 'Desarrollo', type: 'canvas' },
        { id: 'dev-quick-tasks', name: 'Tareas rápidas', type: 'grid' },
        { id: 'dev-research', name: 'Investigación', type: 'canvas' },
      ],
    )
    assert.equal(config.activeWorkspaceId, 'dev-development')
    await stat(join(dataDirectory, 'workspaces', 'dev-development', '.yira', 'canvas-state.json'))
    await stat(join(dataDirectory, 'workspaces', 'dev-quick-tasks', '.yira', 'grid-state.json'))
    await stat(join(dataDirectory, 'workspaces', 'dev-research', '.yira', 'canvas-state.json'))

    const customizedConfig = '{"workspaces":[],"activeWorkspaceId":"","settings":{}}'
    await writeFile(configPath, customizedConfig)
    await seedDevDataDirectory(dataDirectory)

    assert.equal(await readFile(configPath, 'utf8'), customizedConfig)
  } finally {
    await rm(dataDirectory, { recursive: true, force: true })
  }
})
