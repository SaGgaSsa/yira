import { createHash } from 'node:crypto'
import { access, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { WorkspaceCustomScript, WorkspaceScript } from '@shared/types'

export interface DiscoverWorkspaceScriptsInput {
  rootFolderPath?: string
  sourceControlRepositoryPaths?: string[]
  customScripts?: WorkspaceCustomScript[]
}

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

interface PackageManifest {
  scripts: Record<string, unknown>
  packageManager?: string
}

const MAX_PACKAGE_JSON_BYTES = 1024 * 1024
const PACKAGE_MANAGER_LOCKFILES: Array<[string, PackageManager]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'],
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function packageManagerFromField(value: unknown): PackageManager | undefined {
  if (typeof value !== 'string') return undefined
  const manager = value.split('@', 1)[0]
  return manager === 'npm' || manager === 'pnpm' || manager === 'yarn' || manager === 'bun'
    ? manager
    : undefined
}

async function readPackageManifest(directory: string): Promise<PackageManifest | undefined> {
  const packagePath = resolve(directory, 'package.json')

  try {
    const details = await stat(packagePath)
    if (details.size > MAX_PACKAGE_JSON_BYTES) return undefined

    const raw = await readFile(packagePath, 'utf8')
    if (Buffer.byteLength(raw, 'utf8') > MAX_PACKAGE_JSON_BYTES) return undefined
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !isRecord(parsed.scripts)) return undefined

    return {
      scripts: parsed.scripts,
      packageManager: typeof parsed.packageManager === 'string' ? parsed.packageManager : undefined,
    }
  } catch {
    return undefined
  }
}

async function findLockfileManager(directory: string): Promise<PackageManager | undefined> {
  for (const [lockfile, manager] of PACKAGE_MANAGER_LOCKFILES) {
    try {
      const lockfilePath = resolve(directory, lockfile)
      await access(lockfilePath)
      if ((await stat(lockfilePath)).isFile()) return manager
    } catch {
      // A missing or unreadable lockfile does not prevent checking the others.
    }
  }

  return undefined
}

async function resolvePackageManager(
  manifest: PackageManifest,
  directory: string,
  rootDirectory: string,
): Promise<PackageManager> {
  const declaredManager = packageManagerFromField(manifest.packageManager)
  if (declaredManager) return declaredManager

  const localManager = await findLockfileManager(directory)
  if (localManager) return localManager

  if (directory !== rootDirectory) {
    const rootManager = await findLockfileManager(rootDirectory)
    if (rootManager) return rootManager
  }

  return 'npm'
}

function isWithinRoot(rootDirectory: string, directory: string): boolean {
  const relativePath = relative(rootDirectory, directory)
  return relativePath === ''
    || (relativePath !== '..'
      && !relativePath.startsWith(`..${sep}`)
      && !isAbsolute(relativePath))
}

function workspaceDirectories(rootDirectory: string, repositoryPaths: string[] = []): string[] {
  const directories = [rootDirectory]
  const seen = new Set([
    process.platform === 'win32' ? rootDirectory.toLowerCase() : rootDirectory,
  ])

  for (const repositoryPath of repositoryPaths) {
    if (typeof repositoryPath !== 'string') continue

    const directory = resolve(rootDirectory, repositoryPath)
    if (!isWithinRoot(rootDirectory, directory)) continue

    const key = process.platform === 'win32' ? directory.toLowerCase() : directory
    if (seen.has(key)) continue

    seen.add(key)
    directories.push(directory)
  }

  return directories
}

function relativeDirectory(rootDirectory: string, directory: string): string {
  const relativePath = relative(rootDirectory, directory)
  return relativePath ? relativePath.split(sep).join('/') : '.'
}

function packageScriptCommand(packageManager: PackageManager, name: string): string | undefined {
  if (!name || name.includes('"') || name.includes('\u0000')) return undefined

  const argument = /^[A-Za-z0-9:_./@-]+$/.test(name) ? name : `"${name}"`
  return `${packageManager} run ${argument}`
}

async function discoverPackageScripts(rootDirectory: string, directories: string[]): Promise<WorkspaceScript[]> {
  const scripts: WorkspaceScript[] = []

  for (const directory of directories) {
    const manifest = await readPackageManifest(directory)
    if (!manifest) continue

    const packageManager = await resolvePackageManager(manifest, directory, rootDirectory)
    const packageDirectory = relativeDirectory(rootDirectory, directory)

    for (const [name, value] of Object.entries(manifest.scripts)) {
      if (typeof value !== 'string' || !value.trim()) continue

      const command = packageScriptCommand(packageManager, name)
      if (!command) continue

      scripts.push({
        id: `package:${packageDirectory}:${name}`,
        name,
        command,
        source: 'package',
        cwd: directory,
        packageDirectory,
      })
    }
  }

  return scripts
}

export async function discoverWorkspaceScripts(input: DiscoverWorkspaceScriptsInput): Promise<WorkspaceScript[]> {
  const rootDirectory = input.rootFolderPath ? resolve(input.rootFolderPath) : undefined
  const packageScripts = rootDirectory
    ? await discoverPackageScripts(
      rootDirectory,
      workspaceDirectories(rootDirectory, input.sourceControlRepositoryPaths),
    )
    : []
  const customCwd = rootDirectory ?? homedir()
  const customScripts = (input.customScripts ?? []).map((script) => ({
    id: `custom:${script.id}`,
    name: script.name,
    command: script.command,
    source: 'custom' as const,
    cwd: customCwd,
  }))

  return [...packageScripts, ...customScripts]
}

export function workspaceScriptTileId(scriptId: string): string {
  const digest = createHash('sha256').update(scriptId).digest('hex')
  return `script-${digest.slice(0, 24)}`
}
