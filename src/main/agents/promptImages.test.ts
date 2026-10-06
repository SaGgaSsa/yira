import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import {
  appendAgentPromptImages,
  getAgentPromptImageDirectory,
  normalizeAgentPromptImagePaths,
  saveAgentPromptImage,
} from './promptImages'

test('saves prompt images in the target directory with the matching extension', async (t) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'yira-prompt-image-'))
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))

  const directory = getAgentPromptImageDirectory(temporaryDirectory)
  const png = await saveAgentPromptImage(directory, {
    mimeType: 'image/png',
    data: new Uint8Array([1, 2, 3]),
  })
  const jpeg = await saveAgentPromptImage(directory, {
    mimeType: 'image/jpeg',
    data: new Uint8Array([4, 5, 6]).buffer,
  })

  assert.equal(dirname(png.path), resolve(directory))
  assert.match(basename(png.path), /^[0-9a-f-]{36}\.png$/i)
  assert.deepEqual(await readFile(png.path), Buffer.from([1, 2, 3]))
  assert.equal(dirname(jpeg.path), resolve(directory))
  assert.match(basename(jpeg.path), /^[0-9a-f-]{36}\.jpg$/i)
})

test('rejects unsupported, empty, and oversized prompt images', async (t) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'yira-prompt-image-'))
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))

  const directory = join(temporaryDirectory, 'images')
  const invalidInputs: unknown[] = [
    { mimeType: 'image/bmp', data: new Uint8Array([1]) },
    { mimeType: 'image/png', data: new Uint8Array(0) },
    { mimeType: 'image/png', data: new Uint8Array(10 * 1024 * 1024 + 1) },
  ]

  for (const input of invalidInputs) {
    await assert.rejects(
      () => saveAgentPromptImage(directory, input),
      /Invalid agent prompt image/,
    )
  }
})

test('removes prompt image files older than seven days before saving', async (t) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'yira-prompt-image-'))
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))

  const directory = join(temporaryDirectory, 'images')
  await mkdir(directory)
  const oldPath = join(directory, 'old.png')
  const recentPath = join(directory, 'recent.png')
  const nestedDirectory = join(directory, 'nested')
  await writeFile(oldPath, 'old')
  await writeFile(recentPath, 'recent')
  await mkdir(nestedDirectory)

  const now = Date.now()
  const oldTime = now - 8 * 24 * 60 * 60 * 1000
  await utimes(oldPath, oldTime / 1000, oldTime / 1000)

  await saveAgentPromptImage(directory, {
    mimeType: 'image/webp',
    data: new Uint8Array([7]),
  }, now)

  await assert.rejects(stat(oldPath))
  assert.equal((await stat(recentPath)).isFile(), true)
  assert.equal((await stat(nestedDirectory)).isDirectory(), true)
})

test('normalizes image paths, rejects unsafe paths, and removes duplicates', async (t) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'yira-prompt-image-'))
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))

  const directory = join(temporaryDirectory, 'images')
  const firstPath = join(directory, '00000000-0000-4000-8000-000000000001.png')
  const secondPath = join(directory, '00000000-0000-4000-8000-000000000002.webp')

  assert.deepEqual(normalizeAgentPromptImagePaths(directory, undefined), [])
  assert.deepEqual(normalizeAgentPromptImagePaths(directory, [firstPath, secondPath, firstPath]), [
    resolve(firstPath),
    resolve(secondPath),
  ])

  const invalidValues: unknown[] = [
    join(temporaryDirectory, basename(firstPath)),
    join(directory, 'not-a-uuid.png'),
    join(directory, '..', basename(firstPath)),
    [firstPath, 1],
    Array.from({ length: 11 }, (_, index) => join(
      directory,
      '00000000-0000-4000-8000-' + index.toString(16).padStart(12, '0') + '.png',
    )),
  ]

  for (const value of invalidValues) {
    assert.throws(
      () => normalizeAgentPromptImagePaths(directory, value),
      /Invalid agent prompt images/,
    )
  }
})

test('appends image paths after a trimmed prompt or as a standalone block', () => {
  const imagePaths = ['C:\\images\\first.png', 'C:\\images\\second.jpg']
  assert.equal(appendAgentPromptImages(undefined, []), undefined)
  assert.equal(appendAgentPromptImages('  keep this  ', []), '  keep this  ')
  assert.equal(
    appendAgentPromptImages('  Review these files  ', imagePaths),
    'Review these files\n\nAttached images:\n- C:\\images\\first.png\n- C:\\images\\second.jpg',
  )
  assert.equal(
    appendAgentPromptImages(' \n\t ', imagePaths),
    'Attached images:\n- C:\\images\\first.png\n- C:\\images\\second.jpg',
  )
})
