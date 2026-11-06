import { promises as fs } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { mapWithConcurrency } from '@shared/mapWithConcurrency'
import type { AgentWorktreeOption } from '@shared/types'

import { discoverGitRepositories, resolveConfiguredGitRepository } from '../git/repositories'
import { execGitCommand, type GitCommandExecutor } from '../git/runner'

export interface AgentWorktreeRepository {
  relativePath: string
  absolutePath: string
}

export interface ResolveWorkspaceWorktreeRepositoriesInput {
  rootPath: string
  configuredRepositoryPaths: string[]
}

export interface ResolveWorkspaceWorktreeRepositoriesDependencies {
  discoverGitRepositories?: typeof discoverGitRepositories
  resolveConfiguredGitRepository?: typeof resolveConfiguredGitRepository
  executor?: GitCommandExecutor
}

export interface AgentWorkspaceWorktreeCreateInput {
  rootPath: string
  repositories: AgentWorktreeRepository[]
  sessionId: string
  baseDirectory: string
}

export interface AgentWorkspaceWorktree {
  root: string
  branch: string
  worktrees: Array<{
    path: string
    repositoryPath: string
    baseSha: string
  }>
}

export interface ListWorkspaceWorktreesInput {
  rootPath: string
  configuredRepositoryPaths: string[]
  /** worktreeRoot of the live agent sessions. */
  activeRoots: string[]
}

export interface ListWorkspaceWorktreesDependencies {
  resolveWorkspaceWorktreeRepositories?: typeof resolveWorkspaceWorktreeRepositories
  executor?: GitCommandExecutor
}

export interface AgentWorktreeCleanupInput {
  path: string
  branch: string
  baseSha: string
}

export type AgentWorktreeRemovalResult = 'removed' | 'kept' | 'missing'

const worktreeRepositories = new Map<string, string>()

function outputLine(stdout: string): string {
  return stdout.replace(/[\r\n]+$/, '')
}

function runGitAt(rootPath: string, args: string[], executor: GitCommandExecutor) {
  return executor('git', ['-C', rootPath, ...args])
}

function validateBranch(branch: unknown): asserts branch is string {
  if (typeof branch !== 'string' || !/^yira\/agent-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(branch)) {
    throw new Error('Invalid agent worktree branch')
  }
}

function validateBaseSha(baseSha: unknown): asserts baseSha is string {
  if (typeof baseSha !== 'string' || !/^[a-f\d]{40}(?:[a-f\d]{24})?$/i.test(baseSha)) {
    throw new Error('Invalid agent worktree base commit')
  }
}

export function normalizeSessionSuffix(sessionId: string): string {
  const normalized = sessionId.startsWith('agent-') ? sessionId.slice('agent-'.length) : sessionId
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)) {
    throw new Error('Invalid agent session id')
  }
  return normalized.slice(0, 8)
}

function normalizePathForCompare(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path
}

function isPathInside(rootPath: string, targetPath: string): boolean {
  const relativePath = relative(rootPath, targetPath)
  return relativePath === ''
    || (relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
}

/** True when either path is the other or lives inside it. */
export function worktreePathsOverlap(left: string, right: string): boolean {
  if (typeof left !== 'string' || typeof right !== 'string' || !left.trim() || !right.trim()) return false
  const first = normalizePathForCompare(resolve(left))
  const second = normalizePathForCompare(resolve(right))
  return isPathInside(first, second) || isPathInside(second, first)
}

/** Parse `git worktree list --porcelain` blocks into their checkout metadata. */
export function parseGitWorktreeList(
  output: string,
): Array<{ path: string; head: string; branch?: string; bare: boolean; prunable: boolean }> {
  const entries: Array<{ path: string; head: string; branch?: string; bare: boolean; prunable: boolean }> = []
  let current: (typeof entries)[number] | undefined
  const flush = (): void => {
    if (current?.path) entries.push(current)
    current = undefined
  }

  for (const rawLine of output.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trimEnd()
    if (!line) {
      flush()
      continue
    }
    if (line.startsWith('worktree ')) {
      // A worktree line starts a block even when Git omits the blank separator.
      flush()
      current = {
        path: resolve(line.slice('worktree '.length).trim()),
        head: '',
        bare: false,
        prunable: false,
      }
      continue
    }
    if (!current) continue
    if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length).trim()
    } else if (line.startsWith('branch ')) {
      const ref = line.slice('branch '.length).trim()
      if (ref.startsWith('refs/heads/')) {
        const branch = ref.slice('refs/heads/'.length)
        if (branch) current.branch = branch
      }
    } else if (line === 'bare') {
      current.bare = true
    } else if (line === 'prunable' || line.startsWith('prunable ')) {
      current.prunable = true
    }
  }

  flush()
  return entries
}

function repositoryDepth(relativePath: string): number {
  return relativePath === '.' ? 0 : relativePath.split('/').length
}

function compareRepositories(left: AgentWorktreeRepository, right: AgentWorktreeRepository): number {
  if (left.relativePath === '.') return right.relativePath === '.' ? 0 : -1
  if (right.relativePath === '.') return 1
  return repositoryDepth(left.relativePath) - repositoryDepth(right.relativePath)
    || basename(left.absolutePath).localeCompare(basename(right.absolutePath))
    || left.relativePath.localeCompare(right.relativePath)
}

async function resolveHead(rootPath: string, executor: GitCommandExecutor): Promise<string> {
  const result = await runGitAt(rootPath, ['rev-parse', '--verify', 'HEAD^{commit}'], executor)
  const baseSha = result.stdout.trim()
  validateBaseSha(baseSha)
  return baseSha
}

/** Match Source Control repository selection and retain only repositories with a committed HEAD. */
export async function resolveWorkspaceWorktreeRepositories(
  input: ResolveWorkspaceWorktreeRepositoriesInput,
  dependencies: ResolveWorkspaceWorktreeRepositoriesDependencies = {},
): Promise<AgentWorktreeRepository[]> {
  if (!input || typeof input.rootPath !== 'string' || !input.rootPath.trim()) {
    throw new Error('Agent worktree root path is required')
  }

  const discover = dependencies.discoverGitRepositories ?? discoverGitRepositories
  const resolveRepository = dependencies.resolveConfiguredGitRepository ?? resolveConfiguredGitRepository
  const executor = dependencies.executor ?? execGitCommand
  const discovered = await discover(input.rootPath, 1)
  const repositoryPaths = [...new Set([
    ...(Array.isArray(input.configuredRepositoryPaths) ? input.configuredRepositoryPaths : []),
    ...discovered.map(({ relativePath }) => relativePath),
  ])]
  const seenCanonicalPaths = new Set<string>()
  const repositories: AgentWorktreeRepository[] = []

  for (const repositoryPath of repositoryPaths) {
    const repository = await resolveRepository(input.rootPath, repositoryPaths, repositoryPath)
    const canonicalPath = normalizePathForCompare(repository.absolutePath)
    if (seenCanonicalPaths.has(canonicalPath)) continue
    seenCanonicalPaths.add(canonicalPath)

    try {
      await resolveHead(repository.absolutePath, executor)
    } catch {
      // Unborn repositories cannot provide a stable worktree base.
      continue
    }

    repositories.push({
      relativePath: repository.relativePath,
      absolutePath: repository.absolutePath,
    })
  }

  return repositories.sort(compareRepositories)
}

function worktreeCandidateFolder(entryPath: string, repository: AgentWorktreeRepository): string {
  const resolvedEntryPath = resolve(entryPath)
  if (repository.relativePath === '.') return resolvedEntryPath

  const segments = repository.relativePath.split('/').filter(Boolean)
  if (segments.length === 0) return resolvedEntryPath
  const candidate = resolve(resolvedEntryPath, ...segments.map(() => '..'))
  const suffix = relative(candidate, resolvedEntryPath).split(/[\\/]/).join('/')
  return normalizePathForCompare(suffix) === normalizePathForCompare(repository.relativePath)
    ? candidate
    : resolvedEntryPath
}

function countChangedLines(output: string): number {
  return output.split(/\r?\n/).filter((line) => line.length > 0).length
}

async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    return (await fs.stat(targetPath)).isDirectory()
  } catch {
    return false
  }
}

function compareWorktreeOptions(left: AgentWorktreeOption, right: AgentWorktreeOption): number {
  if (left.branch !== right.branch) {
    if (left.branch === undefined) return 1
    if (right.branch === undefined) return -1
    const byBranch = left.branch.localeCompare(right.branch)
    if (byBranch !== 0) return byBranch
  }
  return normalizePathForCompare(left.path).localeCompare(normalizePathForCompare(right.path))
}

/** List every checkout that already exists across the workspace repositories. */
export async function listWorkspaceWorktrees(
  input: ListWorkspaceWorktreesInput,
  dependencies: ListWorkspaceWorktreesDependencies = {},
): Promise<AgentWorktreeOption[]> {
  if (!input || typeof input.rootPath !== 'string' || !input.rootPath.trim()) return []

  const executor = dependencies.executor ?? execGitCommand
  const resolveRepositories = dependencies.resolveWorkspaceWorktreeRepositories
    ?? resolveWorkspaceWorktreeRepositories
  let repositories: AgentWorktreeRepository[]
  try {
    repositories = await resolveRepositories(input, { executor })
  } catch {
    return []
  }

  const activeRoots = Array.isArray(input.activeRoots) ? input.activeRoots : []
  const seenPaths = new Set<string>()
  const entries: Array<{
    path: string
    head: string
    branch?: string
    bare: boolean
    prunable: boolean
    repository: AgentWorktreeRepository
  }> = []

  for (const repository of repositories) {
    let output: string
    try {
      output = (await runGitAt(repository.absolutePath, ['worktree', 'list', '--porcelain'], executor)).stdout
    } catch {
      // One unreadable repository must not hide the worktrees of the others.
      continue
    }

    for (const entry of parseGitWorktreeList(output)) {
      if (entry.bare) continue
      const canonicalPath = normalizePathForCompare(resolve(entry.path))
      if (canonicalPath === normalizePathForCompare(resolve(repository.absolutePath))) continue
      if (seenPaths.has(canonicalPath)) continue
      seenPaths.add(canonicalPath)
      entries.push({ ...entry, repository })
    }
  }

  const groups = new Map<string, typeof entries>()
  const standalone: Array<typeof entries> = []
  for (const entry of entries) {
    if (!entry.branch) {
      standalone.push([entry])
      continue
    }
    const candidate = worktreeCandidateFolder(entry.path, entry.repository)
    const key = `${normalizePathForCompare(candidate)}\u0000${entry.branch}`
    const group = groups.get(key)
    if (group) group.push(entry)
    else groups.set(key, [entry])
  }

  const rows: Array<{ path: string; entries: typeof entries }> = []
  for (const group of groups.values()) {
    if (group.length >= 2) {
      rows.push({ path: worktreeCandidateFolder(group[0].path, group[0].repository), entries: group })
    } else {
      standalone.push(group)
    }
  }
  for (const group of standalone) {
    rows.push({ path: resolve(group[0].path), entries: group })
  }

  const missing = await Promise.all(rows.map(async (row) => (
    await Promise.all(row.entries.map(async (entry) => (
      entry.prunable || !(await isDirectory(entry.path))
    )))
  ).some(Boolean)))

  const changedFiles = await mapWithConcurrency(rows, 8, async (row, index): Promise<number | undefined> => {
    if (missing[index]) return undefined
    let total = 0
    for (const entry of row.entries) {
      try {
        const status = await executor('git', ['--no-optional-locks', '-C', entry.path, 'status', '--porcelain'])
        total += countChangedLines(status.stdout)
      } catch {
        return undefined
      }
    }
    return total
  })

  const options = rows.map((row, index): AgentWorktreeOption => {
    const first = row.entries[0]
    const branch = first.branch
    const createdByYira = branch?.startsWith('yira/agent-') ?? false
    const option: AgentWorktreeOption = {
      path: row.path,
      ...(branch ? { branch } : {}),
      head: first.head.slice(0, 7),
      repositories: row.entries.map(({ path, repository }) => ({
        relativePath: repository.relativePath,
        name: basename(repository.absolutePath),
        path,
      })),
      createdByYira,
      activeSessions: activeRoots.filter((root) => (
        typeof root === 'string' && worktreePathsOverlap(root, row.path)
      )).length,
      missing: missing[index],
    }
    if (changedFiles[index] !== undefined) option.changedFiles = changedFiles[index]
    return option
  })

  return options.sort(compareWorktreeOptions)
}

async function nextAvailableBranch(
  repositories: AgentWorktreeRepository[],
  shortId: string,
  executor: GitCommandExecutor,
): Promise<string> {
  const baseBranch = `yira/agent-${shortId}`
  for (let suffix = 0; suffix < 100_000; suffix += 1) {
    const branch = suffix === 0 ? baseBranch : `${baseBranch}-${suffix}`
    validateBranch(branch)
    let isAvailable = true

    for (const repository of repositories) {
      await runGitAt(repository.absolutePath, ['check-ref-format', '--branch', branch], executor)
      const existing = await runGitAt(
        repository.absolutePath,
        ['branch', '--list', '--format=%(refname:short)', branch],
        executor,
      )
      if (existing.stdout.trim()) {
        isAvailable = false
        break
      }
    }

    if (isAvailable) return branch
  }
  throw new Error('No available agent worktree branch name')
}

/** Create one shared branch across the selected repositories under a single workspace container. */
export async function createAgentWorkspaceWorktrees(
  input: AgentWorkspaceWorktreeCreateInput,
  executor: GitCommandExecutor = execGitCommand,
): Promise<AgentWorkspaceWorktree> {
  if (!input || typeof input.rootPath !== 'string' || !input.rootPath.trim()) {
    throw new Error('Agent worktree root path is required')
  }
  if (!Array.isArray(input.repositories) || input.repositories.length === 0) {
    throw new Error('Agent worktree repositories are required')
  }
  if (typeof input.baseDirectory !== 'string' || !input.baseDirectory.trim()) {
    throw new Error('Agent worktree base directory is required')
  }

  const shortId = normalizeSessionSuffix(input.sessionId)
  const canonicalRoot = await fs.realpath(resolve(input.rootPath))
  const workspaceName = basename(resolve(input.rootPath)) || 'workspace'
  const root = join(resolve(input.baseDirectory), `${workspaceName}-${shortId}`)
  const repositories = [...input.repositories].sort(compareRepositories)
  const branch = await nextAvailableBranch(repositories, shortId, executor)
  const baseShas = new Map<string, string>()

  for (const repository of repositories) {
    const canonicalRepositoryPath = await fs.realpath(repository.absolutePath)
    const relativeFromRoot = relative(canonicalRoot, canonicalRepositoryPath)
    if (/^\.\.(?:[\\/]|$)/.test(relativeFromRoot) || isAbsolute(relativeFromRoot)) {
      throw new Error('Agent worktree repository is outside its workspace')
    }
    const relativePath = relativeFromRoot.split(/\\|\//).join('/') || '.'
    if (relativePath !== repository.relativePath) throw new Error('Agent worktree repository path changed')
    const sha = await resolveHead(canonicalRepositoryPath, executor)
    baseShas.set(repository.relativePath, sha)
  }

  await fs.mkdir(resolve(input.baseDirectory), { recursive: true })
  const created: AgentWorkspaceWorktree['worktrees'] = []

  try {
    for (const repository of repositories) {
      const worktreePath = repository.relativePath === '.'
        ? root
        : join(root, ...repository.relativePath.split('/'))
      const baseSha = baseShas.get(repository.relativePath)
      if (!baseSha) throw new Error('Agent worktree base commit could not be resolved')

      await fs.mkdir(dirname(worktreePath), { recursive: true })
      await runGitAt(repository.absolutePath, ['worktree', 'add', '-b', branch, '--', worktreePath, baseSha], executor)
      worktreeRepositories.set(resolve(worktreePath), repository.absolutePath)
      created.push({ path: worktreePath, repositoryPath: repository.relativePath, baseSha })
    }
  } catch (error) {
    for (const worktree of [...created].reverse()) {
      try {
        await removeAgentWorktreeIfClean({ path: worktree.path, branch, baseSha: worktree.baseSha }, executor)
      } catch {
        // Preserve the creation error while attempting every prior worktree rollback.
      }
    }
    const emptyDirectories = new Set<string>()
    for (const worktree of created) {
      let directory = dirname(worktree.path)
      while (directory !== root) {
        const relativeDirectory = relative(root, directory)
        if (/^\.\.(?:[\\/]|$)/.test(relativeDirectory) || isAbsolute(relativeDirectory)) break
        emptyDirectories.add(directory)
        directory = dirname(directory)
      }
    }
    for (const directory of [...emptyDirectories].sort((left, right) => right.length - left.length)) {
      try { await fs.rmdir(directory) } catch { /* Keep the original creation failure. */ }
    }
    try { await fs.rmdir(root) } catch { /* Keep the original creation failure. */ }
    throw error
  }

  return { root, branch, worktrees: created }
}

async function worktreeExists(worktreePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(worktreePath)
    if (!stat.isDirectory()) throw new Error('Agent worktree path is not a directory')
    return true
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}

async function pruneMissingWorktree(worktreePath: string, executor: GitCommandExecutor): Promise<void> {
  const repositoryRoot = worktreeRepositories.get(resolve(worktreePath))
  if (!repositoryRoot) return
  try {
    await runGitAt(repositoryRoot, ['worktree', 'prune'], executor)
  } catch {
    // Pruning stale metadata is best-effort once the worktree directory is gone.
  }
  worktreeRepositories.delete(resolve(worktreePath))
}

async function getCommonGitDirectory(worktreePath: string, executor: GitCommandExecutor): Promise<string> {
  const result = await runGitAt(worktreePath, ['rev-parse', '--path-format=absolute', '--git-common-dir'], executor)
  const commonDirectory = outputLine(result.stdout)
  if (!commonDirectory) throw new Error('Git common directory could not be resolved')
  return isAbsolute(commonDirectory) ? commonDirectory : resolve(worktreePath, commonDirectory)
}

/** Remove only an unchanged worktree; user changes and commits keep it in place. */
export async function removeAgentWorktreeIfClean(
  input: AgentWorktreeCleanupInput,
  executor: GitCommandExecutor = execGitCommand,
): Promise<AgentWorktreeRemovalResult> {
  if (!input || typeof input.path !== 'string' || !input.path.trim()) {
    throw new Error('Agent worktree path is required')
  }
  validateBranch(input.branch)
  validateBaseSha(input.baseSha)

  const worktreePath = resolve(input.path)
  if (!(await worktreeExists(worktreePath))) {
    await pruneMissingWorktree(worktreePath, executor)
    return 'missing'
  }

  const status = await runGitAt(worktreePath, ['status', '--porcelain'], executor)
  if (status.stdout.length > 0) return 'kept'

  const commits = await runGitAt(worktreePath, ['rev-list', '--count', `${input.baseSha}..HEAD`], executor)
  const commitCount = Number(commits.stdout.trim())
  if (!Number.isInteger(commitCount) || commitCount < 0) throw new Error('Git returned an invalid worktree commit count')
  if (commitCount > 0) return 'kept'

  const commonDirectory = await getCommonGitDirectory(worktreePath, executor)
  await executor('git', ['--git-dir', commonDirectory, 'worktree', 'remove', '--', worktreePath])
  await executor('git', ['--git-dir', commonDirectory, 'branch', '-D', '--', input.branch])
  worktreeRepositories.delete(worktreePath)
  return 'removed'
}
