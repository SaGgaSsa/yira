import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import { execGitCommand, type GitCommandExecutor, type GitCommandResult } from '../git/runner'
import {
  canCreateAgentWorktree,
  createAgentWorktree,
  removeAgentWorktreeIfClean,
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

test('allows a worktree only when Git can resolve a repository and committed HEAD', async () => {
  const repositoryRoot = resolve('temporary-repository')
  const { executor } = fakeGit((args) => {
    if (args.at(-1) === '--show-toplevel') return result(`${repositoryRoot}\n`)
    if (args.includes('HEAD^{commit}')) return result(`${baseSha}\n`)
    throw new Error('unexpected Git command')
  })

  assert.equal(await canCreateAgentWorktree(repositoryRoot, executor), true)

  const noCommit = fakeGit((args) => {
    if (args.at(-1) === '--show-toplevel') return result(`${repositoryRoot}\n`)
    throw new Error('HEAD is missing')
  })
  assert.equal(await canCreateAgentWorktree(repositoryRoot, noCommit.executor), false)
  assert.equal(await canCreateAgentWorktree('', executor), false)
})

test('creates a branch with a collision suffix and preserves a workspace subdirectory as cwd', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))

  const repositoryRoot = join(temporaryDirectory, 'sample-repo')
  const workspaceRoot = join(repositoryRoot, 'packages', 'app')
  const baseDirectory = join(temporaryDirectory, 'agent-worktrees')
  await mkdir(workspaceRoot, { recursive: true })
  let branchLookups = 0
  const { executor, calls } = fakeGit((args) => {
    if (args.at(-1) === '--show-toplevel') return result(`${repositoryRoot}\n`)
    if (args.includes('HEAD^{commit}')) return result(`${baseSha}\n`)
    if (args.includes('--format=%(refname:short)')) {
      branchLookups += 1
      return result(branchLookups === 1 ? 'yira/agent-12345678\n' : '')
    }
    return result()
  })

  const worktree = await createAgentWorktree({
    rootPath: workspaceRoot,
    sessionId: 'agent-12345678-rest',
    baseDirectory,
  }, executor)

  assert.equal(worktree.path, join(baseDirectory, 'sample-repo-12345678'))
  assert.equal(worktree.cwd, join(worktree.path, 'packages', 'app'))
  assert.equal(worktree.branch, 'yira/agent-12345678-1')
  assert.equal(worktree.baseSha, baseSha)
  assert.ok(calls.some((args) => args.includes('check-ref-format')))
  assert.ok(calls.some((args) => args.includes('worktree') && args.includes('add')))
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

test('prunes metadata best-effort when a created worktree directory is missing', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const repositoryRoot = join(temporaryDirectory, 'sample-repo')
  const baseDirectory = join(temporaryDirectory, 'agent-worktrees')
  const { executor, calls } = fakeGit((args) => {
    if (args.at(-1) === '--show-toplevel') return result(`${repositoryRoot}\n`)
    if (args.includes('HEAD^{commit}')) return result(`${baseSha}\n`)
    if (args.includes('--format=%(refname:short)')) return result()
    return result()
  })
  await mkdir(repositoryRoot)
  const worktree = await createAgentWorktree({
    rootPath: repositoryRoot,
    sessionId: 'agent-abcd1234',
    baseDirectory,
  }, executor)

  assert.equal(await removeAgentWorktreeIfClean({
    path: worktree.path,
    branch: worktree.branch,
    baseSha: worktree.baseSha,
  }, executor), 'missing')
  assert.ok(calls.some((args) => args.includes('worktree') && args.includes('prune')))
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

test('creates and removes a clean worktree in a temporary Git repository', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))

  const repositoryRoot = join(temporaryDirectory, 'project')
  const workspaceRoot = join(repositoryRoot, 'packages', 'app')
  const baseDirectory = join(temporaryDirectory, 'worktrees')
  await mkdir(workspaceRoot, { recursive: true })
  await writeFile(join(repositoryRoot, 'README.md'), 'temporary repository\n')
  await execGitCommand('git', ['-C', repositoryRoot, 'init'])
  await execGitCommand('git', ['-C', repositoryRoot, 'config', 'user.name', 'Yira Test'])
  await execGitCommand('git', ['-C', repositoryRoot, 'config', 'user.email', 'yira-test@example.invalid'])
  await execGitCommand('git', ['-C', repositoryRoot, 'add', 'README.md'])
  await execGitCommand('git', ['-C', repositoryRoot, 'commit', '-m', 'initial commit'])

  const worktree = await createAgentWorktree({
    rootPath: workspaceRoot,
    sessionId: 'agent-fedcba98',
    baseDirectory,
  })

  assert.equal(await canCreateAgentWorktree(workspaceRoot), true)
  assert.equal(worktree.cwd, join(worktree.path, 'packages', 'app'))
  assert.equal(await removeAgentWorktreeIfClean({
    path: worktree.path,
    branch: worktree.branch,
    baseSha: worktree.baseSha,
  }), 'removed')
})
