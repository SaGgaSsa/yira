import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function createDevDataDirectory(env) {
  const configuredDirectory = env.YIRA_DEV_DATA_DIR?.trim()

  if (configuredDirectory) {
    const dataDirectory = resolve(configuredDirectory)
    await mkdir(dataDirectory, { recursive: true })
    return { dataDirectory, temporary: false }
  }

  return {
    dataDirectory: await mkdtemp(join(tmpdir(), 'yira-dev-')),
    temporary: true,
  }
}

async function runDevServer() {
  const workspace = await createDevDataDirectory(process.env)
  const command = process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite'
  const child = spawn(command, ['dev'], {
    cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    env: { ...process.env, YIRA_HOME: workspace.dataDirectory },
    stdio: 'inherit',
  })
  let cleanedUp = false

  const cleanup = async () => {
    if (cleanedUp || !workspace.temporary) return
    cleanedUp = true
    await rm(workspace.dataDirectory, { recursive: true, force: true })
  }

  const stopChild = (signal) => {
    if (!child.killed) child.kill(signal)
  }

  process.once('SIGINT', () => stopChild('SIGINT'))
  process.once('SIGTERM', () => stopChild('SIGTERM'))

  child.once('error', async (error) => {
    await cleanup()
    throw error
  })

  child.once('close', async (code) => {
    await cleanup()
    process.exitCode = code ?? 1
  })

  console.log(`[dev] Using isolated data directory: ${workspace.dataDirectory}`)
}

const scriptPath = process.argv[1] && resolve(process.argv[1])
if (scriptPath === fileURLToPath(import.meta.url)) {
  void runDevServer()
}
