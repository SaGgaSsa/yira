import { promises as fs } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { GitRepository } from '@shared/types'
import { normalizeSourceControlRepositoryPaths } from '@shared/workspaceConfig'
import { execGitCommand } from './runner'

const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'dist-electron',
  'build',
  'release',
  'coverage',
  '.next',
  '.vite',
])

interface ResolvedGitRepository {
  absolutePath: string
  relativePath: string
  repository: GitRepository
}

interface CandidateDirectory {
  absolutePath: string
  relativePath: string
}

function normalizeForCompare(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value
}

function isInsidePath(rootPath: string, targetPath: string): boolean {
  const relativePath = relative(rootPath, targetPath)
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('//')
}

function toPosixRelativePath(rootPath: string, targetPath: string): string {
  return relative(rootPath, targetPath).split(sep).join('/') || '.'
}

async function resolveWorkspaceRootPath(rootPathInput: unknown): Promise<string> {
  if (typeof rootPathInput !== 'string' || !rootPathInput.trim()) {
    throw new Error('Git workspace folder is required')
  }

  let rootPath: string
  try {
    rootPath = await fs.realpath(rootPathInput)
  } catch {
    throw new Error('Git workspace folder is unavailable')
  }

  let rootStats
  try {
    rootStats = await fs.lstat(rootPath)
  } catch {
    throw new Error('Git workspace folder is unavailable')
  }
  if (!rootStats.isDirectory()) throw new Error('Git workspace folder is not a directory')
  return resolve(rootPath)
}

function normalizeRequestedRepositoryPath(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Repository path must be text')
  if (!value.trim()) throw new Error('Repository path is required')
  if (value.includes('\u0000')) throw new Error('Repository path is invalid')
  if (isAbsolute(value) || isWindowsAbsolutePath(value)) {
    throw new Error('Repository path must be relative to the workspace folder')
  }
  if (value.includes('\\')) throw new Error('Repository path must use POSIX separators')

  const normalized = normalizeSourceControlRepositoryPaths([value])
  if (normalized.length !== 1) throw new Error('Repository path is invalid')
  return normalized[0]
}

function validateConfiguredRepositoryPaths(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('Configured repository paths must be an array')

  const normalized = normalizeSourceControlRepositoryPaths(value)
  const isNormalized = normalized.length === value.length
    && normalized.every((path, index) => path === value[index])
  if (!isNormalized) throw new Error('Configured repository paths must be normalized')
  return normalized
}

async function listCandidateDirectories(rootPath: string): Promise<CandidateDirectory[]> {
  const candidates: CandidateDirectory[] = []

  async function visitDirectory(absolutePath: string, relativePath: string, depth: number): Promise<void> {
    candidates.push({ absolutePath, relativePath })
    if (depth >= 2) return

    let entries
    try {
      entries = await fs.readdir(absolutePath, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (IGNORED_DIRECTORY_NAMES.has(entry.name)) continue

      const childPath = join(absolutePath, entry.name)
      let childStats
      try {
        childStats = await fs.lstat(childPath)
      } catch {
        continue
      }
      if (childStats.isSymbolicLink() || !childStats.isDirectory()) continue

      const childRelativePath = relativePath === '.' ? entry.name : `${relativePath}/${entry.name}`
      await visitDirectory(childPath, childRelativePath, depth + 1)
    }
  }

  await visitDirectory(rootPath, '.', 0)
  return candidates
}

async function canonicalGitRootPath(candidatePath: string): Promise<string | undefined> {
  let result
  try {
    result = await execGitCommand('git', ['-C', candidatePath, 'rev-parse', '--show-toplevel'])
  } catch {
    return undefined
  }

  const reportedPath = result.stdout.trim()
  if (!reportedPath) return undefined

  try {
    return await fs.realpath(reportedPath)
  } catch {
    return undefined
  }
}

async function isActualGitRoot(candidatePath: string): Promise<boolean> {
  const canonicalCandidatePath = await fs.realpath(candidatePath)
  const canonicalGitPath = await canonicalGitRootPath(canonicalCandidatePath)
  return canonicalGitPath !== undefined
    && normalizeForCompare(canonicalGitPath) === normalizeForCompare(canonicalCandidatePath)
}

function compareRepositories(left: GitRepository, right: GitRepository): number {
  return left.name.localeCompare(right.name) || left.relativePath.localeCompare(right.relativePath)
}

/** Discover real Git roots in a workspace and its first two directory levels. */
export async function discoverGitRepositories(rootPathInput: unknown): Promise<GitRepository[]> {
  const rootPath = await resolveWorkspaceRootPath(rootPathInput)
  const candidates = await listCandidateDirectories(rootPath)
  const repositories: GitRepository[] = []

  for (const candidate of candidates) {
    let canonicalCandidatePath: string
    try {
      canonicalCandidatePath = await fs.realpath(candidate.absolutePath)
    } catch {
      continue
    }
    if (normalizeForCompare(candidate.absolutePath) !== normalizeForCompare(canonicalCandidatePath)) continue
    if (!isInsidePath(normalizeForCompare(rootPath), normalizeForCompare(canonicalCandidatePath))) continue
    if (!(await isActualGitRoot(canonicalCandidatePath))) continue

    repositories.push({
      relativePath: toPosixRelativePath(rootPath, canonicalCandidatePath),
      name: basename(canonicalCandidatePath),
    })
  }

  return repositories.sort(compareRepositories)
}

async function resolveDirectoryWithoutSymlinks(rootPath: string, relativePath: string): Promise<string> {
  const segments = relativePath === '.' ? [] : relativePath.split('/')
  let currentPath = rootPath

  for (const segment of segments) {
    currentPath = join(currentPath, segment)
    let stats
    try {
      stats = await fs.lstat(currentPath)
    } catch {
      throw new Error('Configured repository directory does not exist')
    }
    if (stats.isSymbolicLink()) throw new Error('Configured repository path cannot contain symlinks')
    if (!stats.isDirectory()) throw new Error('Configured repository path is not a directory')
  }

  let canonicalPath: string
  try {
    canonicalPath = await fs.realpath(currentPath)
  } catch {
    throw new Error('Configured repository directory does not exist')
  }
  if (!isInsidePath(normalizeForCompare(rootPath), normalizeForCompare(canonicalPath))) {
    throw new Error('Configured repository path escapes the workspace folder')
  }
  if (normalizeForCompare(currentPath) !== normalizeForCompare(canonicalPath)) {
    throw new Error('Configured repository path cannot contain symlinks')
  }
  return canonicalPath
}

/** Resolve one configured repository to a main-process-only absolute path. */
export async function resolveConfiguredGitRepository(
  rootPathInput: unknown,
  configuredRepositoryPaths: unknown,
  requestedRelativePath: unknown,
): Promise<ResolvedGitRepository> {
  const rootPath = await resolveWorkspaceRootPath(rootPathInput)
  const configuredPaths = validateConfiguredRepositoryPaths(configuredRepositoryPaths)
  const relativePath = normalizeRequestedRepositoryPath(requestedRelativePath)
  if (!configuredPaths.includes(relativePath)) throw new Error('Repository is not configured')

  const absolutePath = await resolveDirectoryWithoutSymlinks(rootPath, relativePath)
  if (!(await isActualGitRoot(absolutePath))) {
    throw new Error('Configured repository path is not a Git repository root')
  }

  return {
    absolutePath,
    relativePath,
    repository: {
      relativePath,
      name: basename(absolutePath),
    },
  }
}
