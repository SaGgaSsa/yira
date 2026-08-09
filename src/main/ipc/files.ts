import { createRequire } from 'node:module'
import type { OpenDialogOptions } from 'electron'
import { promises as fs } from 'fs'
import { basename, isAbsolute, relative, resolve, sep } from 'path'
import type { FileEntry, FileListOptions, FileListResult, FileSearchEntry, FileSearchResult, FileSelectFolderResult, FileWriteInput } from '@shared/types'
import { compileFileSearchQuery } from '@shared/fileSearch'
import { canonicalizeRootFolderPath } from '../workspace-root'
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
  directoryPath: string,
  matches: (fileName: string) => boolean,
  entries: FileSearchEntry[],
  tolerateReadError: boolean,
): Promise<void> {
  let dirents: import('fs').Dirent[]
  try {
    dirents = await fs.readdir(directoryPath, { withFileTypes: true })
  } catch (error) {
    if (tolerateReadError) return
    throw error
  }

  for (const dirent of dirents) {
    if (shouldHideEntry(dirent.name)) continue

    const entryPath = resolve(directoryPath, dirent.name)
    if (!isInsidePath(rootPath, entryPath)) continue

    let entryStat: import('fs').Stats
    try {
      entryStat = await fs.lstat(entryPath)
    } catch {
      // Skip entries that disappear or cannot be read while searching.
      continue
    }

    if (entryStat.isSymbolicLink()) continue
    if (entryStat.isDirectory()) {
      await collectSearchEntries(rootPath, entryPath, matches, entries, true)
      continue
    }
    if (!entryStat.isFile() || !matches(dirent.name)) continue

    entries.push({
      name: dirent.name,
      relativePath: toRendererRelativePath(rootPath, entryPath),
    })
  }
}

export async function searchFiles(rootPath: string, query: string): Promise<FileSearchResult> {
  const compiled = compileFileSearchQuery(query)
  if (!compiled.ok) throw new Error(compiled.error)

  const resolved = await resolveRootTarget(rootPath, '')
  const entries: FileSearchEntry[] = []
  await collectSearchEntries(resolved.rootPath, resolved.targetPath, compiled.matches, entries, false)

  entries.sort((left, right) => (
    left.relativePath.localeCompare(right.relativePath, undefined, { numeric: true, sensitivity: 'base' })
    || left.relativePath.localeCompare(right.relativePath, undefined, { numeric: true })
  ))

  return { entries }
}

export function registerFilesIPC(): void {
  ipcMain.handle('files:selectFolder', async (_event, defaultPath?: string): Promise<FileSelectFolderResult | null> => {
    const win = BrowserWindow.getFocusedWindow()
    const options: OpenDialogOptions = {
      properties: ['openDirectory'],
      title: 'Select Workspace Root Folder',
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
