import {
  addBoardNote,
  approveReviewTask,
  createEmptyBoardState,
  createUserBoardTask,
  enrichTaskMetadata,
  getBoardHistory,
  getVisibleBoardColumns,
  moveTaskToReview,
  normalizeBoardState,
  rejectReviewTask,
  startWorkSession,
} from './board'

const now = '2026-07-04T10:00:00.000Z'

const board = createEmptyBoardState()
if (board.enabled !== false) throw new Error('new board storage must start disabled')
if (board.tasks.length !== 0) throw new Error('new board storage must have no tasks')

const enabled = normalizeBoardState({ enabled: true, tasks: [] }, { now })
const created = createUserBoardTask(enabled, { title: '  Build board  ', task: ' Capture work ' }, { now })
const task = created.tasks[0]

if (!task) throw new Error('user task must be added')
if (task.status !== 'backlog') throw new Error(`new user task must start in backlog, got ${task.status}`)
if (task.title !== 'Build board') throw new Error('task title must be trimmed')
if (task.task !== 'Capture work') throw new Error('task body must be trimmed')

const enriched = enrichTaskMetadata(created, { taskId: task.id, type: 'feature', context: 'workspace board' }, { now: '2026-07-04T10:30:00.000Z' })
const enrichedTask = enriched.tasks.find((entry) => entry.id === task.id)
if (!enrichedTask || enrichedTask.status !== 'ready') throw new Error('MCP metadata enrichment must make a backlog task ready')
if (enrichedTask.type !== 'feature' || enrichedTask.context !== 'workspace board') throw new Error('MCP metadata enrichment must persist visible metadata')

const ready = startWorkSession(
  enriched,
  { taskId: task.id, sessionId: 'session-1' },
  { now: '2026-07-04T11:00:00.000Z' },
)
const inProgress = ready.tasks.find((entry) => entry.id === task.id)
if (!inProgress || inProgress.status !== 'in_progress') throw new Error('MCP start session must move ready task to in progress')

const reviewing = moveTaskToReview(ready, { taskId: task.id, sessionId: 'session-1', note: 'Ready for human review' }, { now: '2026-07-04T12:00:00.000Z' })
const reviewTask = reviewing.tasks.find((entry) => entry.id === task.id)
if (!reviewTask || reviewTask.status !== 'review') throw new Error('MCP review transition must move task to review')

const rejected = rejectReviewTask(reviewing, { taskId: task.id, note: 'Needs one fix' }, { now: '2026-07-04T13:00:00.000Z' })
const rejectedTask = rejected.tasks.find((entry) => entry.id === task.id)
if (!rejectedTask || rejectedTask.status !== 'in_progress') throw new Error('human reject must send review task back to in progress')
if (!rejectedTask.notes.some((note) => note.body === 'Needs one fix')) throw new Error('human reject must record the required note')

let blocked = false
try {
  rejectReviewTask(reviewing, { taskId: task.id, note: ' ' }, { now })
} catch {
  blocked = true
}
if (!blocked) throw new Error('human reject must require a note')

const approved = approveReviewTask(reviewing, { taskId: task.id }, { now: '2026-07-04T14:00:00.000Z' })
const doneTask = approved.tasks.find((entry) => entry.id === task.id)
if (!doneTask || doneTask.status !== 'done' || !doneTask.completedAt) throw new Error('human approve must complete review task')

const oldDone = createUserBoardTask(enabled, { title: 'Old', task: 'Old task' }, { now: '2026-06-20T10:00:00.000Z' })
const oldDoneTask = {
  ...oldDone.tasks[0],
  status: 'done' as const,
  completedAt: '2026-06-22T10:00:00.000Z',
}
const visible = getVisibleBoardColumns({ enabled: true, tasks: [doneTask, oldDoneTask] }, { now })
if (!visible.done.some((entry) => entry.id === task.id)) throw new Error('recent done task must stay visible')
if (visible.done.some((entry) => entry.id === oldDoneTask.id)) throw new Error('old done task must be hidden from Done column')

const history = getBoardHistory({ enabled: true, tasks: [doneTask, oldDoneTask] })
if (history.length !== 2) throw new Error(`history must include all done tasks, got ${history.length}`)

const noted = addBoardNote(approved, { taskId: task.id, note: 'MCP note', sessionId: 'session-1' }, { now })
const notedTask = noted.tasks.find((entry) => entry.id === task.id)
if (!notedTask?.notes.some((note) => note.actor === 'mcp' && note.body === 'MCP note')) {
  throw new Error('MCP add note must append an MCP-visible note')
}
