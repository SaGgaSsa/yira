import assert from 'node:assert/strict'
import { access, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { execGitCommand, type GitCommandExecutor, type GitCommandResult } from '../git/runner'
import {
  createAgentWorkspaceWorktrees,
  removeAgentWorktreeIfClean,
  resolveWorkspaceWorktreeRepositories,
} from './worktree'

const baseSha = 'a'.repeat(40)

function result(stdout = ''): GitCommandResult {
  return { stdout, stderr: '' }
}

function fakeGit(handler: (args: string[]) => GitCommandResult | Promise<GitCommandResult>): {
  executor: GitCommandExecutor
  calls: string[][]
} {
  const calls: string[][] = []
  const executor: GitCommandExecutor = async (_command, args) => {
    calls.push(args)
    return handler(args)
  }
  return { executor, calls }
}

async function makeTempDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'yira-agent-worktree-'))
}

async function initializeRepository(root: string, commit = true): Promise<void> {
  await mkdir(root, { recursive: true })
  await execGitCommand('git', ['-C', root, 'init', '--quiet'])
  await execGitCommand('git', ['-C', root, 'config', 'user.name', 'Yira Test'])
  await execGitCommand('git', ['-C', root, 'config', 'user.email', 'yira-test@example.invalid'])
  if (!commit) return
  await writeFile(join(root, 'README.md'), 'temporary repository\n')
  await execGitCommand('git', ['-C', root, 'add', 'README.md'])
  await execGitCommand('git', ['-C', root, 'commit', '--quiet', '-m', 'initial commit'])
}

test('resolves committed child repositories in a non-Git workspace and creates their worktrees', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))

  const rootPath = join(temporaryDirectory, 'workspace')
  const alphaPath = join(rootPath, 'alpha')
  const zetaPath = join(rootPath, 'zeta')
  await mkdir(rootPath)
  await initializeRepository(alphaPath)
  await initializeRepository(zetaPath)
  await initializeRepository(join(rootPath, 'unborn'), false)
  await execGitCommand('git', ['-C', zetaPath, 'branch', 'yira/agent-12345678'])

  const repositories = await resolveWorkspaceWorktreeRepositories({
    rootPath,
    configuredRepositoryPaths: ['alpha'],
  })
  assert.deepEqual(repositories.map(({ relativePath }) => relativePath), ['alpha', 'zeta'])
  assert.deepEqual(repositories.map(({ absolutePath }) => absolutePath), [alphaPath, zetaPath])

  const baseDirectory = join(temporaryDirectory, 'agent-worktrees')
  const worktree = await createAgentWorkspaceWorktrees({
    rootPath,
    repositories,
    sessionId: 'agent-12345678-extra',
    baseDirectory,
  })
  assert.equal(worktree.root, join(baseDirectory, 'workspace-12345678'))
  assert.equal(worktree.branch, 'yira/agent-12345678-1')
  assert.deepEqual(worktree.worktrees.map(({ repositoryPath }) => repositoryPath), ['alpha', 'zeta'])
  assert.deepEqual(worktree.worktrees.map(({ path }) => path), [
    join(worktree.root, 'alpha'),
    join(worktree.root, 'zeta'),
  ])
  for (const entry of worktree.worktrees) {
    assert.equal((await execGitCommand('git', ['-C', entry.path, 'branch', '--show-current'])).stdout.trim(), worktree.branch)
    assert.match(entry.baseSha, /^[a-f\d]{40}$/i)
  }

  for (const entry of [...worktree.worktrees].reverse()) {
    assert.equal(await removeAgentWorktreeIfClean({ ...entry, branch: worktree.branch }), 'removed')
  }
  await rm(worktree.root, { recursive: true, force: true })
})

test('creates the root repository first and nests a child repository in its worktree', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))

  const rootPath = join(temporaryDirectory, 'monorepo')
  const childPath = join(rootPath, 'child')
  await initializeRepository(rootPath)
  await initializeRepository(childPath)

  const repositories = await resolveWorkspaceWorktreeRepositories({ rootPath, configuredRepositoryPaths: [] })
  assert.deepEqual(repositories.map(({ relativePath }) => relativePath), ['.', 'child'])

  const worktree = await createAgentWorkspaceWorktrees({
    rootPath,
    repositories,
    sessionId: 'agent-root1234',
    baseDirectory: join(temporaryDirectory, 'worktrees'),
  })
  assert.deepEqual(worktree.worktrees.map(({ repositoryPath }) => repositoryPath), ['.', 'child'])
  assert.equal(worktree.worktrees[0].path, worktree.root)
  assert.equal(worktree.worktrees[1].path, join(worktree.root, 'child'))

  for (const entry of [...worktree.worktrees].reverse()) {
    assert.equal(await removeAgentWorktreeIfClean({ ...entry, branch: worktree.branch }), 'removed')
  }
})

test('rolls back already-created worktrees in reverse order when a later repository fails', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))

  const rootPath = join(temporaryDirectory, 'workspace')
  const alphaPath = join(rootPath, 'alpha')
  const zetaPath = join(rootPath, 'zeta')
  await mkdir(rootPath)
  await initializeRepository(alphaPath)
  await initializeRepository(zetaPath)
  const repositories = await resolveWorkspaceWorktreeRepositories({ rootPath, configuredRepositoryPaths: [] })
  const baseDirectory = join(temporaryDirectory, 'worktrees')
  const originalError = new Error('second repository failed')
  const cleanupPaths: string[] = []
  const executor: GitCommandExecutor = async (command, args) => {
    if (args.includes('worktree') && args.includes('add') && args.includes(zetaPath)) throw originalError
    if (args.includes('worktree') && args.includes('remove')) cleanupPaths.push(args.at(-1) ?? '')
    return execGitCommand(command, args)
  }

  await assert.rejects(() => createAgentWorkspaceWorktrees({
    rootPath,
    repositories,
    sessionId: 'agent-rollback',
    baseDirectory,
  }, executor), (error: unknown) => error === originalError)

  assert.deepEqual(cleanupPaths, [join(baseDirectory, 'workspace-rollback', 'alpha')])
  await assert.rejects(() => access(join(baseDirectory, 'workspace-rollback', 'alpha')))
  assert.equal((await execGitCommand('git', ['-C', alphaPath, 'branch', '--list', 'yira/agent-rollback'])).stdout.trim(), '')
})

test('keeps dirty worktrees and worktrees with commits after the base', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const dirtyWorktree = join(temporaryDirectory, 'dirty')
  const committedWorktree = join(temporaryDirectory, 'committed')
  await Promise.all([mkdir(dirtyWorktree), mkdir(committedWorktree)])

  const dirtyGit = fakeGit(() => result(' M changed.txt\n'))
  assert.equal(await removeAgentWorktreeIfClean({
    path: dirtyWorktree,
    branch: 'yira/agent-12345678',
    baseSha,
  }, dirtyGit.executor), 'kept')
  assert.equal(dirtyGit.calls.length, 1)

  const committedGit = fakeGit((args) => {
    if (args.includes('status')) return result()
    if (args.includes('rev-list')) return result('2\n')
    throw new Error('Unexpected cleanup command')
  })
  assert.equal(await removeAgentWorktreeIfClean({
    path: committedWorktree,
    branch: 'yira/agent-12345678',
    baseSha,
  }, committedGit.executor), 'kept')
  assert.equal(committedGit.calls.length, 2)
})

test('removes clean worktrees without force and deletes their branch from the common Git directory', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const worktreePath = join(temporaryDirectory, 'clean')
  const commonDirectory = join(temporaryDirectory, 'repository', '.git')
  await mkdir(worktreePath)
  const { executor, calls } = fakeGit((args) => {
    if (args.includes('status')) return result()
    if (args.includes('rev-list')) return result('0\n')
    if (args.includes('--git-common-dir')) return result(`${commonDirectory}\n`)
    return result()
  })

  assert.equal(await removeAgentWorktreeIfClean({
    path: worktreePath,
    branch: 'yira/agent-12345678',
    baseSha,
  }, executor), 'removed')

  const removeCall = calls.find((args) => args.includes('remove'))
  const branchCall = calls.find((args) => args.includes('-D'))
  assert.deepEqual(removeCall, ['--git-dir', commonDirectory, 'worktree', 'remove', '--', worktreePath])
  assert.deepEqual(branchCall, ['--git-dir', commonDirectory, 'branch', '-D', '--', 'yira/agent-12345678'])
  assert.ok(calls.every((args) => !args.includes('--force') && !args.includes('-f')))
})

test('rejects unsafe worktree branch names before invoking Git', async () => {
  const { executor, calls } = fakeGit(() => result())
  await assert.rejects(() => removeAgentWorktreeIfClean({
    path: 'missing',
    branch: 'yira/agent-../../other',
    baseSha,
  }, executor), /Invalid agent worktree branch/)
  assert.equal(calls.length, 0)
})
