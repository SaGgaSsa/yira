import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type {
  AgentPromptImage,
  AgentPromptImageAttachment,
  AgentPromptImageMimeType,
} from '@shared/types'

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

function invalidPromptImages(): Error {
  return new Error('Invalid agent prompt images')
}

function normalizePromptImagePath(directoryKey: string, value: unknown): string {
  if (typeof value !== 'string') throw invalidPromptImages()

  let path: string
  try {
    path = resolve(value)
  } catch {
    throw invalidPromptImages()
  }

  if (comparablePath(dirname(path)) !== directoryKey
    || !/^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/i.test(basename(path))) {
    throw invalidPromptImages()
  }
  return path
}

function isPromptImageNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 999
}

export function normalizeAgentPromptImages(
  directory: string,
  value: unknown,
): AgentPromptImageAttachment[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 10) throw invalidPromptImages()

  const directoryKey = comparablePath(resolve(directory))
  const images: AgentPromptImageAttachment[] = []
  const seenNumbers = new Set<number>()
  const seenPaths = new Set<string>()

  for (const entry of value) {
    if (!isPlainRecord(entry) || !isPromptImageNumber(entry.number)) throw invalidPromptImages()
    const path = normalizePromptImagePath(directoryKey, entry.path)
    const pathKey = comparablePath(path)
    // Each `[Image #n]` reference must point at exactly one file.
    if (seenNumbers.has(entry.number) || seenPaths.has(pathKey)) throw invalidPromptImages()

    seenNumbers.add(entry.number)
    seenPaths.add(pathKey)
    images.push({ number: entry.number, path })
  }

  return images
}

export function appendAgentPromptImages(
  prompt: string | undefined,
  images: AgentPromptImageAttachment[],
): string | undefined {
  if (images.length === 0) return prompt

  const promptText = prompt?.trim()
  const attachedImages = [
    'Attached images:',
    ...images.map((image) => `- [Image #${image.number}]: ${image.path}`),
  ].join('\n')
  return promptText ? promptText + '\n\n' + attachedImages : attachedImages
}
