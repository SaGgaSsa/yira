import { promises as fs } from 'node:fs'
import { isAbsolute, join } from 'node:path'

export const WORKSPACE_LINKS_MANIFEST = '.yira-workspace-links.json'

export interface LinkedWorktree {
  /** POSIX path relative to the workspace root, such as `Acc` or `Azure/Azure`. */
  relativePath: string
  /** Absolute path of the existing worktree this entry must point at. */
  path: string
}

export interface LinkWorkspaceEntriesInput {
  workspaceRoot: string
  targetRoot: string
  /** POSIX relative paths that already hold a real worktree under targetRoot; never linked. */
  worktreePaths?: string[]
  /** Modules whose worktree lives elsewhere; linked to that worktree instead of the original checkout. */
  linkedWorktrees?: LinkedWorktree[]
  /** POSIX relative paths left out, in addition to `.git`. */
  excludedPaths?: string[]
}

interface WorkspaceLinksManifest {
  version: 1
  links: string[]
  directories: string[]
}

interface LinkContext {
  workspaceRoot: string
  targetRoot: string
  worktreePaths: Set<string>
  linkedWorktrees: Map<string, string>
  excludedPaths: Set<string>
  ancestorPaths: Set<string>
  links: string[]
  directories: string[]
}

function normalizeRelativePath(relativePath: string): string {
  return process.platform === 'win32' ? relativePath.toLowerCase() : relativePath
}

function collectAncestorPaths(relativePaths: string[]): Set<string> {
  const ancestors = new Set<string>()
  for (const relativePath of relativePaths) {
    const segments = relativePath.split('/').filter((segment) => segment.length > 0)
    for (let index = 1; index < segments.length; index += 1) {
      ancestors.add(normalizeRelativePath(segments.slice(0, index).join('/')))
    }
  }
  return ancestors
}

function hasErrorCode(error: unknown, ...codes: string[]): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return typeof code === 'string' && codes.includes(code)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function parseManifest(value: unknown): WorkspaceLinksManifest | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const { links, directories } = value as Record<string, unknown>
  if (!isStringArray(links) || !isStringArray(directories)) return undefined
  return { version: 1, links, directories }
}

/** Never trust manifest paths: an agent can edit the file inside the session folder. */
function isSafeManifestPath(relativePath: string): boolean {
  if (!relativePath || isAbsolute(relativePath)) return false
  return !relativePath
    .split(/[\\/]/)
    .some((segment) => segment === '..' || segment === '.')
}

async function readManifest(root: string): Promise<WorkspaceLinksManifest | undefined> {
  try {
    const contents = await fs.readFile(join(root, WORKSPACE_LINKS_MANIFEST), 'utf8')
    return parseManifest(JSON.parse(contents))
  } catch {
    return undefined
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.lstat(path)
    return true
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return false
    throw error
  }
}

async function linkEntry(source: string, destination: string): Promise<boolean> {
  let target: string
  try {
    target = await fs.realpath(source)
  } catch (error) {
    // Broken symlinks and entries that disappeared while walking are skipped.
    if (hasErrorCode(error, 'ENOENT')) return false
    throw error
  }

  const stats = await fs.stat(target)
  if (stats.isDirectory()) {
    await fs.symlink(target, destination, process.platform === 'win32' ? 'junction' : 'dir')
    return true
  }
  if (!stats.isFile()) return false

  try {
    await fs.symlink(target, destination, 'file')
  } catch (error) {
    if (process.platform !== 'win32' || !hasErrorCode(error, 'EPERM')) throw error
    try {
      await fs.link(target, destination)
    } catch (linkError) {
      if (!hasErrorCode(linkError, 'EXDEV')) throw linkError
      await fs.copyFile(target, destination)
    }
  }
  return true
}

async function linkIfMissing(context: LinkContext, source: string, relativePath: string): Promise<void> {
  const destination = join(context.targetRoot, relativePath)
  if (await pathExists(destination)) return
  if (await linkEntry(source, destination)) {
    context.links.push(relativePath)
  }
}

async function linkAncestorDirectory(context: LinkContext, relativePath: string): Promise<void> {
  const destination = join(context.targetRoot, relativePath)
  const stats = await fs.lstat(destination).catch((error: unknown) => {
    if (hasErrorCode(error, 'ENOENT')) return undefined
    throw error
  })

  if (stats && !stats.isDirectory()) return
  if (!stats) await fs.mkdir(destination, { recursive: true })

  // Pre-existing directories (a worktree created by Git, for example) are also
  // registered: removal uses rmdir, which cannot delete their contents.
  context.directories.push(relativePath)
  await linkDirectoryEntries(context, relativePath)
}

async function linkDirectoryEntries(context: LinkContext, relativeDirectory: string): Promise<void> {
  const sourceDirectory = relativeDirectory
    ? join(context.workspaceRoot, relativeDirectory)
    : context.workspaceRoot
  const entries = await fs.readdir(sourceDirectory, { withFileTypes: true })

  for (const entry of entries) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
    const key = normalizeRelativePath(relativePath)

    if (!relativeDirectory && (entry.name === '.git' || entry.name === WORKSPACE_LINKS_MANIFEST)) continue
    if (context.excludedPaths.has(key)) continue
    if (context.worktreePaths.has(key)) continue

    const linkedWorktree = context.linkedWorktrees.get(key)
    if (linkedWorktree !== undefined) {
      await linkIfMissing(context, linkedWorktree, relativePath)
      continue
    }

    if (context.ancestorPaths.has(key)) {
      await linkAncestorDirectory(context, relativePath)
      continue
    }

    await linkIfMissing(context, join(context.workspaceRoot, relativePath), relativePath)
  }
}

/** A tampered manifest must not reach original files through a linked folder. */
async function isUnderLinkedFolder(root: string, relativePath: string): Promise<boolean> {
  let current = root
  for (const segment of relativePath.split(/[\\/]/).slice(0, -1)) {
    current = join(current, segment)
    const stats = await fs.lstat(current).catch(() => undefined)
    if (!stats || stats.isSymbolicLink()) return true
  }
  return false
}

async function unlinkLinkedEntry(root: string, relativePath: string): Promise<void> {
  if (await isUnderLinkedFolder(root, relativePath)) return
  const destination = join(root, relativePath)
  const stats = await fs.lstat(destination).catch((error: unknown) => {
    if (hasErrorCode(error, 'ENOENT')) return undefined
    throw error
  })

  if (!stats || (!stats.isSymbolicLink() && !stats.isFile())) return
  try {
    await fs.unlink(destination)
  } catch (error) {
    if (!hasErrorCode(error, 'ENOENT')) throw error
  }
}

function sortDirectoriesDeepestFirst(relativePaths: string[]): string[] {
  return [...relativePaths].sort((left, right) => (
    right.split('/').length - left.split('/').length
  ))
}

async function removeDirectoryIfEmpty(root: string, relativePath: string): Promise<void> {
  if (await isUnderLinkedFolder(root, relativePath)) return
  try {
    await fs.rmdir(join(root, relativePath))
  } catch (error) {
    if (!hasErrorCode(error, 'ENOENT', 'ENOTEMPTY', 'EEXIST', 'ENOTDIR')) throw error
  }
}

async function removeEntries(root: string, links: string[], directories: string[]): Promise<void> {
  for (const relativePath of links) {
    await unlinkLinkedEntry(root, relativePath)
  }
  for (const relativePath of sortDirectoriesDeepestFirst(directories)) {
    await removeDirectoryIfEmpty(root, relativePath)
  }
}

async function removeManifest(root: string): Promise<void> {
  try {
    await fs.unlink(join(root, WORKSPACE_LINKS_MANIFEST))
  } catch (error) {
    if (!hasErrorCode(error, 'ENOENT')) throw error
  }
}

export async function linkWorkspaceEntries(input: LinkWorkspaceEntriesInput): Promise<void> {
  const worktreePaths = input.worktreePaths ?? []
  const linkedWorktrees = input.linkedWorktrees ?? []
  const excludedPaths = input.excludedPaths ?? []
  const context: LinkContext = {
    workspaceRoot: input.workspaceRoot,
    targetRoot: input.targetRoot,
    worktreePaths: new Set(worktreePaths.map(normalizeRelativePath)),
    linkedWorktrees: new Map(linkedWorktrees.map((entry) => [
      normalizeRelativePath(entry.relativePath),
      entry.path,
    ])),
    excludedPaths: new Set(excludedPaths.map(normalizeRelativePath)),
    ancestorPaths: collectAncestorPaths([
      ...worktreePaths,
      ...linkedWorktrees.map((entry) => entry.relativePath),
    ]),
    links: [],
    directories: [],
  }

  await fs.mkdir(input.targetRoot, { recursive: true })

  try {
    await linkDirectoryEntries(context, '')
    const manifest: WorkspaceLinksManifest = {
      version: 1,
      links: context.links,
      directories: context.directories,
    }
    await fs.writeFile(
      join(input.targetRoot, WORKSPACE_LINKS_MANIFEST),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    )
  } catch (error) {
    // Preserve the original failure even if rollback cannot finish.
    await removeEntries(input.targetRoot, context.links, context.directories).catch(() => undefined)
    throw error
  }
}

export async function hasWorkspaceLinks(root: string): Promise<boolean> {
  try {
    const stats = await fs.stat(join(root, WORKSPACE_LINKS_MANIFEST))
    return stats.isFile()
  } catch {
    return false
  }
}

export async function removeWorkspaceLinks(root: string): Promise<void> {
  const manifest = await readManifest(root)
  if (!manifest) return

  await removeEntries(
    root,
    manifest.links.filter(isSafeManifestPath),
    manifest.directories.filter(isSafeManifestPath),
  )
  await removeManifest(root)
}
