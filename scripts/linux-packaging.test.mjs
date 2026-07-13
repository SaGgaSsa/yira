import assert from 'node:assert/strict'
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'

async function readPackageJson() {
  return JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options)
    let stderr = ''
    let stdout = ''

    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', code => {
      resolve({ code, stdout, stderr })
    })
  })
}

test('configures the Linux after-pack hook and Debian installer script', async () => {
  const packageJson = await readPackageJson()

  assert.equal(packageJson.build.afterPack, 'build/linux/after-pack.cjs')
  assert.equal(packageJson.build.deb.afterInstall, 'build/linux/deb-after-install.sh')
  assert.equal(packageJson.build.linux.icon, 'resources/icon.png')
  assert.deepEqual(packageJson.build.linux.desktop, {
    StartupWMClass: 'Yira',
  })
  assert.deepEqual(packageJson.build.appImage.executableArgs, ['--no-first-run'])

  const desktopExec = `AppRun ${packageJson.build.appImage.executableArgs.join(' ')} %U`
  assert.equal(desktopExec, 'AppRun --no-first-run %U')
  assert.doesNotMatch(desktopExec, /--no-sandbox/)
})

test('wraps the Linux launcher without changing the Electron binary contents', async () => {
  const { afterPack } = await import(new URL('../build/linux/after-pack.cjs', import.meta.url))
  const appOutDir = await mkdtemp(join(tmpdir(), 'yira-linux-packaging-'))
  const launcherPath = join(appOutDir, 'yira')

  try {
    await writeFile(launcherPath, 'electron-binary')

    await afterPack({
      electronPlatformName: 'linux',
      appOutDir,
    })

    assert.equal(await readFile(join(appOutDir, 'yira-bin'), 'utf8'), 'electron-binary')

    const launcher = await readFile(launcherPath, 'utf8')
    assert.match(launcher, /LAUNCHER=\$\(readlink -f "\$0"\)/)
    assert.match(launcher, /dirname -- "\$LAUNCHER"/)
    assert.match(launcher, /APPIMAGE/)
    assert.match(launcher, /unshare --user --map-root-user true/)
    assert.match(launcher, /Yira AppImage cannot start securely/)
    assert.match(launcher, /exec "\$HERE\/yira-bin" "\$@"/)
    assert.ok((await stat(launcherPath)).mode & 0o111)
  } finally {
    await rm(appOutDir, { recursive: true, force: true })
  }
})

test('leaves non-Linux package outputs untouched', async () => {
  const { afterPack } = await import(new URL('../build/linux/after-pack.cjs', import.meta.url))
  const appOutDir = await mkdtemp(join(tmpdir(), 'yira-linux-packaging-'))
  const launcherPath = join(appOutDir, 'yira')

  try {
    await writeFile(launcherPath, 'electron-binary')

    await afterPack({
      electronPlatformName: 'win32',
      appOutDir,
    })

    assert.equal(await readFile(launcherPath, 'utf8'), 'electron-binary')
  } finally {
    await rm(appOutDir, { recursive: true, force: true })
  }
})

test('only rejects an AppImage launch when user namespaces are unavailable', async () => {
  const { afterPack } = await import(new URL('../build/linux/after-pack.cjs', import.meta.url))
  const appOutDir = await mkdtemp(join(tmpdir(), 'yira-linux-packaging-'))
  const launcherPath = join(appOutDir, 'yira')
  const fakeBinDir = join(appOutDir, 'fake-bin')

  try {
    await writeFile(launcherPath, '#!/bin/sh\nprintf "electron started"\n')
    await chmod(launcherPath, 0o755)
    await mkdir(fakeBinDir)
    await writeFile(join(fakeBinDir, 'unshare'), '#!/bin/sh\nexit 1\n')
    await chmod(join(fakeBinDir, 'unshare'), 0o755)
    await afterPack({ electronPlatformName: 'linux', appOutDir })

    const appImageLaunch = await run(launcherPath, [], {
      env: { ...process.env, APPIMAGE: '/tmp/Yira.AppImage', PATH: `${fakeBinDir}:${process.env.PATH}` },
    })
    assert.equal(appImageLaunch.code, 78)
    assert.match(appImageLaunch.stderr, /Yira AppImage cannot start securely/)

    const debLaunch = await run(launcherPath, [], {
      env: { ...process.env, APPIMAGE: '', PATH: `${fakeBinDir}:${process.env.PATH}` },
    })
    assert.equal(debLaunch.code, 0)
    assert.equal(debLaunch.stdout, 'electron started')
  } finally {
    await rm(appOutDir, { recursive: true, force: true })
  }
})

test('installs and validates the Debian Chromium sandbox helper', async () => {
  const installer = await readFile(new URL('../build/linux/deb-after-install.sh', import.meta.url), 'utf8')

  assert.match(installer, /update-alternatives --install '\/usr\/bin\/yira' 'yira' '\/opt\/Yira\/yira' 100/)
  assert.match(installer, /chown root:root "\$sandbox_helper"/)
  assert.match(installer, /chmod 4755 "\$sandbox_helper"/)
  assert.match(installer, /stat -c '%U:%G %a' "\$sandbox_helper"/)
  assert.match(installer, /findmnt -no OPTIONS -T "\$app_dir"/)
  assert.match(installer, /nosuid/)
  assert.match(installer, /update-mime-database \/usr\/share\/mime/)
  assert.match(installer, /update-desktop-database \/usr\/share\/applications/)
})

test('validates Linux packaging policy before publishing Linux artifacts', async () => {
  const workflow = await readFile(new URL('../.github/workflows/windows-release.yml', import.meta.url), 'utf8')
  const policyCheck = 'node scripts/linux-packaging.test.mjs'
  const releaseBuild = 'npm run release:linux'

  assert.ok(workflow.includes(policyCheck))
  assert.ok(workflow.indexOf(policyCheck) < workflow.indexOf(releaseBuild))
})
