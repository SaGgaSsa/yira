import { strict as assert } from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isLinuxDebUpdatePath, startLinuxDebUpdateLauncher } from './linuxDebUpdateLauncher'

interface SpawnCall {
  command: string
  args: readonly string[]
  options: SpawnOptions
}

async function run(): Promise<void> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'yira-linux-deb-update-launcher-'))
  const packagePath = join(tempRoot, 'update.deb')
  const directoryPath = join(tempRoot, 'directory.deb')
  const appImagePath = join(tempRoot, 'update.AppImage')
  const uppercaseDebPath = join(tempRoot, 'update.DEB')

  try {
    await writeFile(packagePath, 'debian package fixture')
    await mkdir(directoryPath)
    await writeFile(appImagePath, 'app image fixture')
    await writeFile(uppercaseDebPath, 'uppercase extension fixture')

    if (!await isLinuxDebUpdatePath(packagePath)) {
      throw new Error('an existing absolute lower-case .deb regular file must be accepted')
    }
    if (await isLinuxDebUpdatePath('update.deb')) {
      throw new Error('a relative update path must be rejected')
    }
    if (await isLinuxDebUpdatePath(directoryPath)) {
      throw new Error('a directory ending in .deb must be rejected')
    }
    if (await isLinuxDebUpdatePath(appImagePath)) {
      throw new Error('an AppImage update must be rejected')
    }
    if (await isLinuxDebUpdatePath(uppercaseDebPath)) {
      throw new Error('an upper-case .DEB update must be rejected')
    }
    if (await isLinuxDebUpdatePath(null)) {
      throw new Error('a missing update path must be rejected')
    }

    const calls: SpawnCall[] = []
    let unrefCount = 0
    const fakeSpawn = ((command: string, args: readonly string[], options: SpawnOptions) => {
      calls.push({ command, args, options })
      return {
        unref: () => {
          unrefCount += 1
        },
      } as ChildProcess
    }) as typeof spawn

    await startLinuxDebUpdateLauncher({
      launcherPath: '/opt/Yira/resources/linux-deb-update-launcher.sh',
      packagePath,
      diagnosticsPath: '/home/alice/.yira/logs/updater.log',
      diagnosticsEnabled: true,
      version: '0.1.51',
      spawn: fakeSpawn,
    })

    assert.deepEqual(calls[0], {
      command: '/bin/sh',
      args: [
        '/opt/Yira/resources/linux-deb-update-launcher.sh', packagePath,
        '/home/alice/.yira/logs/updater.log', '1', '0.1.51', '/usr/bin/yira',
      ],
      options: { detached: true, stdio: 'ignore' },
    })
    assert.equal(unrefCount, 1)

    await assert.rejects(
      () => startLinuxDebUpdateLauncher({
        launcherPath: '/opt/Yira/resources/linux-deb-update-launcher.sh',
        packagePath: appImagePath,
        diagnosticsPath: '/home/alice/.yira/logs/updater.log',
        diagnosticsEnabled: true,
        version: '0.1.51',
        spawn: fakeSpawn,
      }),
      { message: 'Downloaded Linux update is not a Debian package' },
    )
    assert.equal(calls.length, 1)

    await assert.rejects(
      () => startLinuxDebUpdateLauncher({
        launcherPath: 'resources/linux-deb-update-launcher.sh',
        packagePath,
        diagnosticsPath: '/home/alice/.yira/logs/updater.log',
        diagnosticsEnabled: false,
        version: '0.1.51',
        spawn: fakeSpawn,
      }),
      /absolute/,
    )
    assert.equal(calls.length, 1)
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

void run()
