import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'node:util'
import test from 'node:test'
import {
  parseGitStatus,
  resolveOriginWebUrl,
  resolveGitTargetPath,
  getGitStatus,
  commitGitChanges,
  syncGitRepository,
  stageGitFiles,
  stageGitFile,
  unstageGitFile,
  getGitCommitHistory,
  parseGitCommitLog,
  type GitCommandExecutor,
} from './runner'
import { discoverGitRepositories, resolveConfiguredGitRepository } from './repositories'

const execFileAsync = promisify(execFile)

async function initGitRepository(path: string): Promise<void> {
  await execFileAsync('git', ['-C', path, 'init', '--quiet'])
}

const parsed = parseGitStatus([
  '## feature/source-control...origin/feature/source-control',
  'M  staged.ts',
  ' M unstaged.ts',
  'MM partial.ts',
  'A  added.ts',
  ' D deleted.ts',
  'R  renamed.ts',
  'old-name.ts',
  '?? untracked.ts',
  '',
].join('\0'))

if (parsed.branch !== 'feature/source-control') throw new Error('status parser must extract the current branch')
if (parsed.staged.map((change) => change.path).join(',') !== 'staged.ts,partial.ts,added.ts,renamed.ts') {
  throw new Error('status parser must classify staged changes')
}
if (parsed.unstaged.map((change) => change.path).join(',') !== 'unstaged.ts,partial.ts,deleted.ts,untracked.ts') {
  throw new Error('status parser must classify unstaged changes and untracked files')
}
const renamed = parsed.staged.find((change) => change.path === 'renamed.ts')
if (renamed?.originalPath !== 'old-name.ts' || renamed.status !== 'renamed') {
  throw new Error('status parser must retain rename origins')
}

const syncStatus = parseGitStatus('## main...origin/main [ahead 2, behind 1]\0')
if (syncStatus.branch !== 'main' || syncStatus.upstream !== 'origin/main' || syncStatus.ahead !== 2 || syncStatus.behind !== 1) {
  throw new Error('status parser must expose the upstream and divergence counts')
}

const noUpstreamStatus = parseGitStatus('## main\0')
if (noUpstreamStatus.upstream !== undefined || noUpstreamStatus.ahead !== 0 || noUpstreamStatus.behind !== 0) {
  throw new Error('status parser must default missing upstream divergence to zero')
}

if (resolveOriginWebUrl('https://github.com/yira/yira.git') !== 'https://github.com/yira/yira') {
  throw new Error('HTTP remotes must resolve to repository web URLs')
}
if (resolveOriginWebUrl('git@github.com:yira/yira.git') !== 'https://github.com/yira/yira') {
  throw new Error('SSH remotes must resolve to repository web URLs')
}
if (resolveOriginWebUrl('ssh://git@gitlab.example.com/team/yira.git') !== 'https://gitlab.example.com/team/yira') {
  throw new Error('SSH URL remotes must resolve to repository web URLs')
}
if (resolveOriginWebUrl('ssh://git@gitlab.example.com:2222/team/yira.git') !== 'https://gitlab.example.com/team/yira') {
  throw new Error('SSH URL remotes must not carry their SSH port into repository web URLs')
}
if (resolveOriginWebUrl('file:///tmp/yira.git') !== undefined) {
  throw new Error('unsupported remotes must not produce a web URL')
}

const tempRoot = await mkdtemp(join(tmpdir(), 'yira-git-runner-'))
const outsideRoot = await mkdtemp(join(tmpdir(), 'yira-git-runner-outside-'))
try {
  await mkdir(join(tempRoot, 'src'))
  await writeFile(join(tempRoot, 'src', 'file.ts'), '')
  await symlink(outsideRoot, join(tempRoot, 'escape'))

  const resolved = await resolveGitTargetPath(tempRoot, 'src/file.ts')
  if (resolved.relativePath !== 'src/file.ts') throw new Error('safe file paths must resolve relative to the workspace root')

  const deleted = await resolveGitTargetPath(tempRoot, 'src/deleted.ts')
  if (deleted.relativePath !== 'src/deleted.ts') {
    throw new Error('missing final paths must remain valid so deleted tracked files can be staged')
  }

  for (const unsafePath of ['../secret', '/tmp/secret', 'C:\\temp\\secret', 'escape/secret']) {
    try {
      await resolveGitTargetPath(tempRoot, unsafePath)
      throw new Error(`unsafe path ${unsafePath} must be rejected`)
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Path')) throw error
    }
  }

  const calls: Array<{ command: string; args: string[] }> = []
  const executor: GitCommandExecutor = async (command, args) => {
    calls.push({ command, args })
    return { stdout: '', stderr: '' }
  }
  await stageGitFile(tempRoot, 'src/file.ts', executor)
  if (calls.length !== 1 || calls[0].command !== 'git' || calls[0].args.join('|') !== ['-C', tempRoot, 'add', '--', 'src/file.ts'].join('|')) {
    throw new Error('stage must invoke git with fixed arguments and a path separator')
  }
  await unstageGitFile(tempRoot, 'src/file.ts', executor)
  if (!calls[1] || calls[1].args.join('|') !== ['-C', tempRoot, 'restore', '--staged', '--', 'src/file.ts'].join('|')) {
    throw new Error('unstage must invoke git with fixed arguments and a path separator')
  }
  await stageGitFiles(tempRoot, ['src/file.ts', 'src/deleted.ts'], executor)
  if (!calls[2] || calls[2].args.join('|') !== ['-C', tempRoot, 'add', '--', 'src/file.ts', 'src/deleted.ts'].join('|')) {
    throw new Error('renames must stage both original and destination paths in one fixed Git invocation')
  }

  await commitGitChanges(tempRoot, '  Ship source control  ', executor)
  if (!calls[3] || calls[3].args.join('|') !== ['-C', tempRoot, 'commit', '-m', 'Ship source control'].join('|')) {
    throw new Error('commit must invoke git with a trimmed message and fixed arguments')
  }
  for (const message of ['', '   ', 'a'.repeat(10001)]) {
    try {
      await commitGitChanges(tempRoot, message, executor)
      throw new Error('invalid commit messages must be rejected')
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Commit message')) throw error
    }
  }

  const syncCalls: string[] = []
  const syncExecutor: GitCommandExecutor = async (_command, args) => {
    syncCalls.push(args.join('|'))
    if (args.includes('rev-parse')) return { stdout: 'origin/main\n', stderr: '' }
    return { stdout: '', stderr: '' }
  }
  await syncGitRepository(tempRoot, syncExecutor)
  if (syncCalls.join('\n') !== [
    ['-C', tempRoot, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'].join('|'),
    ['-C', tempRoot, 'pull', '--ff-only'].join('|'),
    ['-C', tempRoot, 'push'].join('|'),
  ].join('\n')) {
    throw new Error('sync must require upstream, pull fast-forward-only, then push')
  }

  const failedSyncCalls: string[] = []
  try {
    await syncGitRepository(tempRoot, async (_command, args) => {
      failedSyncCalls.push(args.join('|'))
      if (args.includes('rev-parse')) return { stdout: 'origin/main\n', stderr: '' }
      if (args.includes('pull')) throw new Error('Cannot fast-forward')
      return { stdout: '', stderr: '' }
    })
    throw new Error('sync must fail when the pull fails')
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'Cannot fast-forward') throw error
  }
  if (failedSyncCalls.some((args) => args.includes('|push'))) {
    throw new Error('sync must not push after a failed pull')
  }

  try {
    await syncGitRepository(tempRoot, async () => {
      throw new Error("fatal: no such branch: 'main'")
    })
    throw new Error('sync must reject repositories without an upstream')
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'Current branch has no upstream configured') throw error
  }

  try {
    await syncGitRepository(tempRoot, async () => {
      throw Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' })
    })
    throw new Error('sync must preserve a missing Git error')
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'Git is not available') throw error
  }

  const invalidRepository = await getGitStatus(tempRoot, async () => {
    throw new Error('fatal: not a git repository')
  })
  if (invalidRepository.isRepository || invalidRepository.error !== 'fatal: not a git repository') {
    throw new Error('invalid repositories must return a retryable status result')
  }

  const unavailableGit = await getGitStatus(tempRoot, async () => {
    throw Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' })
  })
  if (unavailableGit.isRepository || unavailableGit.error !== 'Git is not available') {
    throw new Error('missing Git must return an availability error')
  }

  const punctuationHistory = parseGitCommitLog('abc1234\u0000Fix punctuation: commas, [brackets], pipe | and %\u00002026-08-09T12:00:00-03:00\n')
  if (punctuationHistory.length !== 1 || punctuationHistory[0].shortHash !== 'abc1234' || punctuationHistory[0].subject !== 'Fix punctuation: commas, [brackets], pipe | and %' || punctuationHistory[0].commitDate !== '2026-08-09T12:00:00-03:00') {
    throw new Error('commit history parser must preserve short hashes, punctuation in subjects, and dates')
  }

  const outgoingLog = [
    'local6\u0000Local commit 6\u00002026-08-09T12:06:00-03:00',
    'local5\u0000Local commit 5\u00002026-08-09T12:05:00-03:00',
    'local4\u0000Local commit 4\u00002026-08-09T12:04:00-03:00',
    'local3\u0000Local commit 3\u00002026-08-09T12:03:00-03:00',
    'local2\u0000Local commit 2\u00002026-08-09T12:02:00-03:00',
    'local1\u0000Local commit 1\u00002026-08-09T12:01:00-03:00',
  ].join('\n')
  const upstreamLog = [
    'remote5\u0000Remote commit 5\u00002026-08-09T11:05:00-03:00',
    'remote4\u0000Remote commit 4\u00002026-08-09T11:04:00-03:00',
    'remote3\u0000Remote commit 3\u00002026-08-09T11:03:00-03:00',
    'remote2\u0000Remote commit 2\u00002026-08-09T11:02:00-03:00',
    'remote1\u0000Remote commit 1\u00002026-08-09T11:01:00-03:00',
  ].join('\n')
  const localLog = [
    'local5\u0000Local commit 5\u00002026-08-09T12:05:00-03:00',
    'local4\u0000Local commit 4\u00002026-08-09T12:04:00-03:00',
    'local3\u0000Local commit 3\u00002026-08-09T12:03:00-03:00',
    'local2\u0000Local commit 2\u00002026-08-09T12:02:00-03:00',
    'local1\u0000Local commit 1\u00002026-08-09T12:01:00-03:00',
  ].join('\n')
  const upstreamHistoryCalls: string[][] = []
  const upstreamHistory = await getGitCommitHistory(tempRoot, async (_command, args) => {
    upstreamHistoryCalls.push(args)
    if (args.includes('config')) return { stdout: 'branch.main.remote\norigin\0branch.main.merge\nrefs/heads/main\0', stderr: '' }
    if (args.includes('symbolic-ref')) return { stdout: 'main\n', stderr: '' }
    if (args.includes('rev-parse')) return { stdout: 'origin/main\n', stderr: '' }
    if (args.includes('origin/main..HEAD')) return { stdout: outgoingLog, stderr: '' }
    if (args.includes('origin/main')) return { stdout: upstreamLog, stderr: '' }
    throw new Error(`unexpected history command: ${args.join('|')}`)
  })
  if (upstreamHistory.error || upstreamHistory.outgoing.length !== 6 || upstreamHistory.upstream.length !== 5 || upstreamHistory.local.length !== 0) {
    throw new Error('history with an upstream must return all outgoing commits, five upstream commits, and no local fallback history')
  }
  if (upstreamHistory.outgoing[0].shortHash !== 'local6' || upstreamHistory.upstream[0].shortHash !== 'remote5' || upstreamHistory.upstream[4].shortHash !== 'remote1') {
    throw new Error('history with an upstream must preserve Git log order and commit summaries')
  }
  const outgoingHistoryCall = upstreamHistoryCalls.find((args) => args.includes('origin/main..HEAD'))
  const upstreamHistoryCall = upstreamHistoryCalls.find((args) => args.includes('origin/main') && !args.includes('origin/main..HEAD'))
  if (upstreamHistoryCalls.length !== 5 || outgoingHistoryCall?.includes('-5') || !upstreamHistoryCall?.includes('-5')) {
    throw new Error('history commands must leave outgoing commits uncapped and limit upstream history to five')
  }

  const localHistoryCalls: string[][] = []
  const noUpstreamHistory = await getGitCommitHistory(tempRoot, async (_command, args) => {
    localHistoryCalls.push(args)
    if (args.includes('config')) return { stdout: '', stderr: '' }
    if (args.includes('symbolic-ref')) return { stdout: 'main\n', stderr: '' }
    if (args.includes('rev-parse')) throw new Error('fatal: no upstream configured')
    if (args.includes('HEAD')) return { stdout: localLog, stderr: '' }
    throw new Error(`unexpected local history command: ${args.join('|')}`)
  })
  if (noUpstreamHistory.error || noUpstreamHistory.outgoing.length !== 0 || noUpstreamHistory.upstream.length !== 0 || noUpstreamHistory.local.length !== 5) {
    throw new Error('history without an upstream must return five local commits and empty upstream/outgoing lists')
  }
  if (noUpstreamHistory.local[0].shortHash !== 'local5' || localHistoryCalls.length !== 3 || !localHistoryCalls[2].includes('-5')) {
    throw new Error('history without an upstream must read recent HEAD commits with a five-commit limit')
  }

  const noCommitHistory = await getGitCommitHistory(tempRoot, async (_command, args) => {
    if (args.includes('config')) return { stdout: '', stderr: '' }
    if (args.includes('symbolic-ref')) return { stdout: 'main\n', stderr: '' }
    if (args.includes('rev-parse')) throw new Error('fatal: no upstream configured')
    throw new Error('fatal: your current branch does not have any commits yet')
  })
  if (noCommitHistory.outgoing.length !== 0 || noCommitHistory.upstream.length !== 0 || noCommitHistory.local.length !== 0 || !noCommitHistory.error?.includes('does not have any commits yet')) {
    throw new Error('empty repositories must return empty history with an informative non-fatal error')
  }

  const failedHistory = await getGitCommitHistory(tempRoot, async (_command, args) => {
    if (args.includes('config')) return { stdout: 'branch.main.remote\norigin\0branch.main.merge\nrefs/heads/main\0', stderr: '' }
    if (args.includes('symbolic-ref')) return { stdout: 'main\n', stderr: '' }
    if (args.includes('rev-parse')) return { stdout: 'origin/main\n', stderr: '' }
    throw new Error('fatal: unable to read commit history')
  })
  if (failedHistory.outgoing.length !== 0 || failedHistory.upstream.length !== 0 || failedHistory.local.length !== 0 || failedHistory.error !== 'fatal: unable to read commit history') {
    throw new Error('history command failures must return empty lists and preserve an informative error')
  }

  const goneHistoryCalls: string[][] = []
  const goneUpstreamHistory = await getGitCommitHistory(tempRoot, async (_command, args) => {
    goneHistoryCalls.push(args)
    if (args.includes('config')) return { stdout: 'branch.main.remote\norigin\0branch.main.merge\nrefs/heads/main\0', stderr: '' }
    if (args.includes('symbolic-ref')) return { stdout: 'main\n', stderr: '' }
    if (args.includes('rev-parse')) throw new Error("fatal: upstream branch 'origin/main' is gone")
    if (args.includes('HEAD')) return { stdout: localLog, stderr: '' }
    throw new Error(`unexpected gone-upstream history command: ${args.join('|')}`)
  })
  if (!goneUpstreamHistory.error?.includes('gone') || goneUpstreamHistory.outgoing.length !== 0 || goneUpstreamHistory.upstream.length !== 0 || goneUpstreamHistory.local.length !== 0 || goneHistoryCalls.some((args) => args.includes('log') && args.includes('HEAD'))) {
    throw new Error('configured but missing upstreams must return an informative error without falling back to HEAD history')
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true })
  await rm(outsideRoot, { recursive: true, force: true })
}

test('discovers Git roots at workspace depth zero, one, and two only', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'yira-git-repositories-'))
  const outsidePath = await mkdtemp(join(tmpdir(), 'yira-git-repositories-outside-'))
  try {
    await initGitRepository(rootPath)

    const alphaPath = join(rootPath, 'alpha')
    const zetaPath = join(rootPath, 'zeta')
    const containerPath = join(rootPath, 'container')
    const betaPath = join(containerPath, 'beta')
    const deepPath = join(betaPath, 'deep')
    const firstPath = join(rootPath, 'first')
    const secondPath = join(rootPath, 'second')
    const firstRepositoryPath = join(firstPath, 'repository')
    const secondRepositoryPath = join(secondPath, 'repository')
    const parentPath = join(rootPath, 'parent')
    const parentChildPath = join(parentPath, 'child')

    await mkdir(alphaPath)
    await mkdir(zetaPath)
    await mkdir(betaPath, { recursive: true })
    await mkdir(deepPath)
    await mkdir(firstRepositoryPath, { recursive: true })
    await mkdir(secondRepositoryPath, { recursive: true })
    await mkdir(parentChildPath, { recursive: true })

    await initGitRepository(alphaPath)
    await initGitRepository(zetaPath)
    await initGitRepository(betaPath)
    await initGitRepository(deepPath)
    await initGitRepository(firstRepositoryPath)
    await initGitRepository(secondRepositoryPath)
    await initGitRepository(parentPath)

    for (const ignoredName of [
      '.git',
      'node_modules',
      'dist',
      'dist-electron',
      'build',
      'release',
      'coverage',
      '.next',
      '.vite',
    ]) {
      const ignoredPath = join(containerPath, ignoredName)
      await mkdir(ignoredPath, { recursive: true })
      await initGitRepository(ignoredPath)
    }

    const outsideRepositoryPath = join(outsidePath, 'linked-repository')
    await mkdir(outsideRepositoryPath)
    await initGitRepository(outsideRepositoryPath)
    await symlink(outsideRepositoryPath, join(rootPath, 'linked'))

    const repositories = await discoverGitRepositories(rootPath)

    assert.deepEqual(repositories.map(({ relativePath }) => relativePath), [
      'alpha',
      'container/beta',
      'parent',
      'first/repository',
      'second/repository',
      '.',
      'zeta',
    ])
    assert.deepEqual(repositories.map(({ name }) => name), [
      'alpha',
      'beta',
      'parent',
      'repository',
      'repository',
      rootPath.split('/').at(-1),
      'zeta',
    ])
    assert.equal(repositories.some(({ relativePath }) => relativePath === 'container/beta/deep'), false)
    assert.equal(repositories.some(({ relativePath }) => relativePath === 'parent/child'), false)
    assert.equal(repositories.some(({ relativePath }) => relativePath === 'linked'), false)
    assert.equal(repositories.some(({ relativePath }) => relativePath.includes('node_modules')), false)

    const shallowRepositories = await discoverGitRepositories(rootPath, 1)
    assert.deepEqual(shallowRepositories.map(({ relativePath }) => relativePath).sort(), [
      '.', 'alpha', 'parent', 'zeta',
    ])
  } finally {
    await rm(rootPath, { recursive: true, force: true })
    await rm(outsidePath, { recursive: true, force: true })
  }
})

test('resolves only a configured live Git root inside the workspace', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'yira-git-repository-resolver-'))
  const outsidePath = await mkdtemp(join(tmpdir(), 'yira-git-repository-resolver-outside-'))
  try {
    const selectedPath = join(rootPath, 'selected')
    const otherPath = join(rootPath, 'other')
    const parentPath = join(rootPath, 'parent')
    const parentChildPath = join(parentPath, 'child')
    const outsideRepositoryPath = join(outsidePath, 'outside')
    await mkdir(selectedPath)
    await mkdir(otherPath)
    await mkdir(parentChildPath, { recursive: true })
    await mkdir(outsideRepositoryPath)
    await initGitRepository(selectedPath)
    await initGitRepository(otherPath)
    await initGitRepository(parentPath)
    await initGitRepository(outsideRepositoryPath)
    await symlink(outsideRepositoryPath, join(rootPath, 'linked'))

    const resolved = await resolveConfiguredGitRepository(rootPath, ['selected'], 'selected')
    assert.equal(resolved.relativePath, 'selected')
    assert.equal(resolved.absolutePath, selectedPath)
    assert.equal(resolved.repository.name, 'selected')

    const rejectedInputs: unknown[] = [
      'other',
      '../outside',
      '/tmp/outside',
      'C:/outside',
      'selected/../other',
      'linked',
      'parent/child',
      42,
      '',
    ]
    for (const requestedPath of rejectedInputs) {
      await assert.rejects(
        resolveConfiguredGitRepository(rootPath, ['selected'], requestedPath),
        /repository|relative|traversal|workspace|Git/i,
      )
    }

    await rm(selectedPath, { recursive: true, force: true })
    await assert.rejects(
      resolveConfiguredGitRepository(rootPath, ['selected'], 'selected'),
      /exist|available|repository|directory/i,
    )

    await assert.rejects(
      resolveConfiguredGitRepository(rootPath, 'selected', 'selected'),
      /configured|array|selection/i,
    )
  } finally {
    await rm(rootPath, { recursive: true, force: true })
    await rm(outsidePath, { recursive: true, force: true })
  }
})
