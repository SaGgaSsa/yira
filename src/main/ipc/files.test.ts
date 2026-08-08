import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import type { Stats } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { readFile, statFile, writeFile } from './file-access'
import * as fileAccess from './file-access'

const TWO_MIB = 2 * 1024 * 1024

async function createWorkspace(): Promise<string> {
  return fs.mkdtemp(join(tmpdir(), 'yira-files-ipc-'))
}

async function removeWorkspace(path: string): Promise<void> {
  await fs.rm(path, { recursive: true, force: true })
}

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
