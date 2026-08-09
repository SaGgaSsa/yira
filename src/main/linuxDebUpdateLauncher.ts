import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'

export interface LinuxDebUpdateLauncherInput {
  launcherPath: string
  packagePath: string
  diagnosticsPath: string
  diagnosticsEnabled: boolean
  version: string
  spawn?: typeof spawn
}

export async function isLinuxDebUpdatePath(filePath: string | null): Promise<boolean> {
  if (!filePath || !isAbsolute(filePath) || !filePath.endsWith('.deb')) return false

  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

export async function startLinuxDebUpdateLauncher(input: LinuxDebUpdateLauncherInput): Promise<void> {
  if (!isAbsolute(input.launcherPath)) {
    throw new Error('Linux update launcher path must be absolute')
  }

  if (!await isLinuxDebUpdatePath(input.packagePath)) {
    throw new Error('Downloaded Linux update is not a Debian package')
  }

  const child = (input.spawn ?? spawn)('/bin/sh', [
    input.launcherPath,
    input.packagePath,
    input.diagnosticsPath,
    input.diagnosticsEnabled ? '1' : '0',
    input.version,
    '/usr/bin/yira',
  ], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}
