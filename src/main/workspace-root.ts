import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import type { ShellProfileId, WorkspaceMetadata, WorkspaceOpenFolderResult } from '@shared/types'

export async function canonicalizeRootFolderPath(rootFolderPath: string): Promise<string> {
  const trimmed = rootFolderPath.trim()
  if (!trimmed) return ''

  try {
    return await fs.realpath(trimmed)
  } catch {
    return trimmed
  }
}

function stripTrailingSeparators(value: string): string {
  if (/^[a-zA-Z]:[\\/]?$/.test(value)) return value.replace('/', '\\')
  if (value === '/' || /^\\\\[^\\]+\\[^\\]+\\?$/.test(value)) return value

  return value.replace(/[\\/]+$/, '')
}

function isWindowsLikePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('//')
}

export function normalizeRootFolderForComparison(rootFolderPath: string): string {
  const trimmed = stripTrailingSeparators(rootFolderPath.trim())
  if (!trimmed) return ''

  if (isWindowsLikePath(trimmed)) {
    return stripTrailingSeparators(path.win32.normalize(trimmed.replace(/\//g, '\\'))).toLowerCase()
  }

  return stripTrailingSeparators(path.posix.normalize(trimmed.replace(/\\/g, '/')))
}

export function findWorkspaceByRootFolder(
  workspaces: WorkspaceMetadata[],
  selectedRootFolderPath: string,
): WorkspaceMetadata | null {
  const selected = normalizeRootFolderForComparison(selectedRootFolderPath)
  if (!selected) return null

  return workspaces.find((workspace) => {
    const rootFolderPath = workspace.config.rootFolderPath
    return rootFolderPath
      ? normalizeRootFolderForComparison(rootFolderPath) === selected
      : false
  }) ?? null
}

function basenameForAnyPlatform(rootFolderPath: string): string {
  const normalized = stripTrailingSeparators(rootFolderPath.trim())
  return path.win32.basename(normalized) || path.posix.basename(normalized) || normalized
}

export function buildUnknownWorkspaceFolderResult(selectedRootFolderPath: string): WorkspaceOpenFolderResult {
  return {
    workspace: null,
    canceled: false,
    selectedRootFolderPath,
    suggestedName: basenameForAnyPlatform(selectedRootFolderPath),
  }
}

function translateWindowsDriveToWsl(rootFolderPath: string): string | null {
  const match = /^([a-zA-Z]):[\\/](.*)$/.exec(rootFolderPath.trim())
  if (!match) return null

  const drive = match[1].toLowerCase()
  const rest = match[2].replace(/\\/g, '/')
  return `/mnt/${drive}/${rest}`.replace(/\/+$/, '')
}

function translateWslUncToLinux(rootFolderPath: string): string | null {
  const normalized = rootFolderPath.trim().replace(/\//g, '\\')
  const match = /^\\\\(?:wsl\$|wsl\.localhost)\\[^\\]+\\(.+)$/.exec(normalized)
  if (!match) return null

  return `/${match[1].replace(/\\/g, '/')}`.replace(/\/+$/, '') || '/'
}

export function translateHostRootToWsl(rootFolderPath: string): string | null {
  return translateWindowsDriveToWsl(rootFolderPath) ?? translateWslUncToLinux(rootFolderPath)
}

export interface TerminalWorkspaceRootInput {
  shellProfileId: ShellProfileId
  workspaceRootFolderPath?: string
  platform?: NodeJS.Platform
  wslStartInHome?: boolean
}

export interface TerminalWorkspaceRootResult {
  cwd: string
  spawnArgs: string[]
}

export function resolveTerminalWorkspaceRoot(input: TerminalWorkspaceRootInput): TerminalWorkspaceRootResult {
  const platform = input.platform ?? os.platform()
  const rootFolderPath = input.workspaceRootFolderPath?.trim()
  const fallbackCwd = process.cwd()

  if (!rootFolderPath) {
    return {
      cwd: fallbackCwd,
      spawnArgs: input.shellProfileId === 'wsl' && input.wslStartInHome ? ['--cd', '~'] : [],
    }
  }

  if (input.shellProfileId === 'wsl' && platform === 'win32') {
    const wslPath = translateHostRootToWsl(rootFolderPath)
    if (wslPath) return { cwd: fallbackCwd, spawnArgs: ['--cd', wslPath] }
  }

  return { cwd: rootFolderPath, spawnArgs: [] }
}
