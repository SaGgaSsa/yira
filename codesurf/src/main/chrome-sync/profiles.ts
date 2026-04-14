import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface ChromeProfile {
  name: string
  dir: string
  email?: string
  avatarIcon?: string
}

export const CHROME_BASE = join(
  homedir(),
  'Library',
  'Application Support',
  'Google',
  'Chrome',
)

export function listProfiles(): ChromeProfile[] {
  try {
    const localState = JSON.parse(
      readFileSync(join(CHROME_BASE, 'Local State'), 'utf-8'),
    )
    const cache = localState?.profile?.info_cache
    if (!cache || typeof cache !== 'object') return []

    return Object.entries(cache).map(([dir, info]: [string, any]) => ({
      name: info.name || dir,
      dir,
      email: info.user_name || undefined,
      avatarIcon: info.avatar_icon || undefined,
    }))
  } catch {
    return []
  }
}

export function profilePath(profileDir: string): string {
  return join(CHROME_BASE, profileDir)
}
