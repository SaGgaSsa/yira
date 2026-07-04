import { dispatchBoardMcpTool } from './boardMcp'
import type { BoardState } from '@shared/types'

const writes: BoardState[] = []
let state: BoardState = {
  enabled: true,
  tasks: [
    {
      id: 'task-1',
      title: 'Ready task',
      task: 'Do the work',
      status: 'ready',
      createdAt: '2026-07-04T09:00:00.000Z',
      updatedAt: '2026-07-04T09:00:00.000Z',
      notes: [],
      events: [],
    },
  ],
}

const store = {
  workspaceId: 'workspace-1',
  load: async () => state,
  save: async (next: BoardState) => {
    writes.push(next)
    state = next
  },
}

async function run(): Promise<void> {
  const listed = await dispatchBoardMcpTool(store, 'list_tasks', { workspaceId: 'workspace-1' })
  if (!Array.isArray(listed.tasks) || listed.tasks.length !== 1) {
    throw new Error('MCP list_tasks must read tasks for the configured workspace')
  }

  let blocked = false
  try {
    await dispatchBoardMcpTool(store, 'list_tasks', { workspaceId: 'workspace-2' })
  } catch {
    blocked = true
  }
  if (!blocked) throw new Error('MCP tools must reject a workspaceId outside their fixed workspace')

  blocked = false
  try {
    await dispatchBoardMcpTool(store, 'create_task', { title: 'Nope', task: 'Nope' })
  } catch {
    blocked = true
  }
  if (!blocked) throw new Error('MCP must not expose task creation')

  const proposed = await dispatchBoardMcpTool(store, 'propose_work_session', {})
  if (writes.length !== 0) throw new Error('MCP propose_work_session must not mutate board state')
  if ((proposed.task as { id?: string } | null)?.id !== 'task-1') throw new Error('MCP propose_work_session must choose a ready task')

await dispatchBoardMcpTool(store, 'start_work_session', { taskId: 'task-1', sessionId: 'session-1' })
if (state.tasks[0].status !== ('in_progress' as BoardState['tasks'][number]['status'])) throw new Error('MCP start_work_session must move ready task to in progress')

await dispatchBoardMcpTool(store, 'move_task_to_review', { taskId: 'task-1', sessionId: 'session-1', note: 'Ready' })
if (state.tasks[0].status !== ('review' as BoardState['tasks'][number]['status'])) throw new Error('MCP move_task_to_review must move in-progress task to review')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
