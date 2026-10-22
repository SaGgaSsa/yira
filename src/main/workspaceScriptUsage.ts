import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { writeFileAtomic } from '@shared/atomicWrite'
import { createSerialTaskQueue, type SerialTaskQueue } from '@shared/serialTaskQueue'
import type { WorkspaceScriptUsage } from '@shared/types'
import { normalizeAgentOpaqueId } from './agents/query'
import { WORKSPACES_DIR } from './paths'

export interface WorkspaceScriptUsageStore {
  read(workspaceId: string): Promise<Record<string, WorkspaceScriptUsage>>
  record(workspaceId: string, scriptId: string, at?: Date): Promise<void>
}

const USAGE_FILE_VERSION = 1
const MAX_USAGE_ENTRIES = 500

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeUsage(value: unknown): WorkspaceScriptUsage | undefined {
  if (!isRecord(value)) return undefined
  const { runCount, lastRunAt } = value
  if (typeof runCount !== 'number' || !Number.isInteger(runCount) || runCount <= 0) return undefined
  if (typeof lastRunAt !== 'string' || Number.isNaN(Date.parse(lastRunAt))) return undefined
  return { runCount, lastRunAt }
}

function parseUsageFile(raw: string): Record<string, WorkspaceScriptUsage> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!isRecord(parsed) || !isRecord(parsed.scripts)) return {}

  const usageByScript: Record<string, WorkspaceScriptUsage> = {}
  for (const [scriptId, value] of Object.entries(parsed.scripts)) {
    const usage = normalizeUsage(value)
    if (usage) usageByScript[scriptId] = usage
  }
  return usageByScript
}

function keepMostRecent(usageByScript: Record<string, WorkspaceScriptUsage>): Record<string, WorkspaceScriptUsage> {
  const entries = Object.entries(usageByScript)
  if (entries.length <= MAX_USAGE_ENTRIES) return usageByScript

  entries.sort((left, right) => Date.parse(right[1].lastRunAt) - Date.parse(left[1].lastRunAt))
  return Object.fromEntries(entries.slice(0, MAX_USAGE_ENTRIES))
}

/** Persist how many times each workspace script was started from Yira. */
export function createWorkspaceScriptUsageStore(
  baseDirectory: string = WORKSPACES_DIR,
): WorkspaceScriptUsageStore {
  const queuesByPath = new Map<string, SerialTaskQueue>()

  function usagePath(workspaceId: string): string {
    return join(baseDirectory, workspaceId, '.yira', 'script-usage.json')
  }

  function queueForPath(path: string): SerialTaskQueue {
    let queue = queuesByPath.get(path)
    if (!queue) {
      queue = createSerialTaskQueue()
      queuesByPath.set(path, queue)
    }
    return queue
  }

  async function readFile(path: string): Promise<Record<string, WorkspaceScriptUsage>> {
    try {
      return parseUsageFile(await fs.readFile(path, 'utf8'))
    } catch {
      return {}
    }
  }

  return {
    async read(workspaceId) {
      const id = normalizeAgentOpaqueId(workspaceId)
      if (!id) return {}
      return readFile(usagePath(id))
    },

    async record(workspaceId, scriptId, at = new Date()) {
      const id = normalizeAgentOpaqueId(workspaceId)
      if (!id) throw new Error('Invalid scripts workspace id')

      const path = usagePath(id)
      await queueForPath(path).run(async () => {
        const usageByScript = await readFile(path)
        usageByScript[scriptId] = {
          runCount: (usageByScript[scriptId]?.runCount ?? 0) + 1,
          lastRunAt: at.toISOString(),
        }

        await fs.mkdir(join(baseDirectory, id, '.yira'), { recursive: true })
        await writeFileAtomic(path, JSON.stringify({
          version: USAGE_FILE_VERSION,
          scripts: keepMostRecent(usageByScript),
        }, null, 2))
      })
    },
  }
}
