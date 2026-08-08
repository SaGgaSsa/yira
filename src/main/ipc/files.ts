import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { promises as fs } from 'fs'
import { basename, isAbsolute, relative, resolve, sep } from 'path'
import type { FileEntry, FileListOptions, FileListResult, FileSelectFolderResult, FileWriteInput } from '@shared/types'
import { canonicalizeRootFolderPath } from '../workspace-root'
import { readFile, readPreviewAsset, resolveRootTarget, statFile, writeFile } from './file-access'

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
