import { buildRemoteSshLaunch } from './remote-ssh'

const launch = buildRemoteSshLaunch({
  host: 'notebook.tailnet.ts.net',
  user: 'dev',
  port: 2202,
}, 'cd /srv/yira')

if (launch.args.join('|') !== [
  '-tt',
  '-p',
  '2202',
  '-l',
  'dev',
  'notebook.tailnet.ts.net',
  'cd /srv/yira\nexec "${SHELL:-/bin/bash}" -l',
].join('|')) {
  throw new Error(`unexpected SSH launch arguments: ${JSON.stringify(launch.args)}`)
}

const interactive = buildRemoteSshLaunch({
  host: 'localhost',
  user: 'dev',
})

if (interactive.args.join('|') !== ['-tt', '-l', 'dev', 'localhost'].join('|')) {
  throw new Error(`interactive SSH launch must not send a remote command: ${JSON.stringify(interactive.args)}`)
}

try {
  buildRemoteSshLaunch({ host: '-oProxyCommand=unexpected', user: 'dev' })
  throw new Error('unsafe SSH host must be rejected')
} catch (error) {
  if (!(error instanceof Error) || error.message !== 'Invalid remote SSH target') throw error
}
