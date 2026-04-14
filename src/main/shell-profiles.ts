import { existsSync } from 'fs'
import { execSync } from 'child_process'
import os from 'os'
import type { ShellProfile } from '@shared/types'

const isWindows = os.platform() === 'win32'

/**
 * Detect available shell profiles based on the operating system.
 */
function findOnPath(candidates: string[]): string | null {
  if (isWindows) {
    // Windows: use where.exe
    for (const name of candidates) {
      try {
        const result = execSync(`where.exe ${name}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
        const first = result.trim().split('\r\n')[0]
        if (first) return first
      } catch {
        // not on PATH, try hardcoded paths
      }
    }
    // Fallback to known Windows paths
    for (const p of candidates) {
      if (existsSync(p)) return p
    }
  } else {
    // Linux/macOS: use which
    for (const name of candidates) {
      try {
        const result = execSync(`which ${name}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
        const path = result.trim()
        if (path) return path
      } catch {
        // not found
      }
    }
  }
  return null
}

export function detectShellProfiles(): ShellProfile[] {
  if (isWindows) {
    const pwsh = findOnPath(['pwsh.exe', 'powershell.exe', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'])
    const cmd = findOnPath(['cmd.exe', 'C:\\Windows\\System32\\cmd.exe'])
    const wsl = findOnPath(['wsl.exe', 'C:\\Windows\\System32\\wsl.exe'])

    return [
      {
        id: 'powershell',
        label: pwsh?.toLowerCase().includes('pwsh') ? 'PowerShell 7' : 'PowerShell',
        shell: pwsh ?? 'powershell.exe',
        args: pwsh?.toLowerCase().includes('pwsh') ? ['-NoLogo'] : ['-NoLogo', '-NoProfile'],
        available: pwsh !== null,
      },
      {
        id: 'cmd',
        label: 'Command Prompt',
        shell: cmd ?? 'cmd.exe',
        args: [],
        available: cmd !== null,
      },
      {
        id: 'wsl',
        label: 'WSL',
        shell: wsl ?? 'wsl.exe',
        args: [],
        available: wsl !== null,
      },
    ]
  } else {
    // Linux/macOS shells
    const bash = findOnPath(['bash'])
    const zsh = findOnPath(['zsh'])
    const fish = findOnPath(['fish'])

    return [
      {
        id: 'bash',
        label: 'Bash',
        shell: bash ?? 'bash',
        args: ['--login'],
        available: bash !== null,
      },
      {
        id: 'zsh',
        label: 'Zsh',
        shell: zsh ?? 'zsh',
        args: ['--login'],
        available: zsh !== null,
      },
      {
        id: 'fish',
        label: 'Fish',
        shell: fish ?? 'fish',
        args: [],
        available: fish !== null,
      },
    ]
  }
}
