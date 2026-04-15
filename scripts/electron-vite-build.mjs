import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const target = process.argv[2] ?? 'all'
const electronViteCli = resolve(rootDir, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')

const child = spawn(process.execPath, [electronViteCli, 'build'], {
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
