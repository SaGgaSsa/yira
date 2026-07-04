import {
  addBoardNote,
  enrichTaskMetadata,
  getBoardHistory,
  moveTaskToReview,
  normalizeBoardState,
  proposeWorkSession,
  startWorkSession,
} from '@shared/board'
import type { BoardState } from '@shared/types'

export interface BoardMcpStore {
  workspaceId: string
  load: () => Promise<BoardState>
  save: (state: BoardState) => Promise<void>
}

const ALLOWED_TOOLS = new Set([
  'read_task',
  'list_tasks',
  'enrich_metadata',
  'propose_work_session',
  'start_work_session',
  'add_note',
  'move_task_to_review',
  'read_history',
])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function stringArg(args: Record<string, unknown>, name: string, required = true): string {
  const value = args[name]
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (!required) return ''
  throw new Error(`${name} is required`)
}

function stringArrayArg(args: Record<string, unknown>, name: string): string[] | undefined {
  const value = args[name]
  if (!Array.isArray(value)) return undefined
  return value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim())).map((entry) => entry.trim())
}

function assertWorkspaceScope(store: BoardMcpStore, args: Record<string, unknown>): void {
  const requestedWorkspaceId = args.workspaceId
  if (requestedWorkspaceId === undefined) return
  if (requestedWorkspaceId !== store.workspaceId) {
    throw new Error('This MCP server is scoped to one workspace')
  }
}

export async function dispatchBoardMcpTool(store: BoardMcpStore, toolName: string, rawArgs: unknown): Promise<Record<string, unknown>> {
  if (!ALLOWED_TOOLS.has(toolName)) throw new Error(`Unsupported board MCP tool: ${toolName}`)

  const args = asRecord(rawArgs)
  assertWorkspaceScope(store, args)
  const board = normalizeBoardState(await store.load())

  if (toolName === 'list_tasks') {
    const status = args.status
    return {
      workspaceId: store.workspaceId,
      tasks: typeof status === 'string'
        ? board.tasks.filter((task) => task.status === status)
        : board.tasks,
    }
  }

  if (toolName === 'read_task') {
    const taskId = stringArg(args, 'taskId')
    const task = board.tasks.find((entry) => entry.id === taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)
    return { workspaceId: store.workspaceId, task }
  }

  if (toolName === 'read_history') {
    return {
      workspaceId: store.workspaceId,
      tasks: getBoardHistory(board, typeof args.query === 'string' ? args.query : ''),
    }
  }

  if (toolName === 'propose_work_session') {
    return {
      workspaceId: store.workspaceId,
      task: proposeWorkSession(board),
    }
  }

  let nextBoard: BoardState

  if (toolName === 'enrich_metadata') {
    nextBoard = enrichTaskMetadata(board, {
      taskId: stringArg(args, 'taskId'),
      type: stringArg(args, 'type', false) || undefined,
      context: stringArg(args, 'context', false) || undefined,
      relatedTaskIds: stringArrayArg(args, 'relatedTaskIds'),
    })
  } else if (toolName === 'start_work_session') {
    nextBoard = startWorkSession(board, {
      taskId: stringArg(args, 'taskId'),
      sessionId: stringArg(args, 'sessionId', false) || undefined,
    })
  } else if (toolName === 'add_note') {
    nextBoard = addBoardNote(board, {
      taskId: stringArg(args, 'taskId'),
      note: stringArg(args, 'note'),
      sessionId: stringArg(args, 'sessionId', false) || undefined,
    })
  } else if (toolName === 'move_task_to_review') {
    nextBoard = moveTaskToReview(board, {
      taskId: stringArg(args, 'taskId'),
      note: stringArg(args, 'note', false) || undefined,
      sessionId: stringArg(args, 'sessionId', false) || undefined,
    })
  } else {
    throw new Error(`Unsupported board MCP tool: ${toolName}`)
  }

  await store.save(nextBoard)
  return {
    workspaceId: store.workspaceId,
    board: nextBoard,
  }
}
