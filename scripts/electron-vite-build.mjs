import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const target = process.argv[2] ?? 'all'
const binName = process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite'
const electronViteBin = resolve(rootDir, 'node_modules', '.bin', binName)

const child = spawn(electronViteBin, ['build'], {
  cwd: rootDir,
  env: {
    ...process.env,
    EV_BUILD_TARGET: target,
  },
  stdio: 'inherit',
})

child.on('error', (error) => {
  console.error(`Failed to start electron-vite for target "${target}":`, error)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
