import { promises as fs } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'

import { execGitCommand, type GitCommandExecutor } from '../git/runner'

export interface AgentWorktreeCreateInput {
  rootPath: string
  sessionId: string
  baseDirectory: string
}

export interface AgentWorktree {
  path: string
  cwd: string
  branch: string
  baseSha: string
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

function normalizeSessionSuffix(sessionId: string): string {
  const normalized = sessionId.startsWith('agent-') ? sessionId.slice('agent-'.length) : sessionId
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)) {
    throw new Error('Invalid agent session id')
  }
  return normalized.slice(0, 8)
}

async function resolveRepositoryRoot(rootPath: string, executor: GitCommandExecutor): Promise<string> {
  const result = await runGitAt(rootPath, ['rev-parse', '--show-toplevel'], executor)
  const repositoryRoot = outputLine(result.stdout)
  if (!repositoryRoot) throw new Error('Git repository root could not be resolved')
  return resolve(repositoryRoot)
}

async function resolveHead(rootPath: string, executor: GitCommandExecutor): Promise<string> {
  const result = await runGitAt(rootPath, ['rev-parse', '--verify', 'HEAD^{commit}'], executor)
  const baseSha = result.stdout.trim()
  validateBaseSha(baseSha)
  return baseSha
}

/** True only when the selected directory belongs to a repository with a commit. */
export async function canCreateAgentWorktree(
  rootPath: string,
  executor: GitCommandExecutor = execGitCommand,
): Promise<boolean> {
  if (typeof rootPath !== 'string' || !rootPath.trim()) return false
  try {
    await resolveRepositoryRoot(rootPath, executor)
    await resolveHead(rootPath, executor)
    return true
  } catch {
    return false
  }
}

async function nextAvailableBranch(repositoryRoot: string, shortId: string, executor: GitCommandExecutor): Promise<string> {
  const baseBranch = `yira/agent-${shortId}`
  for (let suffix = 0; suffix < 100_000; suffix += 1) {
    const branch = suffix === 0 ? baseBranch : `${baseBranch}-${suffix}`
    validateBranch(branch)
    await runGitAt(repositoryRoot, ['check-ref-format', '--branch', branch], executor)
    const existing = await runGitAt(repositoryRoot, ['branch', '--list', '--format=%(refname:short)', branch], executor)
    if (!existing.stdout.trim()) return branch
  }
  throw new Error('No available agent worktree branch name')
}

/** Create a linked worktree while preserving the workspace's subdirectory as cwd. */
export async function createAgentWorktree(
  input: AgentWorktreeCreateInput,
  executor: GitCommandExecutor = execGitCommand,
): Promise<AgentWorktree> {
  if (!input || typeof input.rootPath !== 'string' || !input.rootPath.trim()) {
    throw new Error('Agent worktree root path is required')
  }
  if (typeof input.baseDirectory !== 'string' || !input.baseDirectory.trim()) {
    throw new Error('Agent worktree base directory is required')
  }

  const rootPath = await fs.realpath(resolve(input.rootPath))
  const repositoryRoot = await resolveRepositoryRoot(rootPath, executor)
  const baseSha = await resolveHead(rootPath, executor)
  const shortId = normalizeSessionSuffix(input.sessionId)
  const branch = await nextAvailableBranch(repositoryRoot, shortId, executor)
  const repositoryName = basename(repositoryRoot) || 'repository'
  const worktreePath = join(resolve(input.baseDirectory), `${repositoryName}-${shortId}`)
  const workspaceRelativePath = relative(repositoryRoot, rootPath)
  if (workspaceRelativePath.startsWith('..') || isAbsolute(workspaceRelativePath)) {
    throw new Error('Agent worktree root is outside its Git repository')
  }

  await fs.mkdir(input.baseDirectory, { recursive: true })
  await runGitAt(repositoryRoot, ['worktree', 'add', '-b', branch, '--', worktreePath, baseSha], executor)
  worktreeRepositories.set(resolve(worktreePath), repositoryRoot)

  return {
    path: worktreePath,
    cwd: resolve(worktreePath, workspaceRelativePath),
    branch,
    baseSha,
  }
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
