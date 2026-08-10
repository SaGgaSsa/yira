import { strict as assert } from 'node:assert'
import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isLinuxDebUpdatePath, startLinuxDebUpdateLauncher } from './linuxDebUpdateLauncher'

interface SpawnCall {
  command: string
  args: readonly string[]
  options: SpawnOptions
}

class FakeChild extends EventEmitter {
  unrefCount = 0
  didSpawn = false

  unref(): this {
    this.unrefCount += 1
    return this
  }

  emitSpawn(): void {
    this.didSpawn = true
    this.emit('spawn')
  }

  emitError(error: Error): void {
    if (this.listenerCount('error') > 0) this.emit('error', error)
  }
}

function createFakeSpawn(
  outcome: 'spawn' | 'error',
  calls: SpawnCall[],
  children: FakeChild[],
): typeof spawn {
  return ((command: string, args: readonly string[], options: SpawnOptions) => {
    const child = new FakeChild()
    calls.push({ command, args, options })
    children.push(child)
    queueMicrotask(() => {
      if (outcome === 'spawn') child.emitSpawn()
      else child.emitError(new Error('launcher process failed to spawn'))
    })
    return child as unknown as ChildProcess
  }) as typeof spawn
}

function loadUpdaterRouting(): typeof import('./updater') {
  const nodeRequire = createRequire(import.meta.url)
  const nodeModule = nodeRequire('node:module') as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown
  }
  const originalLoad = nodeModule._load
  const fakeElectron = {
    app: {
      isPackaged: false,
      getVersion: () => '0.1.50',
      getLocale: () => 'en-US',
    },
    BrowserWindow: { getAllWindows: () => [] },
    ipcMain: { handle: () => undefined },
  }
  const fakeUpdater = {
    autoUpdater: {
      autoInstallOnAppQuit: true,
      on: () => undefined,
    },
  }

  nodeModule._load = function(request, parent, isMain) {
    if (request === 'electron') return fakeElectron
    if (request === 'electron-updater') return fakeUpdater
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    return nodeRequire('./updater.ts') as typeof import('./updater')
  } finally {
    nodeModule._load = originalLoad
  }
}

async function run(): Promise<void> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'yira-linux-deb-update-launcher-'))
  const packagePath = join(tempRoot, 'update.deb')
  const launcherPath = join(tempRoot, 'linux-deb-update-launcher.sh')
  const directoryPath = join(tempRoot, 'directory.deb')
  const appImagePath = join(tempRoot, 'update.AppImage')
  const uppercaseDebPath = join(tempRoot, 'update.DEB')

  try {
    await writeFile(packagePath, 'debian package fixture')
    await writeFile(launcherPath, '#!/bin/sh\n')
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

    const { shouldUseLinuxDebUpdateLauncher } = loadUpdaterRouting()
    assert.equal(shouldUseLinuxDebUpdateLauncher('linux', packagePath), true)
    assert.equal(shouldUseLinuxDebUpdateLauncher('win32', packagePath), false)
    assert.equal(shouldUseLinuxDebUpdateLauncher('linux', appImagePath), false)

    const calls: SpawnCall[] = []
    const children: FakeChild[] = []
    const fakeSpawn = createFakeSpawn('spawn', calls, children)

    await startLinuxDebUpdateLauncher({
      launcherPath,
      packagePath,
      diagnosticsPath: '/home/alice/.yira/logs/updater.log',
      diagnosticsEnabled: true,
      version: '0.1.51',
      spawn: fakeSpawn,
    })

    assert.deepEqual(calls[0], {
      command: '/bin/sh',
      args: [
        launcherPath, packagePath,
        '/home/alice/.yira/logs/updater.log', '1', '0.1.51', '/usr/bin/yira',
      ],
      options: { detached: true, stdio: 'ignore' },
    })
    assert.equal(children.length, 1)
    assert.equal(children[0]?.didSpawn, true)
    assert.equal(children[0]?.unrefCount, 1)

    await assert.rejects(
      () => startLinuxDebUpdateLauncher({
        launcherPath,
        packagePath: appImagePath,
        diagnosticsPath: '/home/alice/.yira/logs/updater.log',
        diagnosticsEnabled: true,
        version: '0.1.51',
        spawn: fakeSpawn,
      }),
      { message: 'Downloaded Linux update is not a Debian package' },
    )
    assert.equal(calls.length, 1)

    const missingLauncherCalls: SpawnCall[] = []
    const missingLauncherChildren: FakeChild[] = []
    const missingLauncherPath = join(tempRoot, 'missing-launcher.sh')
    await assert.rejects(
      () => startLinuxDebUpdateLauncher({
        launcherPath: missingLauncherPath,
        packagePath,
        diagnosticsPath: '/home/alice/.yira/logs/updater.log',
        diagnosticsEnabled: true,
        version: '0.1.51',
        spawn: createFakeSpawn('spawn', missingLauncherCalls, missingLauncherChildren),
      }),
      /launcher/,
    )
    assert.equal(missingLauncherCalls.length, 0)
    assert.equal(missingLauncherChildren.length, 0)

    const errorCalls: SpawnCall[] = []
    const errorChildren: FakeChild[] = []
    await assert.rejects(
      () => startLinuxDebUpdateLauncher({
        launcherPath,
        packagePath,
        diagnosticsPath: '/home/alice/.yira/logs/updater.log',
        diagnosticsEnabled: true,
        version: '0.1.51',
        spawn: createFakeSpawn('error', errorCalls, errorChildren),
      }),
      { message: 'launcher process failed to spawn' },
    )
    assert.equal(errorCalls.length, 1)
    assert.equal(errorChildren[0]?.didSpawn, false)
    assert.equal(errorChildren[0]?.unrefCount, 0)

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
