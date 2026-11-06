import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { watch as fsWatch } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import {
  createWorkspaceDiffWatcher,
  isRelevantGitDirEvent,
  isRelevantGitRefsEvent,
  resolveGitWatchTargets,
  type GitDirectoryWatchFunction,
  type GitDirectoryWatcher,
  type GitWatchTarget,
  type WorkspaceDiffWatcher,
} from './workspaceDiffWatcher'

const execFileAsync = promisify(execFile)

interface FakeWatcher {
  path: string
  recursive: boolean
  listener: (eventType: 'rename' | 'change', filename: string | null) => void
  errorListeners: Array<(error: Error) => void>
  closeCount: number
}

function createFakeWatch(): { watch: GitDirectoryWatchFunction; watchers: FakeWatcher[] } {
  const watchers: FakeWatcher[] = []
  return {
    watchers,
    watch(path, options, listener) {
      const entry: FakeWatcher = {
        path,
        recursive: options.recursive,
        listener,
        errorListeners: [],
        closeCount: 0,
      }
      watchers.push(entry)
      const watcher: GitDirectoryWatcher = {
        on(event, errorListener) {
          if (event === 'error') entry.errorListeners.push(errorListener)
        },
        close() {
          entry.closeCount += 1
        },
      }
      return watcher
    },
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
}

async function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = 5_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function gitDirTarget(path = '/repo/.git'): GitWatchTarget {
  return { path, recursive: false, isRelevant: isRelevantGitDirEvent }
}

async function git(rootPath: string, args: string[]): Promise<void> {
  await execFileAsync('git', ['-C', rootPath, ...args], { encoding: 'utf8' })
}

test('filters Git directory and refs events', () => {
  for (const filename of [null, 'HEAD', 'index', 'packed-refs']) {
    assert.equal(isRelevantGitDirEvent(filename), true)
  }
  for (const filename of ['index.lock', 'HEAD.lock', 'objects', 'logs', 'refs']) {
    assert.equal(isRelevantGitDirEvent(filename), false)
  }

  for (const filename of [null, 'heads/main', 'tags/v1', 'remotes/origin/main']) {
    assert.equal(isRelevantGitRefsEvent(filename), true)
  }
  for (const filename of ['heads/main.lock', 'tags/v1.lock', 'main.lock']) {
    assert.equal(isRelevantGitRefsEvent(filename), false)
  }
})

test('resolves the Git directory and refs targets for a normal repository', async () => {
  const rootPath = process.platform === 'win32' ? 'C:\\repo' : '/repo'
  const gitDir = join(rootPath, '.git')
  const calls: string[][] = []
  const executor = async (command: string, args: string[]) => {
    calls.push([command, ...args])
    return { stdout: `${gitDir}\n.git\n`, stderr: '' }
  }

  const targets = await resolveGitWatchTargets(rootPath, executor)
  assert.deepEqual(calls, [['git', '-C', rootPath, 'rev-parse', '--absolute-git-dir', '--git-common-dir']])
  assert.deepEqual(targets.map(({ path, recursive }) => ({ path, recursive })), [
    { path: gitDir, recursive: false },
    { path: join(gitDir, 'refs'), recursive: true },
  ])
  assert.equal(targets[0].isRelevant, isRelevantGitDirEvent)
  assert.equal(targets[1].isRelevant, isRelevantGitRefsEvent)
})

test('resolves the shared common directory and refs targets for a linked worktree', async () => {
  const rootPath = process.platform === 'win32' ? 'C:\\repo\\worktree' : '/repo/worktree'
  const commonDir = process.platform === 'win32' ? 'C:\\repo\\.git' : '/repo/.git'
  const gitDir = join(commonDir, 'worktrees', 'linked')
  const executor = async () => ({ stdout: `${gitDir}\n${commonDir}\n`, stderr: '' })

  const targets = await resolveGitWatchTargets(rootPath, executor)
  assert.deepEqual(targets.map(({ path, recursive }) => ({ path, recursive })), [
    { path: gitDir, recursive: false },
    { path: commonDir, recursive: false },
    { path: join(commonDir, 'refs'), recursive: true },
  ])
})

test('collapses a burst of relevant events into one change', async () => {
  const { watch, watchers } = createFakeWatch()
  let changes = 0
  const watcher = createWorkspaceDiffWatcher(['/repo'], () => {
    changes += 1
  }, {
    throttleMs: 20,
    resolveTargets: async () => [gitDirTarget()],
    watch,
  })
  await delay(0)
  assert.equal(watchers.length, 1)

  watchers[0].listener('change', 'index')
  watchers[0].listener('change', 'HEAD')
  watchers[0].listener('change', 'packed-refs')
  await delay(80)

  assert.equal(changes, 1)
  watcher.stop()
})

test('ignores irrelevant events without scheduling a change', async () => {
  const { watch, watchers } = createFakeWatch()
  let changes = 0
  const watcher = createWorkspaceDiffWatcher(['/repo'], () => {
    changes += 1
  }, {
    throttleMs: 20,
    resolveTargets: async () => [gitDirTarget()],
    watch,
  })
  await delay(0)

  watchers[0].listener('rename', 'index.lock')
  watchers[0].listener('change', 'HEAD.lock')
  await delay(60)

  assert.equal(changes, 0)
  watcher.stop()
})

test('stop cancels a pending change and closes every watcher once', async () => {
  const { watch, watchers } = createFakeWatch()
  let changes = 0
  const watcher = createWorkspaceDiffWatcher(['/repo'], () => {
    changes += 1
  }, {
    throttleMs: 20,
    resolveTargets: async () => [gitDirTarget()],
    watch,
  })
  await delay(0)

  watchers[0].listener('change', 'index')
  watcher.stop()
  watcher.stop()
  await delay(60)

  assert.equal(changes, 0)
  assert.deepEqual(watchers.map(({ closeCount }) => closeCount), [1])
})

test('stop before target resolution opens no watchers', async () => {
  const { watch, watchers } = createFakeWatch()
  const targets = deferred<GitWatchTarget[]>()
  let changes = 0
  const watcher = createWorkspaceDiffWatcher(['/repo'], () => {
    changes += 1
  }, {
    resolveTargets: () => targets.promise,
    watch,
  })

  watcher.stop()
  targets.resolve([gitDirTarget()])
  await delay(0)

  assert.equal(watchers.length, 0)
  assert.equal(changes, 0)
})

test('a target that cannot be watched does not stop the remaining targets', async () => {
  const fake = createFakeWatch()
  const first = gitDirTarget('/repo/.git')
  const second: GitWatchTarget = { path: '/repo/.git/refs', recursive: true, isRelevant: isRelevantGitRefsEvent }
  const watch: GitDirectoryWatchFunction = (path, options, listener) => {
    if (path === first.path) throw new Error('ENOENT')
    return fake.watch(path, options, listener)
  }

  const watcher = createWorkspaceDiffWatcher(['/repo'], () => {}, {
    resolveTargets: async () => [first, second],
    watch,
  })
  await delay(0)

  assert.deepEqual(fake.watchers.map(({ path }) => path), [second.path])
  watcher.stop()
})

test('a watcher error closes that watcher without throwing', async () => {
  const { watch, watchers } = createFakeWatch()
  const watcher = createWorkspaceDiffWatcher(['/repo'], () => {}, {
    resolveTargets: async () => [gitDirTarget()],
    watch,
  })
  await delay(0)

  assert.equal(watchers[0].errorListeners.length, 1)
  assert.doesNotThrow(() => {
    for (const listener of watchers[0].errorListeners) listener(new Error('EPERM'))
  })
  assert.equal(watchers[0].closeCount, 1)

  watcher.stop()
  assert.equal(watchers[0].closeCount, 1)
})

test('opens one watcher for identical targets discovered from two roots', async () => {
  const { watch, watchers } = createFakeWatch()
  const watcher = createWorkspaceDiffWatcher(['/repo/a', '/repo/b'], () => {}, {
    resolveTargets: async () => [gitDirTarget('/repo/.git')],
    watch,
  })
  await delay(0)

  assert.equal(watchers.length, 1)
  watcher.stop()
})

test('notifies after a real commit in a repository watched with fs.watch', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'yira-diff-watch-'))
  let watcher: WorkspaceDiffWatcher | undefined
  try {
    await git(rootPath, ['init', '--quiet'])
    await git(rootPath, ['config', 'user.email', 'yira-tests@example.com'])
    await git(rootPath, ['config', 'user.name', 'Yira Tests'])
    await writeFile(join(rootPath, 'file.txt'), 'one\n')
    await git(rootPath, ['add', '--', 'file.txt'])
    await git(rootPath, ['commit', '--quiet', '-m', 'base'])

    let signalChange!: () => void
    const changed = new Promise<void>((resolve) => {
      signalChange = resolve
    })
    let openedWatchers = 0
    let signalReady!: () => void
    const ready = new Promise<void>((resolve) => {
      signalReady = resolve
    })
    const watch: GitDirectoryWatchFunction = (path, options, listener) => {
      const directoryWatcher = fsWatch(path, { recursive: options.recursive, persistent: false }, (eventType, filename) => {
        listener(eventType, filename === null ? null : filename.toString())
      })
      openedWatchers += 1
      if (openedWatchers === 2) signalReady()
      return directoryWatcher
    }

    watcher = createWorkspaceDiffWatcher([rootPath], signalChange, { throttleMs: 50, watch })
    await withTimeout(ready, 'Git watchers did not start')

    await writeFile(join(rootPath, 'file.txt'), 'two\n')
    await git(rootPath, ['add', '--', 'file.txt'])
    await git(rootPath, ['commit', '--quiet', '-m', 'second'])

    await withTimeout(changed, 'a commit did not trigger a workspace diff change')
  } finally {
    watcher?.stop()
    await rm(rootPath, { recursive: true, force: true })
  }
})
