import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import type { Stats } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { readFile, readPreviewAsset, statFile, writeFile } from './file-access'
import { searchFiles } from './files'
import * as fileAccess from './file-access'

const TWO_MIB = 2 * 1024 * 1024
const TEN_MIB = 10 * 1024 * 1024

async function createWorkspace(): Promise<string> {
  return fs.mkdtemp(join(tmpdir(), 'yira-files-ipc-'))
}

async function removeWorkspace(path: string): Promise<void> {
  await fs.rm(path, { recursive: true, force: true })
}

async function writeSearchFile(rootPath: string, relativePath: string): Promise<void> {
  const filePath = join(rootPath, ...relativePath.split('/'))
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, relativePath, 'utf8')
}

async function makeSearchTree(): Promise<string> {
  const rootPath = await createWorkspace()
  await writeSearchFile(rootPath, 'README.md')
  await writeSearchFile(rootPath, 'src/Alpha.test.ts')
  await writeSearchFile(rootPath, 'src/beta.test.ts')
  await fs.mkdir(join(rootPath, 'src', 'match-directory.txt'), { recursive: true })
  await writeSearchFile(rootPath, 'src/match-directory.txt/inside.ts')
  return rootPath
}

test('recursively searches regular file names and sorts relative paths case-insensitively', async () => {
  const rootPath = await makeSearchTree()
  try {
    const result = await searchFiles(rootPath, '.*\\.test\\.ts')

    assert.deepEqual(result, {
      entries: [
        { name: 'Alpha.test.ts', relativePath: 'src/Alpha.test.ts' },
        { name: 'beta.test.ts', relativePath: 'src/beta.test.ts' },
      ],
    })
  } finally {
    await removeWorkspace(rootPath)
  }
})

test('matches regular-expression queries against workspace-relative paths', async () => {
  const rootPath = await makeSearchTree()
  try {
    const result = await searchFiles(rootPath, '^src/.*\\.test\\.ts$')

    assert.deepEqual(result.entries, [
      { name: 'Alpha.test.ts', relativePath: 'src/Alpha.test.ts' },
      { name: 'beta.test.ts', relativePath: 'src/beta.test.ts' },
    ])
  } finally {
    await removeWorkspace(rootPath)
  }
})

test('excludes hidden names and every ignored directory at every depth', async () => {
  const rootPath = await createWorkspace()
  const ignoredNames = ['.git', 'node_modules', 'dist', 'dist-electron', 'build', 'release', 'coverage', '.next', '.vite']
  try {
    await writeSearchFile(rootPath, 'visible/keep.ts')
    await writeSearchFile(rootPath, '.hidden/hidden.ts')
    await writeSearchFile(rootPath, 'visible/.hidden-nested.ts')
    await writeSearchFile(rootPath, '.hidden-root.ts')
    for (const name of ignoredNames) {
      await writeSearchFile(rootPath, `${name}/ignored.ts`)
    }
    await writeSearchFile(rootPath, 'visible/DIST/ignored-case.ts')

    const result = await searchFiles(rootPath, '.*\\.ts')

    assert.deepEqual(result.entries, [{ name: 'keep.ts', relativePath: 'visible/keep.ts' }])
  } finally {
    await removeWorkspace(rootPath)
  }
})

test('returns matching files only and does not follow file or directory symlinks', async () => {
  const rootPath = await createWorkspace()
  const outsidePath = await createWorkspace()
  try {
    await writeSearchFile(rootPath, 'inside/match.ts')
    await writeSearchFile(outsidePath, 'outside/match.ts')
    await fs.symlink(join(outsidePath, 'outside', 'match.ts'), join(rootPath, 'outside-file-match.ts'))
    await fs.symlink(join(outsidePath, 'outside'), join(rootPath, 'outside-directory-match'))
    await fs.mkdir(join(rootPath, 'real-directory-match.ts'), { recursive: true })

    const result = await searchFiles(rootPath, 'match')

    assert.deepEqual(result.entries, [{ name: 'match.ts', relativePath: 'inside/match.ts' }])
  } finally {
    await removeWorkspace(rootPath)
    await removeWorkspace(outsidePath)
  }
})

test('does not follow a directory replaced by a symlink during traversal', async () => {
  const rootPath = await createWorkspace()
  const outsidePath = await createWorkspace()
  const swappedPath = join(rootPath, 'swapped')
  const originalSwappedPath = join(rootPath, 'swapped-original')
  const originalLstat = fs.lstat
  const originalReaddir = fs.readdir
  let swapped = false
  let followedSwappedDirectory = false

  try {
    await writeSearchFile(rootPath, 'inside/match.ts')
    await writeSearchFile(rootPath, 'swapped/placeholder.txt')
    await writeSearchFile(outsidePath, 'outside/match.ts')

    fs.lstat = (async (path: string, ...args: unknown[]) => {
      const result = await originalLstat(path, ...(args as []))
      if (!swapped && path.endsWith('/swapped')) {
        swapped = true
        await fs.rename(swappedPath, originalSwappedPath)
        await fs.symlink(outsidePath, swappedPath)
      }
      return result
    }) as typeof fs.lstat
    fs.readdir = (async (path: string, options?: unknown) => {
      if (swapped && path === swappedPath) followedSwappedDirectory = true
      return originalReaddir(path, options as never)
    }) as typeof fs.readdir

    const result = await searchFiles(rootPath, 'match')

    assert.equal(followedSwappedDirectory, false)
    assert.deepEqual(result.entries, [{ name: 'match.ts', relativePath: 'inside/match.ts' }])
  } finally {
    fs.lstat = originalLstat
    fs.readdir = originalReaddir
    if (swapped) {
      await fs.rm(swappedPath, { recursive: true, force: true })
      await fs.rename(originalSwappedPath, swappedPath)
    }
    await removeWorkspace(rootPath)
    await removeWorkspace(outsidePath)
  }
})

test('rejects invalid queries and roots while keeping results inside the canonical root', async () => {
  const rootPath = await createWorkspace()
  const outsidePath = await createWorkspace()
  try {
    await writeSearchFile(rootPath, 'inside.ts')
    await writeSearchFile(outsidePath, 'outside.ts')
    await assert.rejects(searchFiles(rootPath, 'file.*('), /Invalid regular expression/i)
    await assert.rejects(searchFiles(join(rootPath, 'inside.ts'), '.*'), /not a directory/i)
    await assert.rejects(searchFiles(join(rootPath, 'missing-root'), '.*'), /unavailable/i)
    await fs.symlink(outsidePath, join(rootPath, 'external'))

    const result = await searchFiles(rootPath, '.*\\.ts')

    assert.deepEqual(result.entries, [{ name: 'inside.ts', relativePath: 'inside.ts' }])
  } finally {
    await removeWorkspace(rootPath)
    await removeWorkspace(outsidePath)
  }
})

test('rejects an unreadable root directory instead of treating it as an empty result', async () => {
  const rootPath = await createWorkspace()
  const originalOpen = fs.open
  try {
    fs.open = (async (path: string, ...args: unknown[]) => {
      if (path === rootPath) {
        const error = new Error('permission denied') as NodeJS.ErrnoException
        error.code = 'EACCES'
        throw error
      }
      return originalOpen(path, ...(args as []))
    }) as typeof fs.open

    await assert.rejects(searchFiles(rootPath, '.*'), /permission denied/i)
  } finally {
    fs.open = originalOpen
    await removeWorkspace(rootPath)
  }
})

test('tolerates inaccessible or disappearing child directories', async () => {
  const rootPath = await createWorkspace()
  const originalOpen = fs.open
  try {
    await writeSearchFile(rootPath, 'visible.ts')
    await writeSearchFile(rootPath, 'inaccessible/hidden.ts')
    await writeSearchFile(rootPath, 'missing/hidden.ts')
    fs.open = (async (path: string, ...args: unknown[]) => {
      if (path.endsWith('/inaccessible') || path.endsWith('/missing')) {
        const error = new Error(path.endsWith('/inaccessible') ? 'permission denied' : 'directory disappeared') as NodeJS.ErrnoException
        error.code = path.endsWith('/inaccessible') ? 'EACCES' : 'ENOENT'
        throw error
      }
      return originalOpen(path, ...(args as []))
    }) as typeof fs.open

    const result = await searchFiles(rootPath, '.*\\.ts')

    assert.deepEqual(result.entries, [{ name: 'visible.ts', relativePath: 'visible.ts' }])
  } finally {
    fs.open = originalOpen
    await removeWorkspace(rootPath)
  }
})

test('reads UTF-8 text with a SHA-256 revision', async () => {
  const rootPath = await createWorkspace()
  try {
    await fs.writeFile(join(rootPath, 'notes.txt'), 'Hello, Yira!\n', 'utf8')

    const result = await readFile(rootPath, 'notes.txt')

    assert.equal(result.status, 'ready')
    if (result.status !== 'ready') throw new Error('text file must be ready')
    assert.equal(result.content, 'Hello, Yira!\n')
    assert.equal(result.revision.size, 13)
    assert.equal(result.revision.sha256, createHash('sha256').update('Hello, Yira!\n').digest('hex'))
    assert.match(result.revision.modifiedAt, /^\d{4}-\d{2}-\d{2}T/)
    assert.match(result.revision.metadataToken, /^\d+:/)
  } finally {
    await removeWorkspace(rootPath)
  }
})

test('rejects invalid UTF-8 files', async () => {
  const rootPath = await createWorkspace()
  try {
    await fs.writeFile(join(rootPath, 'invalid.txt'), Buffer.from([0xc3, 0x28]))

    assert.deepEqual(await readFile(rootPath, 'invalid.txt'), {
      status: 'unsupported',
      reason: 'File content is not valid UTF-8 text',
    })
  } finally {
    await removeWorkspace(rootPath)
  }
})

test('rejects files larger than 2 MiB', async () => {
  const rootPath = await createWorkspace()
  try {
    await fs.writeFile(join(rootPath, 'large.txt'), 'a'.repeat(TWO_MIB + 1), 'utf8')

    assert.deepEqual(await readFile(rootPath, 'large.txt'), {
      status: 'unsupported',
      reason: 'Files larger than 2 MiB cannot be opened in the editor',
    })
  } finally {
    await removeWorkspace(rootPath)
  }
})

test('accepts files at the 2 MiB limit', async () => {
  const rootPath = await createWorkspace()
  try {
    await fs.writeFile(join(rootPath, 'limit.txt'), 'a'.repeat(TWO_MIB), 'utf8')

    const result = await readFile(rootPath, 'limit.txt')

    assert.equal(result.status, 'ready')
    if (result.status !== 'ready') throw new Error('limit file must be ready')
    assert.equal(result.content.length, TWO_MIB)
    assert.equal(result.revision.size, TWO_MIB)
  } finally {
    await removeWorkspace(rootPath)
  }
})

test('rejects binary files with NUL bytes or excessive control characters', async () => {
  const rootPath = await createWorkspace()
  try {
    await fs.writeFile(join(rootPath, 'nul.txt'), Buffer.from('hello\0world', 'utf8'))
    await fs.writeFile(join(rootPath, 'controls.txt'), Buffer.from(`${'a'.repeat(89)}${String.fromCharCode(1).repeat(11)}`, 'utf8'))

    assert.deepEqual(await readFile(rootPath, 'nul.txt'), {
      status: 'unsupported',
      reason: 'Binary files containing NUL bytes cannot be opened in the editor',
    })
    assert.deepEqual(await readFile(rootPath, 'controls.txt'), {
      status: 'unsupported',
      reason: 'Binary files cannot be opened in the editor',
    })
  } finally {
    await removeWorkspace(rootPath)
  }
})

test('rejects traversal, external symlinks, and missing files', async () => {
  const rootPath = await createWorkspace()
  const outsidePath = await createWorkspace()
  try {
    await fs.writeFile(join(outsidePath, 'outside.txt'), 'outside', 'utf8')
    await fs.symlink(join(outsidePath, 'outside.txt'), join(rootPath, 'outside-link.txt'))

    await assert.rejects(readFile(rootPath, '../outside.txt'), /traversal/i)
    await assert.rejects(readFile(rootPath, 'outside-link.txt'), /escapes/i)
    assert.deepEqual(await readFile(rootPath, 'missing.txt'), { status: 'missing' })
  } finally {
    await removeWorkspace(rootPath)
    await removeWorkspace(outsidePath)
  }
})

test('reads supported Markdown preview images with validated MIME types', async () => {
  const rootPath = await createWorkspace()
  const fixtures: Array<[string, string, Buffer]> = [
    ['image.png', 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['image.jpg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xdb])],
    ['image.gif', 'image/gif', Buffer.from('GIF89a', 'ascii')],
    ['image.webp', 'image/webp', Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.alloc(4), Buffer.from('WEBP', 'ascii')])],
    ['image.avif', 'image/avif', Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif', 'ascii')])],
    ['sequence.avif', 'image/avif', Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavis', 'ascii')])],
  ]
  try {
    for (const [name, mimeType, content] of fixtures) {
      await fs.writeFile(join(rootPath, name), content)
      const result = await readPreviewAsset(rootPath, name)
      assert.equal(result.status, 'ready')
      if (result.status !== 'ready') throw new Error(`${name} must be ready`)
      assert.equal(result.mimeType, mimeType)
      assert.equal(result.dataBase64, content.toString('base64'))
    }
  } finally {
    await removeWorkspace(rootPath)
  }
})

test('rejects unsupported, oversized, spoofed, missing, and unsafe preview images', async () => {
  const rootPath = await createWorkspace()
  const outsidePath = await createWorkspace()
  try {
    await fs.writeFile(join(rootPath, 'vector.svg'), '<svg/>', 'utf8')
    await fs.writeFile(join(rootPath, 'spoofed.png'), '<html>unsafe</html>', 'utf8')
    await fs.writeFile(join(rootPath, 'large.png'), Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(TEN_MIB),
    ]))
    await fs.writeFile(join(outsidePath, 'outside.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    await fs.symlink(join(outsidePath, 'outside.png'), join(rootPath, 'outside-link.png'))

    assert.equal((await readPreviewAsset(rootPath, 'vector.svg')).status, 'unsupported')
    assert.equal((await readPreviewAsset(rootPath, 'spoofed.png')).status, 'unsupported')
    assert.equal((await readPreviewAsset(rootPath, 'large.png')).status, 'unsupported')
    assert.deepEqual(await readPreviewAsset(rootPath, 'missing.png'), { status: 'missing' })
    await assert.rejects(readPreviewAsset(rootPath, '../outside.png'), /traversal/i)
    await assert.rejects(readPreviewAsset(rootPath, 'outside-link.png'), /escapes/i)
  } finally {
    await removeWorkspace(rootPath)
    await removeWorkspace(outsidePath)
  }
})

test('stats a readable file without returning its content', async () => {
  const rootPath = await createWorkspace()
  try {
    await fs.writeFile(join(rootPath, 'notes.txt'), 'stat me', 'utf8')

    const result = await statFile(rootPath, 'notes.txt')

    assert.equal(result.status, 'available')
    if (result.status !== 'available') throw new Error('existing file must be available')
    assert.equal(result.revision.size, 7)
    assert.equal(result.revision.sha256, createHash('sha256').update('stat me').digest('hex'))
    assert.equal('content' in result, false)
  } finally {
    await removeWorkspace(rootPath)
  }
})

test('writes text when the supplied revision matches', async () => {
  const rootPath = await createWorkspace()
  try {
    await fs.writeFile(join(rootPath, 'notes.txt'), 'before', 'utf8')
    const current = await readFile(rootPath, 'notes.txt')
    assert.equal(current.status, 'ready')
    if (current.status !== 'ready') throw new Error('existing file must be ready')

    const result = await writeFile(rootPath, 'notes.txt', {
      content: 'after',
      expectedVersion: current.revision.sha256,
    })

    assert.equal(result.status, 'saved')
    if (result.status !== 'saved') throw new Error('matching write must save')
    assert.equal(await fs.readFile(join(rootPath, 'notes.txt'), 'utf8'), 'after')
    assert.equal(result.revision.sha256, createHash('sha256').update('after').digest('hex'))
  } finally {
    await removeWorkspace(rootPath)
  }
})

test('rejects a write when the file revision conflicts', async () => {
  const rootPath = await createWorkspace()
  try {
    await fs.writeFile(join(rootPath, 'notes.txt'), 'before', 'utf8')
    const current = await readFile(rootPath, 'notes.txt')
    assert.equal(current.status, 'ready')
    if (current.status !== 'ready') throw new Error('existing file must be ready')
    await fs.writeFile(join(rootPath, 'notes.txt'), 'external change', 'utf8')

    const result = await writeFile(rootPath, 'notes.txt', {
      content: 'my change',
      expectedVersion: current.revision.sha256,
    })
    assert.equal(result.status, 'conflict')
    if (result.status !== 'conflict') throw new Error('changed file must conflict')
    assert.equal(result.revision.sha256, createHash('sha256').update('external change').digest('hex'))
    assert.equal(await fs.readFile(join(rootPath, 'notes.txt'), 'utf8'), 'external change')
  } finally {
    await removeWorkspace(rootPath)
  }
})

test('overwrites a conflicting revision only when force is explicitly true', async () => {
  const rootPath = await createWorkspace()
  try {
    await fs.writeFile(join(rootPath, 'notes.txt'), 'before', 'utf8')
    const current = await readFile(rootPath, 'notes.txt')
    assert.equal(current.status, 'ready')
    if (current.status !== 'ready') throw new Error('existing file must be ready')
    await fs.writeFile(join(rootPath, 'notes.txt'), 'external change', 'utf8')

    const result = await writeFile(rootPath, 'notes.txt', {
      content: 'forced change',
      expectedVersion: current.revision.sha256,
      force: true,
    })

    assert.equal(result.status, 'saved')
    assert.equal(await fs.readFile(join(rootPath, 'notes.txt'), 'utf8'), 'forced change')
  } finally {
    await removeWorkspace(rootPath)
  }
})

test('does not treat a truthy force value as an overwrite request', async () => {
  const rootPath = await createWorkspace()
  try {
    await fs.writeFile(join(rootPath, 'notes.txt'), 'before', 'utf8')
    const current = await readFile(rootPath, 'notes.txt')
    assert.equal(current.status, 'ready')
    if (current.status !== 'ready') throw new Error('existing file must be ready')
    await fs.writeFile(join(rootPath, 'notes.txt'), 'external change', 'utf8')

    const result = await writeFile(rootPath, 'notes.txt', {
      content: 'unsafe overwrite',
      expectedVersion: current.revision.sha256,
      force: 'true' as unknown as boolean,
    })
    assert.equal(result.status, 'conflict')
    assert.equal(await fs.readFile(join(rootPath, 'notes.txt'), 'utf8'), 'external change')
  } finally {
    await removeWorkspace(rootPath)
  }
})

test('returns missing statuses for stat and write requests', async () => {
  const rootPath = await createWorkspace()
  try {
    assert.deepEqual(await statFile(rootPath, 'missing.txt'), { status: 'missing' })
    assert.deepEqual(await writeFile(rootPath, 'missing.txt', {
      content: 'new content',
      expectedVersion: 'missing-version',
    }), { status: 'missing' })
  } finally {
    await removeWorkspace(rootPath)
  }
})

test('does not write through an external symlink', async () => {
  const rootPath = await createWorkspace()
  const outsidePath = await createWorkspace()
  try {
    const outsideFile = join(outsidePath, 'outside.txt')
    await fs.writeFile(outsideFile, 'outside', 'utf8')
    await fs.symlink(outsideFile, join(rootPath, 'outside-link.txt'))

    await assert.rejects(writeFile(rootPath, 'outside-link.txt', {
      content: 'unsafe overwrite',
      expectedVersion: createHash('sha256').update('outside').digest('hex'),
      force: true,
    }), /escapes/i)
    assert.equal(await fs.readFile(outsideFile, 'utf8'), 'outside')
  } finally {
    await removeWorkspace(rootPath)
    await removeWorkspace(outsidePath)
  }
})

test('reports a changed file with a new metadata token and coherent revision', async () => {
  const rootPath = await createWorkspace()
  try {
    await fs.writeFile(join(rootPath, 'notes.txt'), 'first', 'utf8')
    const first = await statFile(rootPath, 'notes.txt')
    assert.equal(first.status, 'available')
    if (first.status !== 'available') throw new Error('first file stat must be available')

    await fs.writeFile(join(rootPath, 'notes.txt'), 'second version', 'utf8')
    const second = await statFile(rootPath, 'notes.txt')
    assert.equal(second.status, 'available')
    if (second.status !== 'available') throw new Error('second file stat must be available')

    assert.notEqual(second.revision.metadataToken, first.revision.metadataToken)
    assert.equal(second.revision.size, 14)
    assert.equal(second.revision.sha256, createHash('sha256').update('second version').digest('hex'))
  } finally {
    await removeWorkspace(rootPath)
  }
})

test('stats an existing file larger than the editor read limit', async () => {
  const rootPath = await createWorkspace()
  try {
    const content = 'a'.repeat(TWO_MIB + 1)
    await fs.writeFile(join(rootPath, 'large.txt'), content, 'utf8')

    const result = await statFile(rootPath, 'large.txt')

    assert.equal(result.status, 'available')
    if (result.status !== 'available') throw new Error('large existing file must be available to stat')
    assert.equal(result.revision.size, TWO_MIB + 1)
    assert.equal(result.revision.sha256, createHash('sha256').update(content).digest('hex'))
  } finally {
    await removeWorkspace(rootPath)
  }
})

test('writes every byte when the file handle accepts partial writes', async () => {
  const chunks: Buffer[] = []
  const writeAll = (fileAccess as {
    writeAll?: (handle: { write: FileHandle['write'] }, content: Buffer) => Promise<void>
  }).writeAll
  if (!writeAll) throw new Error('writeAll helper must be exported')

  const partialWriter = {
    write: async (buffer: Buffer, offset: number, length: number) => {
      const bytesWritten = Math.min(2, length)
      chunks.push(buffer.subarray(offset, offset + bytesWritten))
      return { bytesWritten, buffer }
    },
  }

  await writeAll(partialWriter as unknown as { write: FileHandle['write'] }, Buffer.from('complete content', 'utf8'))

  assert.equal(Buffer.concat(chunks).toString('utf8'), 'complete content')
})

test('hashes a descriptor incrementally without buffering the full file', async () => {
  const content = Buffer.from('incremental hashing must process each bounded chunk', 'utf8')
  const readPositions: number[] = []
  const stat = {
    dev: 1,
    ino: 2,
    size: content.byteLength,
    mtimeMs: 10,
    ctimeMs: 11,
    mtime: new Date(10),
    isFile: () => true,
  } as Stats
  const readRevisionIncrementally = (fileAccess as {
    readRevisionIncrementally?: (handle: Pick<FileHandle, 'read' | 'stat'>, chunkSize?: number) => Promise<{ sha256: string; size: number }>
  }).readRevisionIncrementally
  if (!readRevisionIncrementally) throw new Error('incremental revision helper must be exported')

  const revision = await readRevisionIncrementally({
    stat: async () => stat,
    read: async (buffer: Buffer, offset: number, length: number, position: number) => {
      readPositions.push(position)
      const bytesRead = content.copy(buffer, offset, position, position + length)
      return { bytesRead, buffer }
    },
  } as unknown as Pick<FileHandle, 'read' | 'stat'>, 5)

  assert.equal(revision.size, content.byteLength)
  assert.equal(revision.sha256, createHash('sha256').update(content).digest('hex'))
  assert.deepEqual(readPositions, [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50])
})
