import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import { getGitDiffSummary, parseGitDiffNumstat } from './diff'

const execFileAsync = promisify(execFile)

async function git(rootPath: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', ['-C', rootPath, ...args], { encoding: 'utf8' })
  return result.stdout
}

async function initRepository(rootPath: string): Promise<void> {
  await git(rootPath, ['init', '--quiet'])
  await git(rootPath, ['config', 'user.email', 'yira-tests@example.com'])
  await git(rootPath, ['config', 'user.name', 'Yira Tests'])
  await git(rootPath, ['branch', '-M', 'main'])
}

async function commitAll(rootPath: string, message: string): Promise<void> {
  await git(rootPath, ['add', '--all'])
  await git(rootPath, ['commit', '--quiet', '-m', message])
}

async function createPushedRepository(prefix: string): Promise<{ rootPath: string; remotePath: string }> {
  const rootPath = await mkdtemp(join(tmpdir(), `${prefix}-`))
  const remotePath = await mkdtemp(join(tmpdir(), `${prefix}-remote-`))
  await git(remotePath, ['init', '--bare', '--quiet'])
  await initRepository(rootPath)
  await git(rootPath, ['remote', 'add', 'origin', remotePath])
  return { rootPath, remotePath }
}

async function pushMain(rootPath: string): Promise<void> {
  await git(rootPath, ['push', '--quiet', '--set-upstream', 'origin', 'main'])
}

test('parses numstat paths with tabs and consumes rename path fields once', () => {
  const parsed = parseGitDiffNumstat([
    '2\t1\tfile\twith-tab.ts',
    '3\t4\t',
    'old\tname.ts',
    'new\tname.ts',
  ].join('\0'))

  assert.deepEqual(parsed, [
    { additions: 2, deletions: 1, path: 'file\twith-tab.ts' },
    { additions: 3, deletions: 4, path: 'new\tname.ts' },
  ])
})

test('returns the net pushed diff plus staged, unstaged, and untracked text changes', async () => {
  const { rootPath, remotePath } = await createPushedRepository('yira-diff-net')
  try {
    await writeFile(join(rootPath, '.gitignore'), 'ignored.txt\n')
    await writeFile(join(rootPath, 'tracked.txt'), 'one\ntwo\n')
    await commitAll(rootPath, 'base')
    await pushMain(rootPath)

    await writeFile(join(rootPath, 'temporary.txt'), 'temporary\n')
    await commitAll(rootPath, 'temporary add')
    await git(rootPath, ['rm', '--quiet', 'temporary.txt'])
    await git(rootPath, ['commit', '--quiet', '-m', 'temporary revert'])

    await writeFile(join(rootPath, 'tracked.txt'), 'one\nthree\n')
    await commitAll(rootPath, 'local tracked change')

    await writeFile(join(rootPath, 'tracked.txt'), 'one\nthree\nfour\n')
    await git(rootPath, ['add', '--', 'tracked.txt'])
    await writeFile(join(rootPath, 'tracked.txt'), 'one\nthree\nfour\nfive\n')
    await writeFile(join(rootPath, 'staged.txt'), 'staged one\nstaged two\n')
    await git(rootPath, ['add', '--', 'staged.txt'])
    await writeFile(join(rootPath, 'untracked.txt'), 'new one\nnew two\nnew three\n')
    await writeFile(join(rootPath, 'ignored.txt'), 'ignored\n')

    assert.deepEqual(await getGitDiffSummary(rootPath), {
      additions: 8,
      deletions: 1,
      available: true,
    })
  } finally {
    await Promise.all([rm(rootPath, { recursive: true, force: true }), rm(remotePath, { recursive: true, force: true })])
  }
})

test('uses upstream fallback and merge-base to exclude remote-only changes', async () => {
  const { rootPath, remotePath } = await createPushedRepository('yira-diff-upstream')
  const clonePath = await mkdtemp(join(tmpdir(), 'yira-diff-clone-'))
  try {
    await writeFile(join(rootPath, 'shared.txt'), 'base\n')
    await commitAll(rootPath, 'base')
    await pushMain(rootPath)

    await git(clonePath, ['clone', '--quiet', '--branch', 'main', remotePath, '.'])
    await git(clonePath, ['config', 'user.email', 'yira-tests@example.com'])
    await git(clonePath, ['config', 'user.name', 'Yira Tests'])
    await writeFile(join(clonePath, 'remote-only.txt'), 'remote\n')
    await commitAll(clonePath, 'remote-only')
    await git(clonePath, ['push', '--quiet', 'origin', 'main'])
    await git(rootPath, ['fetch', '--quiet', 'origin', 'main'])

    await writeFile(join(rootPath, 'shared.txt'), 'local\n')
    await commitAll(rootPath, 'local-only')
    await git(rootPath, ['config', 'branch.main.pushRemote', 'missing'])

    assert.deepEqual(await getGitDiffSummary(rootPath), {
      additions: 1,
      deletions: 1,
      available: true,
    })
  } finally {
    await Promise.all([
      rm(rootPath, { recursive: true, force: true }),
      rm(remotePath, { recursive: true, force: true }),
      rm(clonePath, { recursive: true, force: true }),
    ])
  }
})

test('does not count binary files, double-count renames, or follow outside symlinks', async () => {
  const { rootPath, remotePath } = await createPushedRepository('yira-diff-files')
  const outsidePath = await mkdtemp(join(tmpdir(), 'yira-diff-outside-'))
  const isWindows = process.platform === 'win32'
  const weirdName = isWindows ? 'weird-name.txt' : 'weird\tname.txt'
  const newFileName = isWindows ? 'new-file.txt' : 'new\nfile.txt'
  try {
    await writeFile(join(rootPath, '.gitattributes'), '*.attrbin -diff\n')
    await writeFile(join(rootPath, 'rename-old.txt'), 'one\ntwo\nthree\n')
    await writeFile(join(rootPath, 'binary.bin'), Buffer.from([0, 1, 2, 3]))
    await writeFile(join(rootPath, weirdName), 'old\n')
    await commitAll(rootPath, 'base')
    await pushMain(rootPath)

    await git(rootPath, ['mv', '--', 'rename-old.txt', 'rename-new.txt'])
    await writeFile(join(rootPath, 'rename-new.txt'), 'one\nchanged\nthree\n')
    await writeFile(join(rootPath, 'binary.bin'), Buffer.from([0, 4, 5, 6]))
    await writeFile(join(rootPath, weirdName), 'new\n')
    await writeFile(join(rootPath, 'binary-new.bin'), Buffer.from([7, 8, 0, 9]))
    await writeFile(join(rootPath, 'literal.attrbin'), 'text\none\n')
    await writeFile(join(outsidePath, 'outside.txt'), Array.from({ length: 20 }, (_, index) => `outside ${index}`).join('\n'))
    let hasOutsideLink = true
    try {
      await symlink(join(outsidePath, 'outside.txt'), join(rootPath, 'outside-link'))
    } catch (error) {
      if (!isWindows || ((error as NodeJS.ErrnoException).code !== 'EPERM' && (error as NodeJS.ErrnoException).code !== 'EACCES')) throw error
      hasOutsideLink = false
    }
    await writeFile(join(rootPath, newFileName), 'a\nb\n')

    assert.deepEqual(await getGitDiffSummary(rootPath), {
      additions: hasOutsideLink ? 5 : 4,
      deletions: 2,
      available: true,
    })
  } finally {
    await Promise.all([
      rm(rootPath, { recursive: true, force: true }),
      rm(remotePath, { recursive: true, force: true }),
      rm(outsidePath, { recursive: true, force: true }),
    ])
  }
})

test('marks a staged deletion recreated as untracked unavailable instead of returning a false total', async () => {
  const { rootPath, remotePath } = await createPushedRepository('yira-diff-collision')
  try {
    await writeFile(join(rootPath, 'same.txt'), 'same\n')
    await commitAll(rootPath, 'base')
    await pushMain(rootPath)
    await git(rootPath, ['rm', '--quiet', 'same.txt'])
    await writeFile(join(rootPath, 'same.txt'), 'same\n')

    assert.deepEqual(await getGitDiffSummary(rootPath), {
      additions: 0,
      deletions: 0,
      available: false,
    })
  } finally {
    await Promise.all([rm(rootPath, { recursive: true, force: true }), rm(remotePath, { recursive: true, force: true })])
  }
})

test('compares a branch without upstream with the remote default branch', async () => {
  const { rootPath, remotePath } = await createPushedRepository('yira-diff-no-upstream')
  try {
    await writeFile(join(rootPath, 'file.txt'), 'base\n')
    await commitAll(rootPath, 'base')
    await pushMain(rootPath)
    await git(rootPath, ['remote', 'set-head', 'origin', 'main'])

    await git(rootPath, ['checkout', '--quiet', '-b', 'feature'])
    await writeFile(join(rootPath, 'feature.txt'), 'one\ntwo\n')
    await commitAll(rootPath, 'feature commit')
    await writeFile(join(rootPath, 'file.txt'), 'changed\n')

    assert.deepEqual(await getGitDiffSummary(rootPath), {
      additions: 3,
      deletions: 1,
      available: true,
    })
  } finally {
    await Promise.all([rm(rootPath, { recursive: true, force: true }), rm(remotePath, { recursive: true, force: true })])
  }
})

test('reports uncommitted changes without remote references and is unavailable without HEAD', async () => {
  const noReferencePath = await mkdtemp(join(tmpdir(), 'yira-diff-no-reference-'))
  const noHeadPath = await mkdtemp(join(tmpdir(), 'yira-diff-no-head-'))
  try {
    await initRepository(noReferencePath)
    await writeFile(join(noReferencePath, 'file.txt'), 'one\n')
    await commitAll(noReferencePath, 'local')
    assert.deepEqual(await getGitDiffSummary(noReferencePath), {
      additions: 0,
      deletions: 0,
      available: true,
    })
    await writeFile(join(noReferencePath, 'file.txt'), 'one\ntwo\n')
    assert.deepEqual(await getGitDiffSummary(noReferencePath), {
      additions: 1,
      deletions: 0,
      available: true,
    })

    await initRepository(noHeadPath)
    assert.deepEqual(await getGitDiffSummary(noHeadPath), {
      additions: 0,
      deletions: 0,
      available: false,
    })
  } finally {
    await Promise.all([rm(noReferencePath, { recursive: true, force: true }), rm(noHeadPath, { recursive: true, force: true })])
  }
})

test('a real push resets the pending diff to zero', async () => {
  const { rootPath, remotePath } = await createPushedRepository('yira-diff-push')
  try {
    await writeFile(join(rootPath, 'file.txt'), 'base\n')
    await commitAll(rootPath, 'base')
    await pushMain(rootPath)
    await writeFile(join(rootPath, 'file.txt'), 'changed\n')
    await commitAll(rootPath, 'pending')

    assert.deepEqual((await getGitDiffSummary(rootPath)).available, true)
    await pushMain(rootPath)
    assert.deepEqual(await getGitDiffSummary(rootPath), {
      additions: 0,
      deletions: 0,
      available: true,
    })
  } finally {
    await Promise.all([rm(rootPath, { recursive: true, force: true }), rm(remotePath, { recursive: true, force: true })])
  }
})
