import { promises as fs } from 'fs'

const RENAME_RETRY_DELAYS_MS = [10, 50, 100, 200]

let temporaryFileCounter = 0

function isTransientRenameError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY'
}

// Windows rejects a rename while another process holds the target open; those locks are brief.
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (const delayMs of RENAME_RETRY_DELAYS_MS) {
    try {
      await fs.rename(from, to)
      return
    } catch (error) {
      if (!isTransientRenameError(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  await fs.rename(from, to)
}

/** Writes through a unique sibling temp file so readers never see partial content. */
export async function writeFileAtomic(path: string, data: string): Promise<void> {
  temporaryFileCounter += 1
  const temporaryPath = `${path}.${process.pid}.${temporaryFileCounter}.tmp`

  try {
    await fs.writeFile(temporaryPath, data)
    await renameWithRetry(temporaryPath, path)
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}
