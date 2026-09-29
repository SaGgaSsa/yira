import { promises as fs } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { GitFileDiffContent, WorkspaceGitDiffResult } from '@shared/types'
import { execGitCommand, resolveGitRootPath, type GitCommandExecutor } from './runner'

interface GitDiffRecord {
  additions: number
  deletions: number
  path: string
}

interface GitDiffTotals {
  additions: number
  deletions: number
}

const UNAVAILABLE_DIFF: WorkspaceGitDiffResult = {
  additions: 0,
  deletions: 0,
  available: false,
}

const MAX_FILE_DIFF_BYTES = 2 * 1024 * 1024

function validateDiffPath(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value || value.includes('\0') || value.startsWith('-') || isAbsolute(value)
    || /^[a-zA-Z]:/.test(value) || value.startsWith('/')
    || value.split(/[\\/]+/).some((segment) => segment === '..')) {
    throw new Error('Invalid file path')
  }
}

async function showGitFile(rootPath: string, revision: string, path: string, executor: GitCommandExecutor): Promise<Buffer> {
  try {
    const result = await runGitAtRoot(rootPath, ['show', `${revision}:${path}`], executor)
    return Buffer.from(result.stdout, 'utf8')
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    if (message.includes('maxbuffer') || message.includes('max buffer')) return Buffer.alloc(MAX_FILE_DIFF_BYTES + 1)
    if (/missing object|bad object|invalid object|does not exist|exists on disk, but not/.test(message)) return Buffer.alloc(0)
    throw error
  }
}

async function gitFileExists(rootPath: string, revision: string, path: string, executor: GitCommandExecutor): Promise<boolean> {
  try {
    await runGitAtRoot(rootPath, ['cat-file', '-e', `${revision}:${path}`], executor)
    return true
  } catch {
    return false
  }
}

async function readWorkingFile(rootPath: string, path: string): Promise<Buffer> {
  const root = await fs.realpath(rootPath)
  const target = resolve(root, ...path.split(/[\\/]+/))
  const rel = relative(root, target)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Invalid file path')
  try {
    const realTarget = await fs.realpath(target)
    const realRelative = relative(root, realTarget)
    if (realRelative.startsWith('..') || isAbsolute(realRelative)) throw new Error('Invalid file path')
    const stats = await fs.stat(realTarget)
    if (!stats.isFile()) return Buffer.alloc(0)
    if (stats.size > MAX_FILE_DIFF_BYTES) return Buffer.alloc(MAX_FILE_DIFF_BYTES + 1)
    return await fs.readFile(realTarget)
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid file path') throw error
    if (error && typeof error === 'object' && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return Buffer.alloc(0)
    throw error
  }
}

async function workingFileExists(rootPath: string, path: string): Promise<boolean> {
  try {
    const root = await fs.realpath(rootPath)
    const target = await fs.realpath(resolve(root, ...path.split(/[\\/]+/)))
    const rel = relative(root, target)
    return !(rel.startsWith('..') || isAbsolute(rel)) && (await fs.stat(target)).isFile()
  } catch {
    return false
  }
}

export async function getGitFileDiffContent(
  repositoryPath: string,
  input: { path: string; originalPath?: string; staged: boolean },
  executor: GitCommandExecutor = execGitCommand,
): Promise<GitFileDiffContent> {
  if (!input || typeof input.staged !== 'boolean') throw new Error('Invalid file diff request')
  validateDiffPath(input.path)
  const basePath = input.originalPath ?? input.path
  validateDiffPath(basePath)
  const rootPath = await resolveGitRootPath(repositoryPath)
  const [original, modified, modifiedExists] = input.staged
    ? await Promise.all([
        showGitFile(rootPath, 'HEAD', basePath, executor),
        showGitFile(rootPath, '', input.path, executor),
        gitFileExists(rootPath, '', input.path, executor),
      ])
    : await Promise.all([
        showGitFile(rootPath, '', basePath, executor),
        readWorkingFile(rootPath, input.path),
        workingFileExists(rootPath, input.path),
      ])
  if (original.length > MAX_FILE_DIFF_BYTES || modified.length > MAX_FILE_DIFF_BYTES) return { original: '', modified: '', modifiedExists, tooLarge: true }
  if (original.includes(0) || modified.includes(0)) return { original: '', modified: '', modifiedExists, binary: true }
  return { original: original.toString('utf8'), modified: modified.toString('utf8'), modifiedExists }
}

function runGitAtRoot(rootPath: string, args: string[], executor: GitCommandExecutor): Promise<{ stdout: string; stderr: string }> {
  return executor('git', ['-C', rootPath, ...args])
}

function parseLineCount(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined
  const count = Number(value)
  return Number.isSafeInteger(count) ? count : undefined
}

/**
 * Parse `git diff --numstat -z` without using path names as delimiters.
 *
 * With rename detection, Git emits one stats record followed by two NUL
 * separated paths. The stats record has an empty path field. Skipping those
 * path fields avoids counting a path that happens to look like numstat data.
 */
export function parseGitDiffNumstat(output: string): GitDiffRecord[] {
  const records = output.split('\0')
  const parsed: GitDiffRecord[] = []

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (!record) continue

    const firstTab = record.indexOf('\t')
    const secondTab = firstTab < 0 ? -1 : record.indexOf('\t', firstTab + 1)
    if (firstTab < 0 || secondTab < 0) continue

    const additionsText = record.slice(0, firstTab)
    const deletionsText = record.slice(firstTab + 1, secondTab)
    const additions = parseLineCount(additionsText)
    const deletions = parseLineCount(deletionsText)
    const path = record.slice(secondTab + 1)
    if (additions === undefined || deletions === undefined) {
      if (!path) {
        const renamedPath = records[index + 2]
        if (renamedPath) parsed.push({ additions: 0, deletions: 0, path: renamedPath })
        index += 2
      } else {
        // Binary entries use `-` for both counts. Keep their path so an
        // untracked replacement can be rejected as an ambiguous collision.
        parsed.push({ additions: 0, deletions: 0, path })
      }
      continue
    }
    if (!path) {
      // Rename/copy records have two path fields after the empty stats path.
      // They are not needed for totals, but must be consumed so a name that
      // resembles numstat cannot become a second record.
      const renamedPath = records[index + 2]
      if (renamedPath) parsed.push({ additions, deletions, path: renamedPath })
      index += 2
      continue
    }

    parsed.push({ additions, deletions, path })
  }

  return parsed
}

/** Parse a NUL-delimited list returned by `git ls-files --others`. */
export function parseGitUntrackedPaths(output: string): string[] {
  return output.split('\0').filter(Boolean)
}

function addTotals(target: GitDiffTotals, source: GitDiffTotals): void {
  target.additions += source.additions
  target.deletions += source.deletions
}

function countTextLines(contents: Buffer): number {
  if (contents.length === 0) return 0

  let lineCount = 0
  for (const byte of contents) {
    if (byte === 0x0a) lineCount += 1
  }
  if (contents[contents.length - 1] !== 0x0a) lineCount += 1
  return lineCount
}

function isBinaryContents(contents: Buffer): boolean {
  // Git's text/binary heuristic checks the beginning of the file. Keep the
  // same bounded check so a large binary file does not need special handling.
  return contents.subarray(0, 8_000).includes(0)
}

function isSafeRelativeGitPath(relativePath: string): boolean {
  return Boolean(relativePath)
    && !relativePath.includes('\0')
    && !isAbsolute(relativePath)
    && !relativePath.startsWith('/')
    && !relativePath.split('/').some((segment) => segment === '..')
}

interface ReadUntrackedResult {
  contents?: Buffer
  symlinkTarget?: string
}

async function readUntrackedPath(rootPath: string, relativePath: string): Promise<ReadUntrackedResult | undefined> {
  if (!isSafeRelativeGitPath(relativePath)) throw new Error('Git returned an invalid untracked path')

  const segments = relativePath.split('/')
  let currentPath = rootPath
  for (let index = 0; index < segments.length; index += 1) {
    currentPath = join(currentPath, segments[index])
    const stats = await fs.lstat(currentPath)
    if (stats.isSymbolicLink()) {
      // A symlink is itself one Git text entry. Never resolve it, including
      // when it points outside the repository.
      if (index !== segments.length - 1) return undefined
      return { symlinkTarget: await fs.readlink(currentPath) }
    }
    if (index < segments.length - 1 && !stats.isDirectory()) return undefined
    if (index === segments.length - 1 && !stats.isFile()) return undefined
  }

  return { contents: await fs.readFile(currentPath) }
}

async function getGitDiffAttribute(
  rootPath: string,
  relativePath: string,
  executor: GitCommandExecutor,
): Promise<string | undefined> {
  const result = await runGitAtRoot(rootPath, ['check-attr', '-z', 'diff', '--', relativePath], executor)
  const fields = result.stdout.split('\0')
  return fields[1] === 'diff' ? fields[2] : undefined
}

async function getUntrackedTotals(
  rootPath: string,
  relativePath: string,
  executor: GitCommandExecutor,
): Promise<GitDiffTotals> {
  const readResult = await readUntrackedPath(rootPath, relativePath)
  if (!readResult) return { additions: 0, deletions: 0 }

  const diffAttribute = await getGitDiffAttribute(rootPath, relativePath, executor)
  if (diffAttribute === 'unset') {
    return { additions: 0, deletions: 0 }
  }

  const contents = readResult.symlinkTarget === undefined
    ? readResult.contents
    : Buffer.from(readResult.symlinkTarget)
  if (!contents || (diffAttribute !== 'set' && isBinaryContents(contents))) {
    return { additions: 0, deletions: 0 }
  }
  return { additions: countTextLines(contents), deletions: 0 }
}

function emptyTotals(): GitDiffTotals {
  return { additions: 0, deletions: 0 }
}

async function resolveDiffBase(
  rootPath: string,
  executor: GitCommandExecutor,
): Promise<{ base: string } | undefined> {
  let head: string
  try {
    head = (await runGitAtRoot(rootPath, ['rev-parse', '--verify', 'HEAD'], executor)).stdout.trim()
  } catch {
    return undefined
  }
  if (!head) return undefined

  // A local branch without upstream is compared with the remote default
  // branch, so unpushed feature work still counts.
  for (const candidate of ['@{push}', '@{upstream}', 'refs/remotes/origin/HEAD']) {
    let reference: string
    try {
      reference = (await runGitAtRoot(rootPath, ['rev-parse', '--verify', candidate], executor)).stdout.trim()
    } catch {
      // Missing references are expected; try the next candidate.
      continue
    }
    if (!reference) continue

    try {
      const base = (await runGitAtRoot(rootPath, ['merge-base', 'HEAD', reference], executor)).stdout.trim()
      if (base) return { base }
    } catch {
      // Unrelated histories have no merge base; try the next candidate.
    }
  }

  // Without any remote reference, report only uncommitted changes.
  return { base: head }
}

/**
 * Return the net diff between the local push/upstream base and the worktree.
 * Branches without upstream use the remote default branch, and repositories
 * without remote references use HEAD. The result is unavailable without HEAD.
 */
export async function getGitDiffSummary(
  rootPathInput: string,
  executor: GitCommandExecutor = execGitCommand,
): Promise<WorkspaceGitDiffResult> {
  let rootPath: string
  try {
    rootPath = await resolveGitRootPath(rootPathInput)
  } catch {
    return { ...UNAVAILABLE_DIFF }
  }

  const baseResult = await resolveDiffBase(rootPath, executor)
  if (!baseResult) return { ...UNAVAILABLE_DIFF }

  try {
    const diff = await runGitAtRoot(rootPath, [
      'diff',
      '--numstat',
      '-z',
      '--find-renames',
      '--no-ext-diff',
      '--no-textconv',
      baseResult.base,
      '--',
    ], executor)
    const records = parseGitDiffNumstat(diff.stdout)
    const totals = emptyTotals()
    for (const record of records) {
      addTotals(totals, { additions: record.additions, deletions: record.deletions })
    }

    const untracked = await runGitAtRoot(rootPath, ['ls-files', '--others', '--exclude-standard', '-z', '--'], executor)
    for (const relativePath of parseGitUntrackedPaths(untracked.stdout)) {
      const collidesWithTrackedChange = records.some((record) => (
        record.path === relativePath
        || relativePath.startsWith(`${record.path}/`)
        || record.path.startsWith(`${relativePath}/`)
      ))
      if (collidesWithTrackedChange) return { ...UNAVAILABLE_DIFF }
      addTotals(totals, await getUntrackedTotals(rootPath, relativePath, executor))
    }

    return { ...totals, available: true }
  } catch {
    return { ...UNAVAILABLE_DIFF }
  }
}
