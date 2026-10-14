import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'path'
import type { GitBranch, GitBranchListResult, GitChangeStatus, GitCommitHistoryResult, GitCommitSummary, GitFileChange, GitStashEntry, GitStatusResult } from '@shared/types'

export interface GitCommandResult {
  stdout: string
  stderr: string
}

export type GitCommandExecutor = (command: string, args: string[]) => Promise<GitCommandResult>

function normalizeForCompare(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value
}

function isInsidePath(rootPath: string, targetPath: string): boolean {
  const relativePath = relative(rootPath, targetPath)
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

function hasTraversalSegment(relativePath: string): boolean {
  return relativePath.split(/[\\/]+/).some((segment) => segment === '..')
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('//')
}

function toRendererRelativePath(rootPath: string, targetPath: string): string {
  return relative(rootPath, targetPath).split(sep).join('/')
}

function toErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return 'Git is not available'
  return error instanceof Error && error.message ? error.message : 'Git operation failed'
}

export async function execGitCommand(command: string, args: string[]): Promise<GitCommandResult> {
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: '',
        SSH_ASKPASS: '',
        GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -o BatchMode=yes',
      },
    }, (error, stdout, stderr) => {
      if (error) reject(error)
      else resolvePromise({ stdout, stderr })
    })
  })
}

export async function resolveGitRootPath(rootPathInput: string): Promise<string> {
  if (typeof rootPathInput !== 'string' || !rootPathInput.trim()) throw new Error('Git workspace folder is required')

  let rootPath: string
  try {
    rootPath = await fs.realpath(rootPathInput)
  } catch {
    throw new Error('Git workspace folder is unavailable')
  }

  if (!(await fs.stat(rootPath)).isDirectory()) throw new Error('Git workspace folder is not a directory')
  return resolve(rootPath)
}

async function ensureTargetRemainsInsideRoot(rootPath: string, targetPath: string): Promise<string> {
  let currentPath = targetPath
  while (true) {
    try {
      const currentRealPath = await fs.realpath(currentPath)
      if (!isInsidePath(normalizeForCompare(rootPath), normalizeForCompare(currentRealPath))) {
        throw new Error('Path escapes the workspace folder')
      }
      return currentRealPath
    } catch (error) {
      if (error instanceof Error && error.message === 'Path escapes the workspace folder') throw error
      const parentPath = dirname(currentPath)
      if (parentPath === currentPath) throw new Error('Path does not exist')
      currentPath = parentPath
    }
  }
}

export async function resolveGitTargetPath(
  rootPathInput: string,
  relativePath: string,
): Promise<{ rootPath: string; targetPath: string; relativePath: string }> {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\0')) {
    throw new Error('Path must be a non-empty relative path')
  }
  if (isAbsolute(relativePath) || isWindowsAbsolutePath(relativePath)) {
    throw new Error('Path must be relative to the workspace folder')
  }
  if (hasTraversalSegment(relativePath)) throw new Error('Path traversal is not allowed')

  const rootPath = await resolveGitRootPath(rootPathInput)
  const targetPath = resolve(rootPath, relativePath)
  if (!isInsidePath(normalizeForCompare(rootPath), normalizeForCompare(targetPath))) {
    throw new Error('Path escapes the workspace folder')
  }

  // A deleted tracked file has no final filesystem entry. Checking its nearest
  // existing ancestor still catches symlink escapes while allowing `git add` to
  // stage that deletion.
  await ensureTargetRemainsInsideRoot(rootPath, targetPath)

  return { rootPath, targetPath, relativePath: toRendererRelativePath(rootPath, targetPath) }
}

function statusFromCode(code: string): GitChangeStatus {
  switch (code) {
    case 'A': return 'added'
    case 'M': return 'modified'
    case 'D': return 'deleted'
    case 'R': return 'renamed'
    case 'C': return 'copied'
    case 'U': return 'unmerged'
    case '?': return 'untracked'
    default: return 'unknown'
  }
}

function parseBranchStatus(record: string | undefined): Pick<GitStatusResult, 'branch' | 'upstream' | 'ahead' | 'behind'> {
  const emptyStatus = { branch: null, ahead: 0, behind: 0 }
  if (!record?.startsWith('## ')) return emptyStatus
  const value = record.slice(3)
  if (value.startsWith('No commits yet on ')) return { ...emptyStatus, branch: value.slice('No commits yet on '.length) || null }
  if (value.startsWith('HEAD ')) return { ...emptyStatus, branch: 'HEAD' }

  const [branchValue, trackingValue] = value.split('...', 2)
  const branch = branchValue || null
  if (!trackingValue) return { ...emptyStatus, branch }

  const upstream = trackingValue.split(' [', 1)[0] || undefined
  const ahead = Number(/\bahead (\d+)/.exec(trackingValue)?.[1] ?? 0)
  const behind = Number(/\bbehind (\d+)/.exec(trackingValue)?.[1] ?? 0)
  return { branch, ...(upstream ? { upstream } : {}), ahead, behind }
}

export function parseGitStatus(output: string): Pick<GitStatusResult, 'branch' | 'upstream' | 'ahead' | 'behind' | 'staged' | 'unstaged'> {
  const records = output.split('\0')
  const branchStatus = parseBranchStatus(records.shift())
  const staged: GitFileChange[] = []
  const unstaged: GitFileChange[] = []

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (!record || record.length < 4) continue

    const indexCode = record[0]
    const worktreeCode = record[1]
    const path = record.slice(3)
    const isRenameOrCopy = indexCode === 'R' || indexCode === 'C' || worktreeCode === 'R' || worktreeCode === 'C'
    const originalPath = isRenameOrCopy ? records[++index] || undefined : undefined

    if (indexCode !== ' ' && indexCode !== '?') {
      staged.push({ path, status: statusFromCode(indexCode), ...(originalPath ? { originalPath } : {}) })
    }
    if (worktreeCode !== ' ' && worktreeCode !== '?') {
      unstaged.push({ path, status: statusFromCode(worktreeCode), ...(originalPath ? { originalPath } : {}) })
    }
    if (indexCode === '?' && worktreeCode === '?') unstaged.push({ path, status: 'untracked' })
  }

  return { ...branchStatus, staged, unstaged }
}

function normalizeRepositoryPath(value: string): string | undefined {
  const path = value.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '')
  return path && !path.split('/').some((segment) => !segment || segment === '.' || segment === '..') ? path : undefined
}

export function resolveOriginWebUrl(origin: string): string | undefined {
  const trimmed = origin.trim()
  if (!trimmed) return undefined

  const scpLike = !trimmed.includes('://')
    ? /^(?:[^@\s/:]+@)?([^:\s/]+):(.+)$/.exec(trimmed)
    : null
  if (scpLike) {
    const repositoryPath = normalizeRepositoryPath(scpLike[2])
    return repositoryPath ? `https://${scpLike[1]}/${repositoryPath}` : undefined
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'ssh:') return undefined
    const repositoryPath = normalizeRepositoryPath(parsed.pathname)
    if (!parsed.hostname || !repositoryPath) return undefined
    const host = parsed.protocol === 'ssh:' ? parsed.hostname : parsed.host
    return `https://${host}/${repositoryPath}`
  } catch {
    return undefined
  }
}

async function runGitAtRoot(rootPath: string, args: string[], executor: GitCommandExecutor): Promise<GitCommandResult> {
  return executor('git', ['-C', rootPath, ...args])
}

const GIT_COMMIT_LOG_FORMAT = '--format=%h%x00%s%x00%cI'

export function parseGitCommitLog(output: string): GitCommitSummary[] {
  return output.split(/\r?\n/).flatMap((record) => {
    const [shortHash, subject, commitDate] = record.split('\0')
    if (!shortHash || !commitDate) return []
    return [{ shortHash, subject, commitDate }]
  })
}

function emptyGitCommitHistory(error?: string): GitCommitHistoryResult {
  return { outgoing: [], upstream: [], local: [], ...(error ? { error } : {}) }
}

interface GitUpstreamDiscovery {
  upstream?: string
  configured: boolean
  error?: string
}

function parseGitConfigValues(output: string, branch: string): Map<'remote' | 'merge', string> {
  const values = new Map<'remote' | 'merge', string>()
  const branchPrefix = `branch.${branch}.`
  for (const record of output.split('\0')) {
    const separator = record.indexOf('\n')
    if (separator < 0) continue
    const key = record.slice(0, separator)
    const value = record.slice(separator + 1)
    if (key === `${branchPrefix}remote` || key === `${branchPrefix}merge`) {
      values.set(key.slice(branchPrefix.length) as 'remote' | 'merge', value)
    }
  }
  return values
}

async function discoverGitUpstream(rootPath: string, executor: GitCommandExecutor): Promise<GitUpstreamDiscovery> {
  let config: GitCommandResult
  try {
    config = await runGitAtRoot(rootPath, ['config', '--local', '--null', '--list'], executor)
  } catch (error) {
    return { configured: true, error: toErrorMessage(error) }
  }

  let branch: string
  try {
    const result = await runGitAtRoot(rootPath, ['symbolic-ref', '--quiet', '--short', 'HEAD'], executor)
    branch = result.stdout.trim()
  } catch (error) {
    if (toErrorMessage(error) === 'Git is not available') return { configured: true, error: 'Git is not available' }
    return { configured: false }
  }
  if (!branch) return { configured: false }

  const values = parseGitConfigValues(config.stdout, branch)
  const remote = values.get('remote')
  const merge = values.get('merge')
  if (remote === undefined && merge === undefined) return { configured: false }
  if (!remote || !merge) return { configured: true, error: 'Current branch has an incomplete upstream configuration' }

  try {
    const result = await runGitAtRoot(rootPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], executor)
    const upstream = result.stdout.trim()
    if (!upstream) return { configured: true, error: 'Configured upstream could not be resolved' }
    return { configured: true, upstream }
  } catch (error) {
    return { configured: true, error: `Configured upstream could not be resolved: ${toErrorMessage(error)}` }
  }
}

export async function getGitStatus(rootPathInput: string, executor: GitCommandExecutor = execGitCommand): Promise<GitStatusResult> {
  let rootPath: string
  try {
    rootPath = await resolveGitRootPath(rootPathInput)
  } catch (error) {
    return { isRepository: false, branch: null, ahead: 0, behind: 0, staged: [], unstaged: [], error: toErrorMessage(error) }
  }

  let parsed: Pick<GitStatusResult, 'branch' | 'upstream' | 'ahead' | 'behind' | 'staged' | 'unstaged'>
  try {
    const result = await runGitAtRoot(rootPath, ['status', '--porcelain=v1', '-z', '--branch'], executor)
    parsed = parseGitStatus(result.stdout)
  } catch (error) {
    return { isRepository: false, branch: null, ahead: 0, behind: 0, staged: [], unstaged: [], error: toErrorMessage(error) }
  }

  let originUrl: string | undefined
  try {
    const origin = await runGitAtRoot(rootPath, ['remote', 'get-url', 'origin'], executor)
    originUrl = resolveOriginWebUrl(origin.stdout)
  } catch {
    // Origin is optional; source control remains useful without an external link.
  }

  return { isRepository: true, ...parsed, ...(originUrl ? { originUrl } : {}) }
}

export async function getGitCommitHistory(
  rootPathInput: string,
  executor: GitCommandExecutor = execGitCommand,
): Promise<GitCommitHistoryResult> {
  let rootPath: string
  try {
    rootPath = await resolveGitRootPath(rootPathInput)
  } catch (error) {
    return emptyGitCommitHistory(toErrorMessage(error))
  }

  const discovery = await discoverGitUpstream(rootPath, executor)
  if (discovery.error) return emptyGitCommitHistory(discovery.error)

  if (!discovery.configured) {
    try {
      const result = await runGitAtRoot(rootPath, ['log', '-5', GIT_COMMIT_LOG_FORMAT, 'HEAD'], executor)
      return { ...emptyGitCommitHistory(), local: parseGitCommitLog(result.stdout) }
    } catch (error) {
      return emptyGitCommitHistory(toErrorMessage(error))
    }
  }

  if (!discovery.upstream) return emptyGitCommitHistory('Configured upstream could not be resolved')

  const history = emptyGitCommitHistory()
  try {
    const result = await runGitAtRoot(rootPath, ['log', GIT_COMMIT_LOG_FORMAT, `${discovery.upstream}..HEAD`], executor)
    history.outgoing = parseGitCommitLog(result.stdout)
  } catch (error) {
    history.error = toErrorMessage(error)
  }

  try {
    const result = await runGitAtRoot(rootPath, ['log', '-5', GIT_COMMIT_LOG_FORMAT, discovery.upstream], executor)
    history.upstream = parseGitCommitLog(result.stdout)
  } catch (error) {
    history.error ??= toErrorMessage(error)
  }

  return history
}

export async function stageGitFile(
  rootPathInput: string,
  relativePath: string,
  executor: GitCommandExecutor = execGitCommand,
): Promise<void> {
  await stageGitFiles(rootPathInput, [relativePath], executor)
}

export async function stageGitFiles(
  rootPathInput: string,
  relativePaths: string[],
  executor: GitCommandExecutor = execGitCommand,
): Promise<void> {
  if (relativePaths.length === 0) throw new Error('At least one path is required')
  const resolvedPaths = await Promise.all(relativePaths.map((relativePath) => resolveGitTargetPath(rootPathInput, relativePath)))
  for (const chunk of chunkPaths(resolvedPaths.map(({ relativePath }) => relativePath))) {
    await runGitAtRoot(resolvedPaths[0].rootPath, ['add', '--', ...chunk], executor)
  }
}

export async function unstageGitFile(
  rootPathInput: string,
  relativePath: string,
  executor: GitCommandExecutor = execGitCommand,
): Promise<void> {
  await unstageGitFiles(rootPathInput, [relativePath], executor)
}

export async function unstageGitFiles(
  rootPathInput: string,
  relativePaths: string[],
  executor: GitCommandExecutor = execGitCommand,
): Promise<void> {
  if (relativePaths.length === 0) throw new Error('At least one path is required')
  const resolvedPaths = await Promise.all(relativePaths.map((relativePath) => resolveGitTargetPath(rootPathInput, relativePath)))
  for (const chunk of chunkPaths(resolvedPaths.map(({ relativePath }) => relativePath))) {
    await runGitAtRoot(resolvedPaths[0].rootPath, ['restore', '--staged', '--', ...chunk], executor)
  }
}

export interface GitDiscardPaths {
  trackedPaths: string[]
  untrackedPaths: string[]
}

// Keeps each command well under the Windows command line limit.
function chunkPaths(paths: string[], maxLength = 8_000): string[][] {
  const chunks: string[][] = []
  let current: string[] = []
  let currentLength = 0
  for (const path of paths) {
    if (current.length > 0 && currentLength + path.length + 1 > maxLength) {
      chunks.push(current)
      current = []
      currentLength = 0
    }
    current.push(path)
    currentLength += path.length + 1
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

/**
 * Discards working tree changes. Tracked files go back to their index version
 * and untracked files are deleted. This cannot be undone.
 */
export async function discardGitChanges(
  rootPathInput: string,
  { trackedPaths, untrackedPaths }: GitDiscardPaths,
  executor: GitCommandExecutor = execGitCommand,
): Promise<void> {
  if (trackedPaths.length === 0 && untrackedPaths.length === 0) throw new Error('At least one path is required')
  const rootPath = await resolveGitRootPath(rootPathInput)
  const resolveAll = async (paths: string[]): Promise<string[]> => (
    await Promise.all(paths.map((relativePath) => resolveGitTargetPath(rootPath, relativePath)))
  ).map(({ relativePath }) => relativePath)
  const tracked = await resolveAll(trackedPaths)
  const untracked = await resolveAll(untrackedPaths)

  for (const chunk of chunkPaths(tracked)) {
    await runGitAtRoot(rootPath, ['restore', '--worktree', '--', ...chunk], executor)
  }
  // `clean` only removes untracked entries, so a stale status cannot delete tracked files.
  for (const chunk of chunkPaths(untracked)) {
    await runGitAtRoot(rootPath, ['clean', '-f', '-d', '--', ...chunk], executor)
  }
}

function validateCommitMessage(message: string): string {
  if (typeof message !== 'string') throw new Error('Commit message must be text')
  const trimmed = message.trim()
  if (!trimmed) throw new Error('Commit message is required')
  if (trimmed.length > 10_000) throw new Error('Commit message must be 10,000 characters or fewer')
  return trimmed
}

export async function commitGitChanges(
  rootPathInput: string,
  message: string,
  executor: GitCommandExecutor = execGitCommand,
): Promise<void> {
  const rootPath = await resolveGitRootPath(rootPathInput)
  await runGitAtRoot(rootPath, ['commit', '-m', validateCommitMessage(message)], executor)
}

async function requireGitUpstream(rootPath: string, executor: GitCommandExecutor): Promise<void> {
  let upstream: GitCommandResult
  try {
    upstream = await runGitAtRoot(rootPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], executor)
  } catch (error) {
    if (toErrorMessage(error) === 'Git is not available') throw new Error('Git is not available')
    throw new Error('Current branch has no upstream configured')
  }
  if (!upstream.stdout.trim()) throw new Error('Current branch has no upstream configured')
}

export async function fetchGitRepository(
  rootPathInput: string,
  executor: GitCommandExecutor = execGitCommand,
): Promise<void> {
  const rootPath = await resolveGitRootPath(rootPathInput)
  await runGitAtRoot(rootPath, ['fetch', '--prune'], executor)
}

export async function pullGitRepository(
  rootPathInput: string,
  executor: GitCommandExecutor = execGitCommand,
): Promise<void> {
  const rootPath = await resolveGitRootPath(rootPathInput)
  await requireGitUpstream(rootPath, executor)
  await runGitAtRoot(rootPath, ['pull', '--ff-only'], executor)
}

export async function pushGitRepository(
  rootPathInput: string,
  executor: GitCommandExecutor = execGitCommand,
): Promise<void> {
  const rootPath = await resolveGitRootPath(rootPathInput)
  await requireGitUpstream(rootPath, executor)
  await runGitAtRoot(rootPath, ['push'], executor)
}

export async function syncGitRepository(
  rootPathInput: string,
  executor: GitCommandExecutor = execGitCommand,
): Promise<void> {
  const rootPath = await resolveGitRootPath(rootPathInput)
  await requireGitUpstream(rootPath, executor)
  await runGitAtRoot(rootPath, ['pull', '--ff-only'], executor)
  await runGitAtRoot(rootPath, ['push'], executor)
}

export function parseGitBranchRefs(output: string): GitBranch[] {
  const branches: GitBranch[] = []
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue
    const [refname, upstreamShort, committerDate, head] = line.split('\0')
    if (!refname) continue
    if (refname.startsWith('refs/heads/')) {
      const name = refname.slice('refs/heads/'.length)
      if (!name) continue
      branches.push({
        name,
        remote: false,
        current: head === '*',
        ...(upstreamShort?.trim() ? { upstream: upstreamShort.trim() } : {}),
        ...(committerDate?.trim() ? { committerDate: committerDate.trim() } : {}),
      })
    } else if (refname.startsWith('refs/remotes/')) {
      const rest = refname.slice('refs/remotes/'.length)
      if (!rest || /^([^/]+)\/HEAD$/.test(rest)) continue
      branches.push({
        name: rest,
        remote: true,
        current: false,
        ...(upstreamShort?.trim() ? { upstream: upstreamShort.trim() } : {}),
        ...(committerDate?.trim() ? { committerDate: committerDate.trim() } : {}),
      })
    }
  }
  return branches
}

export function parseGitWorktreeBranches(output: string): Map<string, string> {
  const map = new Map<string, string>()
  const blocks = output.split(/\n\s*\n/)
  for (const block of blocks) {
    let worktreePath: string | undefined
    let branch: string | undefined
    for (const rawLine of block.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (line.startsWith('worktree ')) worktreePath = line.slice('worktree '.length).trim()
      else if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length).trim()
        const match = /^refs\/heads\/(.+)$/.exec(ref)
        if (match) branch = match[1]
      }
    }
    if (worktreePath && branch) map.set(branch, worktreePath)
  }
  return map
}

export async function validateGitBranchName(
  rootPath: string,
  name: unknown,
  executor: GitCommandExecutor,
): Promise<void> {
  if (typeof name !== 'string' || !name || name.includes('\0') || name.startsWith('-')) {
    throw new Error('Invalid branch name')
  }
  try {
    await runGitAtRoot(rootPath, ['check-ref-format', '--branch', name], executor)
  } catch {
    throw new Error('Invalid branch name')
  }
}

export async function listGitBranches(
  rootPathInput: string,
  executor: GitCommandExecutor = execGitCommand,
): Promise<GitBranchListResult> {
  let rootPath: string
  try {
    rootPath = await resolveGitRootPath(rootPathInput)
  } catch (error) {
    return { branches: [], error: toErrorMessage(error) }
  }

  try {
    const result = await runGitAtRoot(rootPath, [
      'for-each-ref',
      '--sort=-committerdate',
      '--format=%(refname)%00%(upstream:short)%00%(committerdate:iso-strict)%00%(HEAD)',
      'refs/heads',
      'refs/remotes',
    ], executor)
    const parsed = parseGitBranchRefs(result.stdout)
    const localUpstreams = new Set(parsed.filter((branch) => !branch.remote && branch.upstream).map((branch) => branch.upstream as string))
    const branches = parsed.filter((branch) => !(branch.remote && localUpstreams.has(branch.name)))

    try {
      const worktreeResult = await runGitAtRoot(rootPath, ['worktree', 'list', '--porcelain'], executor)
      const worktreeMap = parseGitWorktreeBranches(worktreeResult.stdout)
      for (const branch of branches) {
        if (branch.remote) continue
        const worktreePath = worktreeMap.get(branch.name)
        if (!worktreePath) continue
        if (normalizeForCompare(resolve(worktreePath)) === normalizeForCompare(resolve(rootPath))) continue
        branch.worktreePath = worktreePath
      }
    } catch {
      // Ignore worktree discovery failures; branches still list.
    }

    return { branches }
  } catch (error) {
    return { branches: [], error: toErrorMessage(error) }
  }
}

export async function checkoutGitBranch(
  rootPathInput: string,
  name: string,
  remote: boolean,
  executor: GitCommandExecutor = execGitCommand,
): Promise<void> {
  const rootPath = await resolveGitRootPath(rootPathInput)
  await validateGitBranchName(rootPath, name, executor)

  if (!remote) {
    try {
      await runGitAtRoot(rootPath, ['show-ref', '--verify', '--quiet', `refs/heads/${name}`], executor)
    } catch {
      throw new Error('Branch does not exist')
    }
    await runGitAtRoot(rootPath, ['switch', name], executor)
    return
  }

  try {
    await runGitAtRoot(rootPath, ['show-ref', '--verify', '--quiet', `refs/remotes/${name}`], executor)
  } catch {
    throw new Error('Branch does not exist')
  }

  const shortName = name.includes('/') ? name.slice(name.indexOf('/') + 1) : name
  let localExists = false
  try {
    await runGitAtRoot(rootPath, ['show-ref', '--verify', '--quiet', `refs/heads/${shortName}`], executor)
    localExists = true
  } catch {
    localExists = false
  }

  if (localExists) {
    await runGitAtRoot(rootPath, ['switch', shortName], executor)
  } else {
    await runGitAtRoot(rootPath, ['switch', '--track', name], executor)
  }
}

export async function createGitBranch(
  rootPathInput: string,
  name: string,
  startPoint: string | undefined,
  executor: GitCommandExecutor = execGitCommand,
): Promise<void> {
  const rootPath = await resolveGitRootPath(rootPathInput)
  await validateGitBranchName(rootPath, name, executor)

  if (startPoint !== undefined) {
    if (typeof startPoint !== 'string' || !startPoint || startPoint.includes('\0') || startPoint.startsWith('-')) {
      throw new Error('Start point does not exist')
    }
    try {
      await runGitAtRoot(rootPath, ['rev-parse', '--verify', '--quiet', `${startPoint}^{commit}`], executor)
    } catch {
      throw new Error('Start point does not exist')
    }
  }

  const args = ['switch', '-c', name]
  if (startPoint) args.push(startPoint)
  await runGitAtRoot(rootPath, args, executor)
}

export async function stashGitChangesForBranch(
  rootPathInput: string,
  branch: string,
  executor: GitCommandExecutor = execGitCommand,
): Promise<void> {
  const rootPath = await resolveGitRootPath(rootPathInput)
  await validateGitBranchName(rootPath, branch, executor)
  await runGitAtRoot(rootPath, ['stash', 'push', '--include-untracked', '-m', `yira: ${branch}`], executor)
}

export async function findGitBranchStash(
  rootPathInput: string,
  branch: string,
  executor: GitCommandExecutor = execGitCommand,
): Promise<GitStashEntry | null> {
  const rootPath = await resolveGitRootPath(rootPathInput)
  const result = await runGitAtRoot(rootPath, ['stash', 'list', '--format=%gd%x00%s'], executor)
  const suffix = `yira: ${branch}`
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue
    const separator = line.indexOf('\0')
    if (separator < 0) continue
    const ref = line.slice(0, separator).trim()
    const subject = line.slice(separator + 1)
    if (!ref) continue
    if (subject.trimEnd().endsWith(suffix)) {
      return { ref, message: subject }
    }
  }
  return null
}

export async function popGitStash(
  rootPathInput: string,
  ref: string,
  executor: GitCommandExecutor = execGitCommand,
): Promise<void> {
  if (typeof ref !== 'string' || !/^stash@\{\d+\}$/.test(ref)) {
    throw new Error('Invalid stash reference')
  }
  const rootPath = await resolveGitRootPath(rootPathInput)
  await runGitAtRoot(rootPath, ['stash', 'pop', ref], executor)
}

export async function publishGitBranch(
  rootPathInput: string,
  executor: GitCommandExecutor = execGitCommand,
): Promise<void> {
  const rootPath = await resolveGitRootPath(rootPathInput)
  const branchResult = await runGitAtRoot(rootPath, ['rev-parse', '--abbrev-ref', 'HEAD'], executor)
  const branch = branchResult.stdout.trim()
  if (!branch || branch === 'HEAD') throw new Error('Cannot publish a detached HEAD')

  const remoteResult = await runGitAtRoot(rootPath, ['remote'], executor)
  const remotes = remoteResult.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
  if (!remotes.includes('origin')) throw new Error('No origin remote configured')

  await runGitAtRoot(rootPath, ['push', '-u', 'origin', branch], executor)
}
