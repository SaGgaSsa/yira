import assert from 'node:assert/strict'
import { access, mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import test from 'node:test'

import { execGitCommand, type GitCommandExecutor, type GitCommandResult } from '../git/runner'
import {
  createAgentWorkspaceWorktrees,
  listWorkspaceWorktrees,
  parseGitWorktreeList,
  removeAgentWorktreeIfClean,
  resolveWorkspaceWorktreeRepositories,
  worktreePathsOverlap,
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
  // Windows CI reports tmpdir() with 8.3 short names (RUNNER~1); Git and
  // realpath return the long form, so compare against the canonical path.
  return realpath(await mkdtemp(join(tmpdir(), 'yira-agent-worktree-')))
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

function toGitPath(value: string): string {
  return value.replaceAll('\\', '/')
}

function worktreeGit(
  lists: Map<string, string>,
  statuses: Map<string, string> = new Map(),
): GitCommandExecutor {
  return async (_command, args) => {
    const pathIndex = args.indexOf('-C')
    const target = pathIndex >= 0 ? args[pathIndex + 1] : ''
    if (args.includes('worktree') && args.includes('list')) {
      const output = lists.get(target)
      if (output === undefined) throw new Error(`Unexpected worktree list: ${target}`)
      return result(output)
    }
    if (args.includes('status')) return result(statuses.get(target) ?? '')
    throw new Error(`Unexpected Git command: ${args.join(' ')}`)
  }
}

test('parses worktree blocks with branches, detached HEADs, bare and prunable entries', () => {
  const alphaPath = join(tmpdir(), 'yira-worktree-parse', 'alpha')
  const detachedPath = join(tmpdir(), 'yira-worktree-parse', 'detached')
  const barePath = join(tmpdir(), 'yira-worktree-parse', 'bare')
  const prunablePath = join(tmpdir(), 'yira-worktree-parse', 'prunable')
  const output = [
    `worktree ${toGitPath(alphaPath)}`,
    `HEAD ${'a'.repeat(40)}`,
    'branch refs/heads/feature/topic',
    '',
    `worktree ${toGitPath(detachedPath)}`,
    `HEAD ${'b'.repeat(40)}`,
    'detached',
    '',
    `worktree ${toGitPath(barePath)}`,
    `HEAD ${'c'.repeat(40)}`,
    'bare',
    '',
    `worktree ${toGitPath(prunablePath)}`,
    `HEAD ${'d'.repeat(40)}`,
    'branch refs/heads/old/topic',
    'prunable gitdir file points to non-existent location',
    '',
  ].join('\r\n')

  assert.deepEqual(parseGitWorktreeList(output), [
    { path: resolve(alphaPath), head: 'a'.repeat(40), branch: 'feature/topic', bare: false, prunable: false },
    { path: resolve(detachedPath), head: 'b'.repeat(40), bare: false, prunable: false },
    { path: resolve(barePath), head: 'c'.repeat(40), bare: true, prunable: false },
    { path: resolve(prunablePath), head: 'd'.repeat(40), branch: 'old/topic', bare: false, prunable: true },
  ])
})

test('groups the same branch of two modules under their shared worktree folder', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const workspaceRoot = join(temporaryDirectory, 'workspace')
  const alphaRepository = join(workspaceRoot, 'alpha')
  const zetaRepository = join(workspaceRoot, 'zeta')
  const groupRoot = join(temporaryDirectory, 'worktrees', 'workspace-abc12345')
  const alphaWorktree = join(groupRoot, 'alpha')
  const zetaWorktree = join(groupRoot, 'zeta')
  await Promise.all([
    mkdir(alphaRepository, { recursive: true }),
    mkdir(zetaRepository, { recursive: true }),
    mkdir(alphaWorktree, { recursive: true }),
    mkdir(zetaWorktree, { recursive: true }),
  ])
  const executor = worktreeGit(
    new Map([
      [alphaRepository, [
        `worktree ${toGitPath(alphaRepository)}`,
        `HEAD ${'0'.repeat(40)}`,
        'branch refs/heads/main',
        '',
        `worktree ${toGitPath(alphaWorktree)}`,
        `HEAD ${'1'.repeat(40)}`,
        'branch refs/heads/feature/shared',
        '',
      ].join('\n')],
      [zetaRepository, [
        `worktree ${toGitPath(zetaRepository)}`,
        `HEAD ${'0'.repeat(40)}`,
        'branch refs/heads/main',
        '',
        `worktree ${toGitPath(zetaWorktree)}`,
        `HEAD ${'2'.repeat(40)}`,
        'branch refs/heads/feature/shared',
        '',
      ].join('\n')],
    ]),
    new Map([
      [alphaWorktree, ' M a.txt\n?? b.txt\n'],
      [zetaWorktree, ''],
    ]),
  )

  assert.deepEqual(await listWorkspaceWorktrees({
    rootPath: workspaceRoot,
    configuredRepositoryPaths: [],
    worktreesDirectory: join(temporaryDirectory, 'worktrees'),
    activeRoots: [],
  }, {
    executor,
    resolveWorkspaceWorktreeRepositories: async () => [
      { relativePath: 'alpha', absolutePath: alphaRepository },
      { relativePath: 'zeta', absolutePath: zetaRepository },
    ],
  }), [{
    path: groupRoot,
    branch: 'feature/shared',
    head: '1111111',
    repositories: [
      { relativePath: 'alpha', name: 'alpha' },
      { relativePath: 'zeta', name: 'zeta' },
    ],
    createdByYira: true,
    changedFiles: 2,
    activeSessions: 0,
    missing: false,
  }])
})

test('keeps the same branch in separate folders as separate options', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const workspaceRoot = join(temporaryDirectory, 'workspace')
  const alphaRepository = join(workspaceRoot, 'alpha')
  const zetaRepository = join(workspaceRoot, 'zeta')
  const alphaWorktree = join(temporaryDirectory, 'clones', 'one')
  const zetaWorktree = join(temporaryDirectory, 'clones', 'two')
  await Promise.all([
    mkdir(alphaWorktree, { recursive: true }),
    mkdir(zetaWorktree, { recursive: true }),
  ])
  const executor = worktreeGit(
    new Map([
      [alphaRepository, [
        `worktree ${toGitPath(alphaRepository)}`,
        `HEAD ${'0'.repeat(40)}`,
        'branch refs/heads/main',
        '',
        `worktree ${toGitPath(alphaWorktree)}`,
        `HEAD ${'a'.repeat(40)}`,
        'branch refs/heads/feature/topic',
        '',
      ].join('\n')],
      [zetaRepository, [
        `worktree ${toGitPath(zetaRepository)}`,
        `HEAD ${'0'.repeat(40)}`,
        'branch refs/heads/main',
        '',
        `worktree ${toGitPath(zetaWorktree)}`,
        `HEAD ${'b'.repeat(40)}`,
        'branch refs/heads/feature/topic',
        '',
      ].join('\n')],
    ]),
  )

  const options = await listWorkspaceWorktrees({
    rootPath: workspaceRoot,
    configuredRepositoryPaths: [],
    worktreesDirectory: join(temporaryDirectory, 'worktrees'),
    activeRoots: [],
  }, {
    executor,
    resolveWorkspaceWorktreeRepositories: async () => [
      { relativePath: 'alpha', absolutePath: alphaRepository },
      { relativePath: 'zeta', absolutePath: zetaRepository },
    ],
  })

  assert.deepEqual(options.map(({ path }) => path), [alphaWorktree, zetaWorktree])
  assert.deepEqual(options.map(({ repositories }) => repositories), [
    [{ relativePath: 'alpha', name: 'alpha' }],
    [{ relativePath: 'zeta', name: 'zeta' }],
  ])
  assert.ok(options.every(({ branch }) => branch === 'feature/topic'))
})

test('excludes the repository checkout itself from the listed worktrees', async () => {
  const repository = join(tmpdir(), 'yira-worktree-main', 'alpha')
  const executor = worktreeGit(new Map([
    [repository, [
      `worktree ${toGitPath(repository)}`,
      `HEAD ${'a'.repeat(40)}`,
      'branch refs/heads/main',
      '',
      `worktree ${toGitPath(join(tmpdir(), 'yira-worktree-main', 'bare'))}`,
      `HEAD ${'b'.repeat(40)}`,
      'bare',
      '',
    ].join('\n')],
  ]))

  assert.deepEqual(await listWorkspaceWorktrees({
    rootPath: join(tmpdir(), 'yira-worktree-main'),
    configuredRepositoryPaths: [],
    worktreesDirectory: join(tmpdir(), 'yira-worktree-main-worktrees'),
    activeRoots: [],
  }, {
    executor,
    resolveWorkspaceWorktreeRepositories: async () => [
      { relativePath: '.', absolutePath: repository },
    ],
  }), [])
})

test('continues listing worktrees when one repository fails', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const workspaceRoot = join(temporaryDirectory, 'workspace')
  const brokenRepository = join(workspaceRoot, 'broken')
  const workingRepository = join(workspaceRoot, 'working')
  const workingWorktree = join(temporaryDirectory, 'clones', 'working')
  await mkdir(workingWorktree, { recursive: true })
  const executor = worktreeGit(new Map([
    [workingRepository, [
      `worktree ${toGitPath(workingRepository)}`,
      `HEAD ${'0'.repeat(40)}`,
      'branch refs/heads/main',
      '',
      `worktree ${toGitPath(workingWorktree)}`,
      `HEAD ${'c'.repeat(40)}`,
      'branch refs/heads/feature/working',
      '',
    ].join('\n')],
  ]))

  const options = await listWorkspaceWorktrees({
    rootPath: workspaceRoot,
    configuredRepositoryPaths: [],
    worktreesDirectory: join(temporaryDirectory, 'worktrees'),
    activeRoots: [],
  }, {
    executor,
    resolveWorkspaceWorktreeRepositories: async () => [
      { relativePath: 'broken', absolutePath: brokenRepository },
      { relativePath: 'working', absolutePath: workingRepository },
    ],
  })

  assert.deepEqual(options.map(({ path, repositories }) => ({ path, repositories })), [{
    path: workingWorktree,
    repositories: [{ relativePath: 'working', name: 'working' }],
  }])
})

test('counts live sessions that overlap a listed worktree path', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const workspaceRoot = join(temporaryDirectory, 'workspace')
  const worktreesDirectory = join(temporaryDirectory, 'worktrees')
  const worktreePath = join(worktreesDirectory, 'workspace-live1234')
  await mkdir(worktreePath, { recursive: true })
  const executor = worktreeGit(new Map([
    [workspaceRoot, [
      `worktree ${toGitPath(workspaceRoot)}`,
      `HEAD ${'0'.repeat(40)}`,
      'branch refs/heads/main',
      '',
      `worktree ${toGitPath(worktreePath)}`,
      `HEAD ${'d'.repeat(40)}`,
      'branch refs/heads/feature/live',
      '',
    ].join('\n')],
  ]))

  const options = await listWorkspaceWorktrees({
    rootPath: workspaceRoot,
    configuredRepositoryPaths: [],
    worktreesDirectory,
    activeRoots: [
      worktreePath,
      join(worktreePath, 'alpha'),
      worktreesDirectory,
      join(temporaryDirectory, 'unrelated'),
    ],
  }, {
    executor,
    resolveWorkspaceWorktreeRepositories: async () => [
      { relativePath: '.', absolutePath: workspaceRoot },
    ],
  })

  assert.equal(options.length, 1)
  assert.equal(options[0].path, worktreePath)
  assert.equal(options[0].activeSessions, 3)
  assert.equal(options[0].repositories[0].name, basename(workspaceRoot))
  assert.equal(worktreePathsOverlap(worktreePath, join(worktreePath, 'alpha')), true)
  assert.equal(worktreePathsOverlap(worktreePath, join(temporaryDirectory, 'unrelated')), false)
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
