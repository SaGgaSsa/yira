import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type { AgentPromptImage, AgentPromptImageMimeType } from '@shared/types'

const MAX_IMAGE_SIZE = 10 * 1024 * 1024
const IMAGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const mimeTypeExtensions: Record<AgentPromptImageMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

function normalizeSaveInput(input: unknown): {
  extension: string
  data: Uint8Array
} {
  try {
    if (!isPlainRecord(input)) throw new Error()

    const mimeType = input.mimeType
    if (typeof mimeType !== 'string'
      || !Object.prototype.hasOwnProperty.call(mimeTypeExtensions, mimeType)) {
      throw new Error()
    }

    const value = input.data
    let data: Uint8Array
    if (value instanceof Uint8Array) {
      data = Uint8Array.from(value)
    } else if (value instanceof ArrayBuffer) {
      data = new Uint8Array(value)
    } else {
      throw new Error()
    }

    if (data.byteLength === 0 || data.byteLength > MAX_IMAGE_SIZE) throw new Error()

    return {
      extension: mimeTypeExtensions[mimeType as AgentPromptImageMimeType],
      data,
    }
  } catch {
    throw new Error('Invalid agent prompt image')
  }
}

async function removeExpiredImages(directory: string, now: number): Promise<void> {
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch {
    return
  }

  await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
    const path = join(directory, entry.name)
    try {
      const details = await fs.stat(path)
      if (details.isFile() && now - details.mtimeMs > IMAGE_RETENTION_MS) {
        await fs.unlink(path)
      }
    } catch {
      // Pruning is best effort; a locked or removed file should not block saving.
    }
  }))
}

export function getAgentPromptImageDirectory(yiraHome: string): string {
  return join(yiraHome, 'agent-images')
}

export async function saveAgentPromptImage(
  directory: string,
  input: unknown,
  now = Date.now(),
): Promise<AgentPromptImage> {
  const { extension, data } = normalizeSaveInput(input)
  const resolvedDirectory = resolve(directory)
  await fs.mkdir(resolvedDirectory, { recursive: true })
  await removeExpiredImages(resolvedDirectory, now)

  const path = join(resolvedDirectory, randomUUID() + '.' + extension)
  await fs.writeFile(path, data)
  return { path }
}

function comparablePath(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path
}

export function normalizeAgentPromptImagePaths(directory: string, value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 10) {
    throw new Error('Invalid agent prompt images')
  }

  const resolvedDirectory = resolve(directory)
  const directoryKey = comparablePath(resolvedDirectory)
  const normalizedPaths: string[] = []
  const seenPaths = new Set<string>()

  for (const valuePath of value) {
    if (typeof valuePath !== 'string') throw new Error('Invalid agent prompt images')

    let path: string
    try {
      path = resolve(valuePath)
    } catch {
      throw new Error('Invalid agent prompt images')
    }

    if (comparablePath(dirname(path)) !== directoryKey
      || !/^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/i.test(basename(path))) {
      throw new Error('Invalid agent prompt images')
    }

    const pathKey = comparablePath(path)
    if (!seenPaths.has(pathKey)) {
      seenPaths.add(pathKey)
      normalizedPaths.push(path)
    }
  }

  return normalizedPaths
}

export function appendAgentPromptImages(
  prompt: string | undefined,
  imagePaths: string[],
): string | undefined {
  if (imagePaths.length === 0) return prompt

  const promptText = prompt?.trim()
  const attachedImages = ['Attached images:', ...imagePaths.map((path) => '- ' + path)].join('\n')
  return promptText ? promptText + '\n\n' + attachedImages : attachedImages
}
