import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ClipboardList, Copy, MessageSquarePlus, Search, Trash2, Undo2, X } from 'lucide-react'
import { BOARD_COLUMNS, type BoardState, type BoardTask } from '@shared/types'
import { getBoardHistory, getVisibleBoardColumns } from '@shared/board'

interface BoardViewProps {
  workspaceId: string
  board: BoardState
  onClose: () => void
  onCreateTask: () => void
  onUpdateTask: (taskId: string, patch: { title?: string; task?: string }) => void
  onAddNote: (taskId: string, note: string) => void
  onDeleteBacklogTask: (task: BoardTask) => void
  onApproveReviewTask: (task: BoardTask) => void
  onRejectReviewTask: (task: BoardTask) => void
}

interface TaskCardProps {
  task: BoardTask
  onUpdateTask: (taskId: string, patch: { title?: string; task?: string }) => void
  onAddNote: (taskId: string, note: string) => void
  onDeleteBacklogTask: (task: BoardTask) => void
  onApproveReviewTask: (task: BoardTask) => void
  onRejectReviewTask: (task: BoardTask) => void
}

function TaskCard({
  task,
  onUpdateTask,
  onAddNote,
  onDeleteBacklogTask,
  onApproveReviewTask,
  onRejectReviewTask,
}: TaskCardProps): React.ReactElement {
  const { t } = useTranslation()
  const [title, setTitle] = useState(task.title)
  const [body, setBody] = useState(task.task)
  const [note, setNote] = useState('')

  useEffect(() => {
    setTitle(task.title)
    setBody(task.task)
  }, [task.task, task.title])

  return (
    <article className="rounded-lg border border-border-visible bg-bg-secondary p-3">
      <div className="nd-caption mb-2 text-text-secondary">{task.id}</div>
      <input
        className="w-full bg-transparent text-sm text-text-display outline-none"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => {
          if (title.trim() && title !== task.title) onUpdateTask(task.id, { title })
        }}
      />
      <textarea
        className="mt-3 min-h-[88px] w-full resize-none rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm leading-5 text-text-primary outline-none"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onBlur={() => {
          if (body.trim() && body !== task.task) onUpdateTask(task.id, { task: body })
        }}
      />

      {(task.type || task.context || task.relatedTaskIds?.length) && (
        <div className="mt-3 rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-xs leading-5 text-text-secondary">
          {task.type && <div><span className="nd-caption">{t('ui.boardType')}</span> {task.type}</div>}
          {task.context && <div><span className="nd-caption">{t('ui.boardContext')}</span> {task.context}</div>}
          {task.relatedTaskIds?.length ? <div><span className="nd-caption">{t('ui.boardRelated')}</span> {task.relatedTaskIds.join(', ')}</div> : null}
        </div>
      )}

      {task.notes.length > 0 && (
        <div className="mt-3 space-y-2">
          {task.notes.slice(-3).map((entry) => (
            <div key={entry.id} className="rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-xs leading-5 text-text-secondary">
              <div className="nd-caption mb-1 text-text-disabled">{entry.actor.toUpperCase()} {t('ui.noteSuffix')}</div>
              {entry.body}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-full border border-border bg-bg-tertiary px-3 py-2 text-xs text-text-primary outline-none"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t('ui.addNote')}
        />
        <button
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-visible text-text-secondary hover:text-text-display disabled:opacity-40"
          disabled={!note.trim()}
          onClick={() => {
            const value = note.trim()
            if (!value) return
            onAddNote(task.id, value)
            setNote('')
          }}
          title={t('ui.addNote')}
        >
          <MessageSquarePlus size={14} />
        </button>
      </div>

      {(task.status === 'backlog' || task.status === 'review') && (
        <div className="mt-3 flex items-center gap-2">
          {task.status === 'backlog' && (
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:text-danger"
              onClick={() => onDeleteBacklogTask(task)}
              title={t('ui.deleteBacklogTask')}
            >
              <Trash2 size={14} />
            </button>
          )}
          {task.status === 'review' && (
            <>
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:text-success"
                onClick={() => onApproveReviewTask(task)}
                title={t('board.approve')}
              >
                <Check size={14} />
              </button>
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:text-warning"
                onClick={() => onRejectReviewTask(task)}
                title={t('board.reject')}
              >
                <Undo2 size={14} />
              </button>
            </>
          )}
        </div>
      )}
    </article>
  )
}

export function BoardView({
  workspaceId,
  board,
  onClose,
  onCreateTask,
  onUpdateTask,
  onAddNote,
  onDeleteBacklogTask,
  onApproveReviewTask,
  onRejectReviewTask,
}: BoardViewProps): React.ReactElement {
  const { t } = useTranslation()
  const [historySearch, setHistorySearch] = useState('')
  const columns = useMemo(() => getVisibleBoardColumns(board), [board])
  const history = useMemo(() => getBoardHistory(board, historySearch), [board, historySearch])
  const mcpCommand = `npx -y yira-board-mcp --yira-home ~/.yira --workspace-id ${workspaceId}`
  const columnLabels = {
    backlog: t('ui.boardBacklog'),
    ready: t('ui.boardReady'),
    in_progress: t('ui.boardInProgress'),
    review: t('ui.boardReview'),
    done: t('ui.boardDone'),
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-bg-secondary">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
        <div className="min-w-0">
          <div className="nd-label text-text-secondary">{t('board.boardView')}</div>
          <h1 className="mt-1 text-xl text-text-display">{t('board.workspaceBoard')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-full border border-text-display px-4 text-sm text-text-display transition-colors hover:bg-hover-bg"
            onClick={() => void window.electron.clipboard.writeText(mcpCommand)}
            title={t('ui.copyMcpConfig')}
          >
            <Copy size={14} />
            <span className="nd-label">MCP</span>
          </button>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-full border border-text-display px-4 text-sm text-text-display transition-colors hover:bg-hover-bg"
            onClick={onCreateTask}
          >
            <ClipboardList size={14} />
            <span className="nd-label">{t('ui.newTask')}</span>
          </button>
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-text-display text-text-display transition-colors hover:bg-hover-bg"
            onClick={onClose}
            title={t('board.close')}
            aria-label={t('board.close')}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="grid min-w-[1180px] grid-cols-5 gap-4">
          {BOARD_COLUMNS.map((column) => {
            const tasks = columns[column.id]

            return (
              <section key={column.id} className="flex min-h-[360px] min-w-0 flex-col rounded-lg border border-border bg-bg-tertiary">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div>
                    <div className="nd-label text-text-secondary">{columnLabels[column.id]}</div>
                      <div className="mt-1 text-sm text-text-display">{t('ui.taskCount', { count: tasks.length })}</div>
                  </div>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                  {tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onUpdateTask={onUpdateTask}
                      onAddNote={onAddNote}
                      onDeleteBacklogTask={onDeleteBacklogTask}
                      onApproveReviewTask={onApproveReviewTask}
                      onRejectReviewTask={onRejectReviewTask}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>

        <section className="mt-5 rounded-lg border border-border bg-bg-tertiary">
          <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
            <div>
              <div className="nd-label text-text-secondary">{t('board.history')}</div>
              <div className="mt-1 text-sm text-text-display">{t('ui.closedTasks', { count: history.length })}</div>
            </div>
            <label className="flex h-10 w-[320px] items-center gap-2 rounded-full border border-border-visible bg-bg-primary px-3">
              <Search size={14} className="text-text-secondary" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none"
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
                placeholder={t('ui.searchHistory')}
              />
            </label>
          </div>
          <div className="divide-y divide-border">
            {history.map((task) => (
              <div key={task.id} className="grid grid-cols-[180px_1fr_220px] gap-4 px-4 py-3 text-sm">
                <div className="font-mono text-xs text-text-secondary">{task.completedAt ?? task.updatedAt}</div>
                <div className="min-w-0">
                  <div className="truncate text-text-display">{task.title}</div>
                  <div className="mt-1 truncate text-text-secondary">{task.task}</div>
                </div>
                <div className="truncate text-text-secondary">{task.type ?? t('ui.taskFallback')}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
