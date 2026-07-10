import type { RemoteTerminalConfig } from '@shared/types'

export interface RemoteSshLaunch {
  args: string[]
}

export function buildRemoteSshLaunch(
  target: RemoteTerminalConfig,
  startupCommand?: string,
): RemoteSshLaunch {
  if (
    !target.host ||
    !target.user ||
    /\s/.test(target.host) ||
    /\s/.test(target.user) ||
    target.host.startsWith('-') ||
    target.user.startsWith('-') ||
    (target.port !== undefined && (!Number.isInteger(target.port) || target.port < 1 || target.port > 65535))
  ) {
    throw new Error('Invalid remote SSH target')
  }

  const args = ['-tt']

  if (target.port !== undefined) {
    args.push('-p', String(target.port))
  }

  args.push('-l', target.user, target.host)

  const command = startupCommand?.trim()
  if (command) {
    args.push(`${command}\nexec "\${SHELL:-/bin/bash}" -l`)
  }

  return { args }
}
