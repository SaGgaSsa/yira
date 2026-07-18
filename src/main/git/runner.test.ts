import { mkdtemp, mkdir, rm, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
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
  type GitCommandExecutor,
} from './runner'

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
} finally {
  await rm(tempRoot, { recursive: true, force: true })
  await rm(outsideRoot, { recursive: true, force: true })
}
