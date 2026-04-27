import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { promises as fs } from 'fs'
import { basename, isAbsolute, relative, resolve, sep } from 'path'
import type { FileEntry, FileListOptions, FileListResult, FileSelectFolderResult } from '@shared/types'

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

function normalizeForCompare(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path
}

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

function hasTraversalSegment(relativePath: string): boolean {
  return relativePath.split(/[\\/]+/).some((segment) => segment === '..')
}

function getParentPath(relativeDir: string): string | null {
  if (!relativeDir) return null
  const segments = relativeDir.split('/').filter(Boolean)
  segments.pop()
  return segments.length > 0 ? segments.join('/') : ''
}

async function resolveRootTarget(
  rootPathInput: string,
  relativePath: string,
): Promise<{ rootPath: string; targetPath: string; relativePath: string }> {
  if (typeof rootPathInput !== 'string' || !rootPathInput.trim()) {
    throw new Error('Files folder is required')
  }
  if (typeof relativePath !== 'string') {
    throw new Error('Relative path must be a string')
  }
  if (relativePath.includes('\0')) {
    throw new Error('Invalid path')
  }
  if (isAbsolute(relativePath)) {
    throw new Error('Path must be relative to the files folder')
  }
  if (hasTraversalSegment(relativePath)) {
    throw new Error('Path traversal is not allowed')
  }

  let rootPath: string
  try {
    rootPath = await fs.realpath(rootPathInput)
  } catch {
    throw new Error('Files folder is unavailable')
  }

  const rootStat = await fs.stat(rootPath)
  if (!rootStat.isDirectory()) {
    throw new Error('Files folder is not a directory')
  }

  const rootResolved = resolve(rootPath)
  const targetPath = resolve(rootResolved, relativePath || '.')
  if (!isInsidePath(normalizeForCompare(rootResolved), normalizeForCompare(targetPath))) {
    throw new Error('Path escapes the files folder')
  }

  let targetRealPath: string
  try {
    targetRealPath = await fs.realpath(targetPath)
  } catch {
    throw new Error('Path does not exist')
  }
  if (!isInsidePath(normalizeForCompare(rootResolved), normalizeForCompare(targetRealPath))) {
    throw new Error('Path escapes the files folder')
  }

  return {
    rootPath: rootResolved,
    targetPath,
    relativePath: toRendererRelativePath(rootResolved, targetRealPath),
  }
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
    if (!isInsidePath(normalizeForCompare(resolved.rootPath), normalizeForCompare(entryPath))) continue

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

export function registerFilesIPC(): void {
  ipcMain.handle('files:selectFolder', async (_event, defaultPath?: string): Promise<FileSelectFolderResult | null> => {
    const win = BrowserWindow.getFocusedWindow()
    const options: OpenDialogOptions = {
      properties: ['openDirectory'],
      title: 'Select Files Folder',
      defaultPath: defaultPath || undefined,
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null

    const folderPath = result.filePaths[0]
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

  ipcMain.handle('files:open', async (_event, rootPath: string, relativePath: string) => {
    const { targetPath } = await resolveRootTarget(rootPath, relativePath)
    const error = await shell.openPath(targetPath)
    if (error) throw new Error(error)
  })

  ipcMain.handle('files:reveal', async (_event, rootPath: string, relativePath: string) => {
    const { targetPath } = await resolveRootTarget(rootPath, relativePath)
    shell.showItemInFolder(targetPath)
  })
}
