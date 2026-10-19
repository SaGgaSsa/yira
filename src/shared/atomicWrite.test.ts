import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFileAtomic } from './atomicWrite'

async function createTemporaryDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'yira-atomic-write-'))
}

test('writes the file and removes the temporary file', async () => {
  const directory = await createTemporaryDirectory()
  try {
    const path = join(directory, 'state.json')
    await writeFileAtomic(path, '{"value":1}')

    assert.equal(await readFile(path, 'utf8'), '{"value":1}')
    assert.deepEqual(await readdir(directory), ['state.json'])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('overwrites existing content', async () => {
  const directory = await createTemporaryDirectory()
  try {
    const path = join(directory, 'state.json')
    await writeFileAtomic(path, 'initial')
    await writeFileAtomic(path, 'replacement')

    assert.equal(await readFile(path, 'utf8'), 'replacement')
    assert.deepEqual(await readdir(directory), ['state.json'])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('uses unique temporary names for concurrent writes', async () => {
  const directory = await createTemporaryDirectory()
  try {
    const payloads = ['first', 'second', 'third', 'fourth']
    const paths = payloads.map((_, index) => join(directory, `state-${index}.json`))

    await Promise.all(paths.map((path, index) => writeFileAtomic(path, payloads[index])))

    const contents = await Promise.all(paths.map((path) => readFile(path, 'utf8')))
    assert.deepEqual(contents, payloads)
    assert.deepEqual(
      (await readdir(directory)).sort(),
      ['state-0.json', 'state-1.json', 'state-2.json', 'state-3.json'],
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('removes the temporary file when the rename fails', async () => {
  const directory = await createTemporaryDirectory()
  try {
    const target = join(directory, 'target')
    await mkdir(target)

    await assert.rejects(writeFileAtomic(target, 'content'))
    assert.deepEqual(await readdir(directory), ['target'])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
