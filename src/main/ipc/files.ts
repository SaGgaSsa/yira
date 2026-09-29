import { createRequire } from 'node:module'
import type { OpenDialogOptions } from 'electron'
import { constants as fsConstants, promises as fs } from 'fs'
import type { Stats } from 'fs'
import type { FileHandle } from 'fs/promises'
import { basename, isAbsolute, relative, resolve, sep } from 'path'
import type { FileEntry, FileListOptions, FileListResult, FileSearchEntry, FileSearchResult, FileSelectFolderResult, FileWriteInput } from '@shared/types'
import { compileFileSearchQuery } from '@shared/fileSearch'
import { canonicalizeRootFolderPath } from '../workspace-root'
import { mainText } from '../i18n'
import { readFile, readPreviewAsset, resolveRootTarget, statFile, writeFile } from './file-access'

const electronApi = createRequire(import.meta.url)('electron') as typeof import('electron')
const { BrowserWindow, dialog, ipcMain } = electronApi

const IGNORED_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'dist-electron',
  'build',
  'release',
  'coverage',
  '.next',
  '.vite',
])

function isInsidePath(rootPath: string, targetPath: string): boolean {
  const relativePath = relative(rootPath, targetPath)
  return relativePath === '' || (
    !relativePath.startsWith('..') &&
    !isAbsolute(relativePath)
  )
}

function normalizeForCompare(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path
}

function toRendererRelativePath(rootPath: string, targetPath: string): string {
  const value = relative(rootPath, targetPath)
  return value.split(sep).join('/')
}

function joinRendererPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

function shouldHideEntry(name: string): boolean {
  const key = name.toLowerCase()
  return name.startsWith('.') || IGNORED_NAMES.has(key)
}

function getParentPath(relativeDir: string): string | null {
  if (!relativeDir) return null
  const segments = relativeDir.split('/').filter(Boolean)
  segments.pop()
  return segments.length > 0 ? segments.join('/') : ''
}

async function listFiles(
  rootPath: string,
  relativeDir: string,
  options: FileListOptions = {},
): Promise<FileListResult> {
  const resolved = await resolveRootTarget(rootPath, relativeDir)
  const targetStat = await fs.stat(resolved.targetPath)
  if (!targetStat.isDirectory()) {
    throw new Error('Path is not a directory')
  }

  const currentDir = resolved.relativePath
  const dirents = await fs.readdir(resolved.targetPath, { withFileTypes: true })
  const entries: FileEntry[] = []

  for (const dirent of dirents) {
    if (!options.showIgnored && shouldHideEntry(dirent.name)) continue

    const entryPath = resolve(resolved.targetPath, dirent.name)
    if (!isInsidePath(resolved.rootPath, entryPath)) continue

    try {
      const stat = await fs.lstat(entryPath)
      entries.push({
        name: dirent.name,
        relativePath: joinRendererPath(currentDir, dirent.name),
        kind: dirent.isDirectory() ? 'directory' : 'file',
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      })
    } catch {
      // Skip entries that disappear or cannot be read while listing.
    }
  }

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })

  return {
    currentDir,
    currentPath: resolved.targetPath,
    parentPath: getParentPath(currentDir),
    entries,
    rootLabel: basename(resolved.rootPath) || resolved.rootPath,
    rootPath: resolved.rootPath,
  }
}

async function collectSearchEntries(
  rootPath: string,
  directory: SearchDirectory,
  matches: (fileName: string, relativePath?: string) => boolean,
  entries: FileSearchEntry[],
  tolerateReadError: boolean,
): Promise<void> {
  let dirents: import('fs').Dirent[]
  try {
    dirents = await directory.readEntries()
  } catch (error) {
    if (tolerateReadError) return
    throw error
  }

  for (const dirent of dirents) {
    if (shouldHideEntry(dirent.name)) continue

    const entryPath = resolve(directory.readPath, dirent.name)

    let entryStat: import('fs').Stats
    try {
      entryStat = await fs.lstat(entryPath)
    } catch {
      // Skip entries that disappear or cannot be read while searching.
      continue
    }

    if (entryStat.isSymbolicLink()) continue
    if (entryStat.isDirectory()) {
      const childDirectory = await openSearchDirectory(rootPath, entryPath, true)
      if (!childDirectory) continue
      try {
        await collectSearchEntries(rootPath, {
          ...childDirectory,
          relativePath: joinRendererPath(directory.relativePath, dirent.name),
        }, matches, entries, true)
      } finally {
        await childDirectory.close()
      }
      continue
    }
    const relativePath = joinRendererPath(directory.relativePath, dirent.name)
    if (!entryStat.isFile() || !matches(dirent.name, relativePath)) continue

    entries.push({
      name: dirent.name,
      relativePath,
    })
  }
}

interface SearchDirectory {
  readPath: string
  relativePath: string
  readEntries: () => Promise<import('fs').Dirent[]>
  close: () => Promise<void>
}

function descriptorDirectoryPath(): string | null {
  if (process.platform === 'linux') return '/proc/self/fd'
  if (process.platform === 'darwin') return '/dev/fd'
  return null
}

function descriptorPathForHandle(handle: FileHandle): string | null {
  const directoryPath = descriptorDirectoryPath()
  return directoryPath ? `${directoryPath}/${handle.fd}` : null
}

function sameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

const SEARCH_DIRECTORY_FLAGS = fsConstants.O_RDONLY
  | (fsConstants.O_DIRECTORY ?? 0)
  | (fsConstants.O_NOFOLLOW ?? 0)

async function openDescriptorSearchDirectory(
  rootPath: string,
  directoryPath: string,
  tolerateReadError: boolean,
): Promise<SearchDirectory | null> {
  let handle: FileHandle
  try {
    handle = await fs.open(directoryPath, SEARCH_DIRECTORY_FLAGS)
  } catch (error) {
    if (tolerateReadError) return null
    throw error
  }

  let keepOpen = false
  try {
    const descriptorStat = await handle.stat()
    if (!descriptorStat.isDirectory()) return null

    const descriptorPath = descriptorPathForHandle(handle)
    if (descriptorPath) {
      const descriptorTarget = await fs.realpath(descriptorPath)
      if (!isInsidePath(normalizeForCompare(rootPath), normalizeForCompare(descriptorTarget))) {
        throw new Error('Path escapes the files folder')
      }
      keepOpen = true
      return {
        readPath: descriptorPath,
        relativePath: '',
        readEntries: () => fs.readdir(descriptorPath, { withFileTypes: true }),
        close: () => handle.close(),
      }
    }
    throw new Error('Directory descriptors are unavailable')
  } catch (error) {
    if (tolerateReadError) return null
    throw error
  } finally {
    if (!keepOpen) await handle.close().catch(() => undefined)
  }
}

async function readDirectoryEntries(directory: import('fs').Dir): Promise<import('fs').Dirent[]> {
  const entries: import('fs').Dirent[] = []
  while (true) {
    const entry = await directory.read()
    if (!entry) return entries
    entries.push(entry)
  }
}

async function openPathSearchDirectory(
  rootPath: string,
  directoryPath: string,
  tolerateReadError: boolean,
): Promise<SearchDirectory | null> {
  let before: Stats
  let beforeRealPath: string
  try {
    before = await fs.lstat(directoryPath)
    if (before.isSymbolicLink() || !before.isDirectory()) return null
    beforeRealPath = await fs.realpath(directoryPath)
    if (!isInsidePath(normalizeForCompare(rootPath), normalizeForCompare(beforeRealPath))) return null
  } catch (error) {
    if (tolerateReadError) return null
    throw error
  }

  let directory: import('fs').Dir
  try {
    directory = await fs.opendir(directoryPath)
  } catch (error) {
    if (tolerateReadError) return null
    throw error
  }

  let keepOpen = false
  try {
    const after = await fs.lstat(directoryPath)
    const afterRealPath = await fs.realpath(directoryPath)
    if (
      after.isSymbolicLink()
      || !after.isDirectory()
      || !sameFile(before, after)
      || normalizeForCompare(beforeRealPath) !== normalizeForCompare(afterRealPath)
      || !isInsidePath(normalizeForCompare(rootPath), normalizeForCompare(afterRealPath))
    ) return null

    keepOpen = true
    return {
      readPath: directoryPath,
      relativePath: '',
      readEntries: async () => {
        const current = await fs.lstat(directoryPath)
        const currentRealPath = await fs.realpath(directoryPath)
        if (
          current.isSymbolicLink()
          || !current.isDirectory()
          || !sameFile(before, current)
          || normalizeForCompare(beforeRealPath) !== normalizeForCompare(currentRealPath)
        ) {
          throw new Error('Path changed while opening')
        }
        return readDirectoryEntries(directory)
      },
      close: () => directory.close(),
    }
  } catch (error) {
    if (tolerateReadError) return null
    throw error
  } finally {
    if (!keepOpen) await directory.close().catch(() => undefined)
  }
}

async function openSearchDirectory(
  rootPath: string,
  directoryPath: string,
  tolerateReadError: boolean,
): Promise<SearchDirectory | null> {
  return descriptorDirectoryPath()
    ? openDescriptorSearchDirectory(rootPath, directoryPath, tolerateReadError)
    : openPathSearchDirectory(rootPath, directoryPath, tolerateReadError)
}

export async function searchFiles(rootPath: string, query: string): Promise<FileSearchResult> {
  const compiled = compileFileSearchQuery(query)
  if (!compiled.ok) throw new Error(compiled.error)

  const resolved = await resolveRootTarget(rootPath, '')
  const entries: FileSearchEntry[] = []
  const rootDirectory = await openSearchDirectory(resolved.rootPath, resolved.targetPath, false)
  if (!rootDirectory) throw new Error('Files folder is not a directory')
  try {
    await collectSearchEntries(resolved.rootPath, rootDirectory, compiled.matches, entries, false)
  } finally {
    await rootDirectory.close()
  }

  entries.sort((left, right) => (
    left.relativePath.localeCompare(right.relativePath, undefined, { numeric: true, sensitivity: 'base' })
    || left.relativePath.localeCompare(right.relativePath, undefined, { numeric: true })
  ))

  return { entries }
}

export function registerFilesIPC(): void {
  ipcMain.handle('files:openFolder', async (_event, folderPath: string): Promise<void> => {
    if (typeof folderPath !== 'string' || !folderPath.trim() || !isAbsolute(folderPath)) {
      throw new Error('Invalid folder path')
    }
    if (!(await fs.stat(folderPath)).isDirectory()) {
      throw new Error('Path is not a folder')
    }
    const error = await electronApi.shell.openPath(folderPath)
    if (error) throw new Error(error)
  })

  ipcMain.handle('files:selectFolder', async (_event, defaultPath?: string): Promise<FileSelectFolderResult | null> => {
    const win = BrowserWindow.getFocusedWindow()
    const options: OpenDialogOptions = {
      properties: ['openDirectory'],
      title: mainText('selectWorkspaceRootFolder'),
      defaultPath: defaultPath || undefined,
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null

    const folderPath = await canonicalizeRootFolderPath(result.filePaths[0])
    return {
      path: folderPath,
      name: basename(folderPath) || folderPath,
    }
  })

  ipcMain.handle(
    'files:list',
    async (_event, rootPath: string, relativeDir = '', options: FileListOptions = {}) =>
      listFiles(rootPath, relativeDir, options),
  )

  ipcMain.handle('files:search', async (_event, rootPath: string, query: string) =>
    searchFiles(rootPath, query),
  )

  ipcMain.handle('files:read', async (_event, rootPath: string, relativePath: string) =>
    readFile(rootPath, relativePath),
  )

  ipcMain.handle('files:stat', async (_event, rootPath: string, relativePath: string) =>
    statFile(rootPath, relativePath),
  )

  ipcMain.handle('files:write', async (_event, rootPath: string, relativePath: string, input: FileWriteInput) =>
    writeFile(rootPath, relativePath, input),
  )

  ipcMain.handle('files:readPreviewAsset', async (_event, rootPath: string, relativePath: string) =>
    readPreviewAsset(rootPath, relativePath),
  )

}
