import assert from 'node:assert/strict'
import { rm, stat } from 'node:fs/promises'
import test from 'node:test'

import { createDevDataDirectory } from './dev-workspace.mjs'

test('creates an isolated temporary data directory for development', async () => {
  const { dataDirectory, temporary } = await createDevDataDirectory({})

  try {
    assert.equal(temporary, true)
    assert.ok((await stat(dataDirectory)).isDirectory())
  } finally {
    await rm(dataDirectory, { recursive: true, force: true })
  }
})

test('uses an explicitly requested development data directory without treating it as temporary', async () => {
  const { dataDirectory, temporary } = await createDevDataDirectory({ YIRA_DEV_DATA_DIR: '/tmp/yira-dev-data-test' })

  try {
    assert.equal(dataDirectory, '/tmp/yira-dev-data-test')
    assert.equal(temporary, false)
    assert.ok((await stat(dataDirectory)).isDirectory())
  } finally {
    await rm(dataDirectory, { recursive: true, force: true })
  }
})
