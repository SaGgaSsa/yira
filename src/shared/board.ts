import { BOARD_COLUMNS, type BoardActor, type BoardEvent, type BoardNote, type BoardState, type BoardStatus, type BoardTask } from './types'

const DONE_VISIBLE_DAYS = 7

interface BoardClock {
  now?: string
}

interface BoardTaskCreateInput {
  title: string
  task: string
}

interface BoardTaskUpdateInput {
  taskId: string
  title?: string
  task?: string
}

interface BoardMetadataInput {
  taskId: string
  type?: string
  context?: string
  relatedTaskIds?: string[]
}

interface BoardTaskIdInput {
  taskId: string
  sessionId?: string
  note?: string
}

interface BoardNoteInput {
  taskId: string
  note: string
  sessionId?: string
}

export type BoardColumns = Record<BoardStatus, BoardTask[]>

function nowIso(clock?: BoardClock): string {
  return clock?.now ?? new Date().toISOString()
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function assertNonEmpty(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} is required`)
  return trimmed
}

function isBoardStatus(value: unknown): value is BoardStatus {
  return BOARD_COLUMNS.some((column) => column.id === value)
}

function normalizeNote(raw: Partial<BoardNote>, fallbackActor: BoardActor, timestamp: string): BoardNote | null {
  const body = typeof raw.body === 'string' ? raw.body.trim() : ''
  if (!body) return null

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : createId('note'),
    actor: raw.actor === 'mcp' ? 'mcp' : fallbackActor,
    body,
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt.trim() ? raw.createdAt : timestamp,
    sessionId: typeof raw.sessionId === 'string' && raw.sessionId.trim() ? raw.sessionId.trim() : undefined,
  }
}

function normalizeEvent(raw: Partial<BoardEvent>, fallbackActor: BoardActor, timestamp: string): BoardEvent | null {
  const type = raw.type === 'updated' || raw.type === 'status_changed' || raw.type === 'note_added' || raw.type === 'metadata_enriched'
    ? raw.type
    : raw.type === 'created'
      ? 'created'
      : null
  if (!type) return null

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : createId('event'),
    type,
    actor: raw.actor === 'mcp' ? 'mcp' : fallbackActor,
    timestamp: typeof raw.timestamp === 'string' && raw.timestamp.trim() ? raw.timestamp : timestamp,
    fromStatus: isBoardStatus(raw.fromStatus) ? raw.fromStatus : undefined,
    toStatus: isBoardStatus(raw.toStatus) ? raw.toStatus : undefined,
    note: typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : undefined,
    sessionId: typeof raw.sessionId === 'string' && raw.sessionId.trim() ? raw.sessionId.trim() : undefined,
  }
}

function normalizeTask(raw: Partial<BoardTask>, timestamp: string): BoardTask | null {
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  const task = typeof raw.task === 'string' ? raw.task.trim() : ''
  if (!title || !task) return null

  const status = isBoardStatus(raw.status) ? raw.status : 'backlog'
  const notes = Array.isArray(raw.notes)
    ? raw.notes.map((note) => normalizeNote(note, 'human', timestamp)).filter((note): note is BoardNote => Boolean(note))
    : []
  const events = Array.isArray(raw.events)
    ? raw.events.map((event) => normalizeEvent(event, 'human', timestamp)).filter((event): event is BoardEvent => Boolean(event))
    : []

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : createId('task'),
    title,
    task,
    status,
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt.trim() ? raw.createdAt : timestamp,
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt.trim() ? raw.updatedAt : timestamp,
    completedAt: status === 'done' && typeof raw.completedAt === 'string' && raw.completedAt.trim()
      ? raw.completedAt
      : undefined,
    type: typeof raw.type === 'string' && raw.type.trim() ? raw.type.trim() : undefined,
    context: typeof raw.context === 'string' && raw.context.trim() ? raw.context.trim() : undefined,
    relatedTaskIds: Array.isArray(raw.relatedTaskIds)
      ? Array.from(new Set(raw.relatedTaskIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())).map((id) => id.trim())))
      : undefined,
    notes,
    events,
  }
}

function appendEvent(task: BoardTask, input: Omit<BoardEvent, 'id'>): BoardTask {
  return {
    ...task,
    updatedAt: input.timestamp,
    events: [
      ...task.events,
      {
        id: createId('event'),
        ...input,
      },
    ],
  }
}

function updateTask(board: BoardState, taskId: string, update: (task: BoardTask) => BoardTask): BoardState {
  let found = false
  const tasks = board.tasks.map((task) => {
    if (task.id !== taskId) return task
    found = true
    return update(task)
  })
  if (!found) throw new Error(`Task not found: ${taskId}`)
  return { ...board, tasks }
}

function transitionTask(
  board: BoardState,
  input: BoardTaskIdInput,
  allowedFrom: BoardStatus[],
  toStatus: BoardStatus,
  actor: BoardActor,
  clock?: BoardClock,
): BoardState {
  const timestamp = nowIso(clock)
  return updateTask(board, input.taskId, (task) => {
    if (!allowedFrom.includes(task.status)) {
      throw new Error(`Cannot move task from ${task.status} to ${toStatus}`)
    }

    const eventNote = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : undefined
    return appendEvent({
      ...task,
      status: toStatus,
      completedAt: toStatus === 'done' ? timestamp : undefined,
    }, {
      type: 'status_changed',
      actor,
      timestamp,
      fromStatus: task.status,
      toStatus,
      note: eventNote,
      sessionId: input.sessionId,
    })
  })
}

export function createEmptyBoardState(): BoardState {
  return {
    enabled: false,
    tasks: [],
  }
}

export function normalizeBoardState(raw: unknown, clock?: BoardClock): BoardState {
  if (!raw || typeof raw !== 'object') return createEmptyBoardState()

  const timestamp = nowIso(clock)
  const record = raw as Partial<BoardState>
  const tasks = Array.isArray(record.tasks)
    ? record.tasks.map((task) => normalizeTask(task, timestamp)).filter((task): task is BoardTask => Boolean(task))
    : []

  return {
    enabled: record.enabled === true,
    tasks,
  }
}

export function enableBoard(raw: unknown, clock?: BoardClock): BoardState {
  return {
    ...normalizeBoardState(raw, clock),
    enabled: true,
  }
}

export function createUserBoardTask(board: BoardState, input: BoardTaskCreateInput, clock?: BoardClock): BoardState {
  if (!board.enabled) throw new Error('Board is not enabled')
  const timestamp = nowIso(clock)
  const task: BoardTask = {
    id: createId('task'),
    title: assertNonEmpty(input.title, 'Title'),
    task: assertNonEmpty(input.task, 'Task'),
    status: 'backlog',
    createdAt: timestamp,
    updatedAt: timestamp,
    notes: [],
    events: [
      {
        id: createId('event'),
        type: 'created',
        actor: 'human',
        timestamp,
        toStatus: 'backlog',
      },
    ],
  }

  return {
    ...board,
    tasks: [task, ...board.tasks],
  }
}

export function updateUserBoardTask(board: BoardState, input: BoardTaskUpdateInput, clock?: BoardClock): BoardState {
  const timestamp = nowIso(clock)
  return updateTask(board, input.taskId, (task) => {
    const title = input.title === undefined ? task.title : assertNonEmpty(input.title, 'Title')
    const body = input.task === undefined ? task.task : assertNonEmpty(input.task, 'Task')
    return appendEvent({
      ...task,
      title,
      task: body,
    }, {
      type: 'updated',
      actor: 'human',
      timestamp,
    })
  })
}

export function deleteBacklogTask(board: BoardState, taskId: string): BoardState {
  const target = board.tasks.find((task) => task.id === taskId)
  if (!target) throw new Error(`Task not found: ${taskId}`)
  if (target.status !== 'backlog') throw new Error('Only backlog tasks can be deleted')
  return {
    ...board,
    tasks: board.tasks.filter((task) => task.id !== taskId),
  }
}

export function enrichTaskMetadata(board: BoardState, input: BoardMetadataInput, clock?: BoardClock): BoardState {
  const timestamp = nowIso(clock)
  return updateTask(board, input.taskId, (task) => {
    const metadataTask = appendEvent({
      ...task,
      type: input.type?.trim() || task.type,
      context: input.context?.trim() || task.context,
      relatedTaskIds: input.relatedTaskIds
        ? Array.from(new Set(input.relatedTaskIds.map((id) => id.trim()).filter(Boolean)))
        : task.relatedTaskIds,
    }, {
      type: 'metadata_enriched',
      actor: 'mcp',
      timestamp,
      sessionId: undefined,
    })

    if (task.status !== 'backlog') return metadataTask

    return appendEvent({
      ...metadataTask,
      status: 'ready',
    }, {
      type: 'status_changed',
      actor: 'mcp',
      timestamp,
      fromStatus: 'backlog',
      toStatus: 'ready',
    })
  })
}

export function startWorkSession(board: BoardState, input: BoardTaskIdInput, clock?: BoardClock): BoardState {
  return transitionTask(board, input, ['ready'], 'in_progress', 'mcp', clock)
}

export function moveTaskToReview(board: BoardState, input: BoardTaskIdInput, clock?: BoardClock): BoardState {
  return transitionTask(board, input, ['in_progress'], 'review', 'mcp', clock)
}

export function approveReviewTask(board: BoardState, input: BoardTaskIdInput, clock?: BoardClock): BoardState {
  return transitionTask(board, input, ['review'], 'done', 'human', clock)
}

export function rejectReviewTask(board: BoardState, input: BoardNoteInput, clock?: BoardClock): BoardState {
  const note = assertNonEmpty(input.note, 'Rejection note')
  const timestamp = nowIso(clock)
  const withNote = addBoardNote(board, { ...input, note }, clock, 'human')
  return transitionTask(withNote, { taskId: input.taskId, note, sessionId: input.sessionId }, ['review'], 'in_progress', 'human', { now: timestamp })
}

export function addBoardNote(board: BoardState, input: BoardNoteInput, clock?: BoardClock, actor: BoardActor = 'mcp'): BoardState {
  const body = assertNonEmpty(input.note, 'Note')
  const timestamp = nowIso(clock)

  return updateTask(board, input.taskId, (task) => appendEvent({
    ...task,
    notes: [
      ...task.notes,
      {
        id: createId('note'),
        actor,
        body,
        createdAt: timestamp,
        sessionId: input.sessionId,
      },
    ],
  }, {
    type: 'note_added',
    actor,
    timestamp,
    note: body,
    sessionId: input.sessionId,
  }))
}

export function getVisibleBoardColumns(board: BoardState, clock?: BoardClock): BoardColumns {
  const columns: BoardColumns = {
    backlog: [],
    ready: [],
    in_progress: [],
    review: [],
    done: [],
  }
  const now = new Date(nowIso(clock)).getTime()
  const visibleAfter = now - DONE_VISIBLE_DAYS * 24 * 60 * 60 * 1000

  for (const task of board.tasks) {
    if (task.status === 'done') {
      const completedAt = task.completedAt ? new Date(task.completedAt).getTime() : 0
      if (!Number.isFinite(completedAt) || completedAt < visibleAfter) continue
    }
    columns[task.status].push(task)
  }

  return columns
}

export function getBoardHistory(board: BoardState, query = ''): BoardTask[] {
  const needle = query.trim().toLowerCase()
  return board.tasks
    .filter((task) => task.status === 'done')
    .filter((task) => {
      if (!needle) return true
      return task.title.toLowerCase().includes(needle) ||
        task.task.toLowerCase().includes(needle) ||
        task.notes.some((note) => note.body.toLowerCase().includes(needle))
    })
    .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt))
}

export function getBoardReviewCount(board: BoardState): number {
  return board.tasks.filter((task) => task.status === 'review').length
}

export function proposeWorkSession(board: BoardState): BoardTask | null {
  return board.tasks.find((task) => task.status === 'ready') ?? null
}
