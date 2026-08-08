import { createHash } from 'crypto'
import { constants as fsConstants, promises as fs } from 'fs'
import type { Stats } from 'fs'
import type { FileHandle } from 'fs/promises'
import { isAbsolute, relative, resolve } from 'path'
import type { FileReadResult, FileRevision, FileStatResult, FileWriteInput, FileWriteResult } from '@shared/types'

export const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024

export interface ResolvedRootTarget {
  rootPath: string
  targetPath: string
  relativePath: string
}

class MissingFileError extends Error {}

class UnsupportedFileError extends Error {}

function normalizeForCompare(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path
}

function isInsidePath(rootPath: string, targetPath: string): boolean {
  const relativePath = relative(rootPath, targetPath)
  return relativePath === '' || (
    !relativePath.startsWith('..') &&
    !isAbsolute(relativePath)
  )
}

function isMissingError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

function hasTraversalSegment(relativePath: string): boolean {
  return relativePath.split(/[\\/]+/).some((segment) => segment === '..')
}

export async function resolveRootTarget(
  rootPathInput: string,
  relativePath: string,
): Promise<ResolvedRootTarget> {
  if (typeof rootPathInput !== 'string' || !rootPathInput.trim()) {
    throw new Error('Files folder is required')
  }
  if (typeof relativePath !== 'string') {
    throw new Error('Relative path must be a string')
  }
  if (relativePath.includes('\0')) {
    throw new Error('Invalid path')
  }
  if (isAbsolute(relativePath)) {
    throw new Error('Path must be relative to the files folder')
  }
  if (hasTraversalSegment(relativePath)) {
    throw new Error('Path traversal is not allowed')
  }

  let rootPath: string
  try {
    rootPath = await fs.realpath(rootPathInput)
  } catch {
    throw new Error('Files folder is unavailable')
  }

  const rootStat = await fs.stat(rootPath)
  if (!rootStat.isDirectory()) {
    throw new Error('Files folder is not a directory')
  }

  const rootResolved = resolve(rootPath)
  const targetPath = resolve(rootResolved, relativePath || '.')
  if (!isInsidePath(normalizeForCompare(rootResolved), normalizeForCompare(targetPath))) {
    throw new Error('Path escapes the files folder')
  }

  let targetRealPath: string
  try {
    targetRealPath = await fs.realpath(targetPath)
  } catch (error) {
    if (isMissingError(error)) throw new MissingFileError('Path does not exist')
    throw error
  }
  if (!isInsidePath(normalizeForCompare(rootResolved), normalizeForCompare(targetRealPath))) {
    throw new Error('Path escapes the files folder')
  }

  return {
    rootPath: rootResolved,
    targetPath: targetRealPath,
    relativePath: relative(rootResolved, targetRealPath).split(/[/\\]+/).join('/'),
  }
}

function textFromBuffer(buffer: Buffer): string {
  if (buffer.byteLength > MAX_TEXT_FILE_BYTES) {
    throw new UnsupportedFileError('Files larger than 2 MiB cannot be opened in the editor')
  }
  if (buffer.includes(0)) {
    throw new UnsupportedFileError('Binary files containing NUL bytes cannot be opened in the editor')
  }

  let content: string
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw new UnsupportedFileError('File content is not valid UTF-8 text')
  }

  const characters = Array.from(content)
  const nonTextControls = characters.filter((character) => {
    const code = character.codePointAt(0) ?? 0
    return (code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || (code >= 127 && code <= 159)
  }).length
  if (characters.length > 0 && nonTextControls / characters.length > 0.1) {
    throw new UnsupportedFileError('Binary files cannot be opened in the editor')
  }

  return content
}

function metadataTokenFor(stat: Stats): string {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':')
}

function revisionForDigest(size: number, stat: Stats, sha256: string): FileRevision {
  return {
    size,
    modifiedAt: stat.mtime.toISOString(),
    metadataToken: metadataTokenFor(stat),
    sha256,
  }
}

function revisionFor(buffer: Buffer, stat: Stats): FileRevision {
  return revisionForDigest(
    buffer.byteLength,
    stat,
    createHash('sha256').update(buffer).digest('hex'),
  )
}

function sameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

async function validateDescriptorPath(handle: FileHandle, resolved: ResolvedRootTarget): Promise<void> {
  const descriptorDirectory = process.platform === 'linux'
    ? '/proc/self/fd'
    : process.platform === 'darwin'
      ? '/dev/fd'
      : null

  if (descriptorDirectory) {
    const descriptorTarget = await fs.realpath(`${descriptorDirectory}/${handle.fd}`)
    if (!isInsidePath(normalizeForCompare(resolved.rootPath), normalizeForCompare(descriptorTarget))) {
      throw new Error('Path escapes the files folder')
    }
    return
  }

  const descriptorStat = await handle.stat()
  const currentTarget = await fs.realpath(resolved.targetPath)
  if (!isInsidePath(normalizeForCompare(resolved.rootPath), normalizeForCompare(currentTarget))) {
    throw new Error('Path escapes the files folder')
  }
  const currentStat = await fs.stat(currentTarget)
  if (!sameFile(descriptorStat, currentStat)) {
    throw new Error('Path changed while opening')
  }
}

async function openValidatedFile(
  rootPath: string,
  relativePath: string,
  flags: number,
): Promise<{ handle: FileHandle; resolved: ResolvedRootTarget }> {
  const resolved = await resolveRootTarget(rootPath, relativePath)
  let handle: FileHandle
  try {
    handle = await fs.open(resolved.targetPath, flags | fsConstants.O_NOFOLLOW)
  } catch (error) {
    if (isMissingError(error)) throw new MissingFileError('Path does not exist')
    if ((error as NodeJS.ErrnoException | undefined)?.code === 'ELOOP') {
      throw new Error('Path escapes the files folder')
    }
    throw error
  }

  try {
    await validateDescriptorPath(handle, resolved)
    const stat = await handle.stat()
    if (!stat.isFile()) throw new UnsupportedFileError('Path is not a file')
    return { handle, resolved }
  } catch (error) {
    await handle.close()
    throw error
  }
}

async function readSnapshot(
  handle: FileHandle,
  options: { enforceEditorSizeLimit?: boolean } = {},
): Promise<{ buffer: Buffer; revision: FileRevision }> {
  const before = await handle.stat()
  if (!before.isFile()) throw new UnsupportedFileError('Path is not a file')
  if (options.enforceEditorSizeLimit && before.size > MAX_TEXT_FILE_BYTES) {
    throw new UnsupportedFileError('Files larger than 2 MiB cannot be opened in the editor')
  }

  const buffer = await handle.readFile()
  const after = await handle.stat()
  if (metadataTokenFor(before) !== metadataTokenFor(after) || buffer.byteLength !== after.size) {
    throw new UnsupportedFileError('File changed while being read')
  }

  return { buffer, revision: revisionFor(buffer, after) }
}

async function readTarget(
  rootPath: string,
  relativePath: string,
  options?: { enforceEditorSizeLimit?: boolean },
): Promise<{ buffer: Buffer; revision: FileRevision }> {
  const { handle } = await openValidatedFile(rootPath, relativePath, fsConstants.O_RDONLY)
  try {
    return await readSnapshot(handle, options)
  } finally {
    await handle.close()
  }
}

export async function readFile(rootPath: string, relativePath: string): Promise<FileReadResult> {
  try {
    const { buffer, revision } = await readTarget(rootPath, relativePath, { enforceEditorSizeLimit: true })
    return { status: 'ready', content: textFromBuffer(buffer), revision }
  } catch (error) {
    if (error instanceof MissingFileError) return { status: 'missing' }
    if (error instanceof UnsupportedFileError) return { status: 'unsupported', reason: error.message }
    throw error
  }
}

export async function statFile(rootPath: string, relativePath: string): Promise<FileStatResult> {
  try {
    const { handle } = await openValidatedFile(rootPath, relativePath, fsConstants.O_RDONLY)
    let revision: FileRevision
    try {
      revision = await readRevisionIncrementally(handle)
    } finally {
      await handle.close()
    }
    return { status: 'available', revision }
  } catch (error) {
    if (error instanceof MissingFileError) return { status: 'missing' }
    throw error
  }
}

export async function readRevisionIncrementally(
  handle: Pick<FileHandle, 'read' | 'stat'>,
  chunkSize = 64 * 1024,
): Promise<FileRevision> {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('Incremental hash chunk size must be a positive integer')
  }

  const before = await handle.stat()
  if (!before.isFile()) throw new UnsupportedFileError('Path is not a file')

  const hash = createHash('sha256')
  let position = 0
  while (position < before.size) {
    const length = Math.min(chunkSize, before.size - position)
    const buffer = Buffer.allocUnsafe(length)
    const { bytesRead } = await handle.read(buffer, 0, length, position)
    if (bytesRead <= 0) throw new UnsupportedFileError('File ended while being hashed')
    hash.update(buffer.subarray(0, bytesRead))
    position += bytesRead
  }

  const after = await handle.stat()
  if (metadataTokenFor(before) !== metadataTokenFor(after) || position !== after.size) {
    throw new UnsupportedFileError('File changed while being hashed')
  }

  return revisionForDigest(after.size, after, hash.digest('hex'))
}

export async function writeAll(
  handle: Pick<FileHandle, 'write'>,
  content: Buffer,
): Promise<void> {
  let offset = 0
  while (offset < content.byteLength) {
    const { bytesWritten } = await handle.write(
      content,
      offset,
      content.byteLength - offset,
      offset,
    )
    if (bytesWritten <= 0) throw new Error('File write made no progress')
    offset += bytesWritten
  }
}

async function readExactBytes(handle: Pick<FileHandle, 'read'>, size: number): Promise<Buffer> {
  const buffer = Buffer.alloc(size)
  let offset = 0
  while (offset < size) {
    const { bytesRead } = await handle.read(buffer, offset, size - offset, offset)
    if (bytesRead <= 0) throw new Error('File ended before all persisted bytes could be read')
    offset += bytesRead
  }
  return buffer
}

export async function writeFile(
  rootPath: string,
  relativePath: string,
  input: FileWriteInput,
): Promise<FileWriteResult> {
  if (!input || typeof input.content !== 'string' || typeof input.expectedVersion !== 'string') {
    throw new Error('File content and expected version are required')
  }

  const contentBuffer = Buffer.from(input.content, 'utf8')
  textFromBuffer(contentBuffer)

  let opened: { handle: FileHandle; resolved: ResolvedRootTarget }
  try {
    opened = await openValidatedFile(rootPath, relativePath, fsConstants.O_RDWR)
  } catch (error) {
    if (error instanceof MissingFileError) return { status: 'missing' }
    throw error
  }

  try {
    const current = await readSnapshot(opened.handle)
    textFromBuffer(current.buffer)
    if (input.force !== true && input.expectedVersion !== current.revision.sha256) {
      return { status: 'conflict', revision: current.revision }
    }

    const beforeWrite = await opened.handle.stat()
    if (metadataTokenFor(beforeWrite) !== current.revision.metadataToken) {
      return { status: 'conflict', revision: current.revision }
    }

    await opened.handle.truncate(0)
    await writeAll(opened.handle, contentBuffer)
    await opened.handle.sync()
    const writtenStat = await opened.handle.stat()
    if (writtenStat.size !== contentBuffer.byteLength) {
      throw new Error('File write did not persist the complete content')
    }
    const persisted = await readExactBytes(opened.handle, writtenStat.size)
    const verifiedStat = await opened.handle.stat()
    if (metadataTokenFor(writtenStat) !== metadataTokenFor(verifiedStat) || !persisted.equals(contentBuffer)) {
      throw new Error('File changed while writing')
    }
    return { status: 'saved', revision: revisionFor(persisted, verifiedStat) }
  } finally {
    await opened.handle.close()
  }
}
