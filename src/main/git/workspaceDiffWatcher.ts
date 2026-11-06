import { watch as fsWatch } from 'node:fs'
import { resolve } from 'node:path'
import { execGitCommand, type GitCommandExecutor } from './runner'

export const WORKSPACE_DIFF_WATCH_THROTTLE_MS = 750

export interface GitWatchTarget {
  path: string
  recursive: boolean
  isRelevant: (filename: string | null) => boolean
}

export type GitDirectoryWatchListener = (eventType: 'rename' | 'change', filename: string | null) => void

/** The minimal shape of an `fs.watch` watcher used here. */
export interface GitDirectoryWatcher {
  on(event: 'error', listener: (error: Error) => void): unknown
  close(): void
}

export type GitDirectoryWatchFunction = (
  path: string,
  options: { recursive: boolean; persistent: false },
  listener: GitDirectoryWatchListener,
) => GitDirectoryWatcher

const defaultGitDirectoryWatch: GitDirectoryWatchFunction = (path, options, listener) => (
  fsWatch(path, { recursive: options.recursive, persistent: false }, (eventType, filename) => {
    listener(eventType, filename === null ? null : filename.toString())
  })
)

export function isRelevantGitDirEvent(filename: string | null): boolean {
  return filename === null || filename === 'HEAD' || filename === 'index' || filename === 'packed-refs'
}

export function isRelevantGitRefsEvent(filename: string | null): boolean {
  return filename === null || !filename.endsWith('.lock')
}

function canonicalPath(value: string): string {
  const resolvedPath = resolve(value)
  return process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath
}

export async function resolveGitWatchTargets(
  repositoryRoot: string,
  executor: GitCommandExecutor = execGitCommand,
): Promise<GitWatchTarget[]> {
  // The common directory is relative to the repository in a normal checkout
  // and absolute in a linked worktree, so both are resolved the same way.
  const result = await executor('git', ['-C', repositoryRoot, 'rev-parse', '--absolute-git-dir', '--git-common-dir'])
  const [reportedGitDir, reportedCommonDir] = result.stdout.split(/\r?\n/)
  if (!reportedGitDir || !reportedCommonDir) throw new Error('Git did not report its directories')

  const gitDir = resolve(repositoryRoot, reportedGitDir)
  const commonDir = resolve(repositoryRoot, reportedCommonDir)
  const targets: GitWatchTarget[] = [
    { path: gitDir, recursive: false, isRelevant: isRelevantGitDirEvent },
  ]
  if (canonicalPath(gitDir) !== canonicalPath(commonDir)) {
    targets.push({ path: commonDir, recursive: false, isRelevant: isRelevantGitDirEvent })
  }
  targets.push({ path: resolve(commonDir, 'refs'), recursive: true, isRelevant: isRelevantGitRefsEvent })
  return targets
}

export interface WorkspaceDiffWatcher {
  stop: () => void
}

export interface WorkspaceDiffWatcherOptions {
  throttleMs?: number
  resolveTargets?: (repositoryRoot: string) => Promise<GitWatchTarget[]>
  watch?: GitDirectoryWatchFunction
}

export function createWorkspaceDiffWatcher(
  repositoryRoots: string[],
  onChange: () => void,
  options: WorkspaceDiffWatcherOptions = {},
): WorkspaceDiffWatcher {
  const throttleMs = options.throttleMs ?? WORKSPACE_DIFF_WATCH_THROTTLE_MS
  const resolveTargets = options.resolveTargets ?? resolveGitWatchTargets
  const watch = options.watch ?? defaultGitDirectoryWatch

  const watchers = new Set<GitDirectoryWatcher>()
  const seenTargets = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const closeWatcher = (watcher: GitDirectoryWatcher): void => {
    watchers.delete(watcher)
    try {
      watcher.close()
    } catch {
      // The directory can disappear while the watcher is being closed.
    }
  }

  const scheduleChange = (): void => {
    if (stopped || timer !== undefined) return
    timer = setTimeout(() => {
      timer = undefined
      if (!stopped) onChange()
    }, throttleMs)
    timer.unref?.()
  }

  const addTarget = (target: GitWatchTarget): void => {
    const key = `${target.recursive ? 'recursive' : 'single'}\u0000${canonicalPath(target.path)}`
    if (seenTargets.has(key)) return
    seenTargets.add(key)

    let watcher: GitDirectoryWatcher
    try {
      watcher = watch(target.path, { recursive: target.recursive, persistent: false }, (_eventType, filename) => {
        if (target.isRelevant(filename)) scheduleChange()
      })
    } catch {
      // A missing directory is not fatal; the renderer still reads on mount.
      return
    }

    watchers.add(watcher)
    watcher.on('error', () => {
      closeWatcher(watcher)
    })
  }

  void Promise.allSettled(repositoryRoots.map(async (root) => resolveTargets(root))).then((results) => {
    if (stopped) return
    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      for (const target of result.value) addTarget(target)
    }
  })

  return {
    stop() {
      if (stopped) return
      stopped = true
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      for (const watcher of [...watchers]) closeWatcher(watcher)
    },
  }
}
