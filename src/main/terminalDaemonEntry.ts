import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import {
  createNodePtyFactory,
  startTerminalDaemon,
  type TerminalDaemonHandle,
  type TerminalDaemonPtyFactory,
} from './terminalDaemonServer'

/** Start the standalone daemon from argv[2]. */
export async function runTerminalDaemonEntry(
  directory?: string,
  argv = process.argv,
): Promise<number> {
  const targetDirectory = directory ?? argv[2]
  if (typeof targetDirectory !== 'string' || !targetDirectory.trim()) {
    console.error('A terminal daemon directory is required in argv[2].')
    return 2
  }

  const require = createRequire(import.meta.url)
  const nodePty = require('node-pty') as TerminalDaemonPtyFactory
  const ptyFactory = createNodePtyFactory(nodePty)
  let handle: TerminalDaemonHandle | undefined
  let stopping: Promise<void> | undefined
  const stop = (): Promise<void> => {
    if (stopping) return stopping
    stopping = handle?.close() ?? Promise.resolve()
    return stopping
  }

  try {
    handle = await startTerminalDaemon({
      directory: targetDirectory,
      ptyFactory,
      onIdle: () => {
        void stop().finally(() => {
          process.exitCode = 0
        })
      },
    })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }

  const onSignal = (): void => {
    void stop().finally(() => {
      process.exitCode = 0
    })
  }
  process.once('SIGTERM', onSignal)
  process.once('SIGINT', onSignal)

  return 0
}

const entryPath = process.argv[1]
if (entryPath && resolve(entryPath) === resolve(fileURLToPath(import.meta.url))) {
  void runTerminalDaemonEntry().then((status) => {
    if (status !== 0) process.exitCode = status
  })
}
