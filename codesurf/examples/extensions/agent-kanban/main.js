/**
 * Agent Kanban — main.js (power tier)
 *
 * Faithful port of Cline kanban core:
 *   - Board state with full dependency logic (task-board-mutations.ts)
 *   - Agent catalog: claude/codex/gemini/cline/opencode (agent-catalog.ts)
 *   - Git worktree per task: create on start, patch-save on trash (task-worktree.ts)
 *   - Agent session: spawn via child_process, stream output via event bus
 *   - Session state machine: idle/running/awaiting_review/interrupted/done
 *
 * IPC handlers (all namespaced ext:agent-kanban:*):
 *   getBoard, createTask, moveTask, updateTask, deleteTask
 *   addDependency, removeDependency
 *   startAgent, stopAgent, sendInput, getOutput
 *   getSessionState, listAgents, getWorktreeInfo
 */

'use strict'

const { spawn } = require('child_process')
const { join, dirname, isAbsolute } = require('path')
const { mkdir, writeFile, readFile, rm, access, readdir } = require('fs').promises
const { existsSync } = require('fs')
const os = require('os')
const crypto = require('crypto')

// ─── Agent catalog (from agent-catalog.ts) ───────────────────────────────────

const AGENT_CATALOG = [
  { id: 'claude',   label: 'Claude Code',  binary: 'claude',   autonomousArgs: ['--dangerously-skip-permissions'],              installUrl: 'https://docs.anthropic.com/en/docs/claude-code/quickstart' },
  { id: 'codex',    label: 'OpenAI Codex', binary: 'codex',    autonomousArgs: ['--dangerously-bypass-approvals-and-sandbox'],  installUrl: 'https://github.com/openai/codex' },
  { id: 'gemini',   label: 'Gemini CLI',   binary: 'gemini',   autonomousArgs: ['--yolo'],                                      installUrl: 'https://github.com/google-gemini/gemini-cli' },
  { id: 'cline',    label: 'Cline',        binary: 'cline',    autonomousArgs: ['--auto-approve-all'],                          installUrl: 'https://github.com/cline/cline' },
  { id: 'opencode', label: 'OpenCode',     binary: 'opencode', autonomousArgs: [],                                              installUrl: 'https://github.com/sst/opencode' },
]

// ─── Board persistence ────────────────────────────────────────────────────────

const KANBAN_HOME = join(os.homedir(), '.contex', 'agent-kanban')
const WORKTREES_HOME = join(KANBAN_HOME, 'worktrees')
const PATCHES_HOME   = join(KANBAN_HOME, 'patches')

const DEFAULT_BOARD = () => ({
  columns: [
    { id: 'backlog',     label: 'Backlog',     cards: [] },
    { id: 'in_progress', label: 'In Progress', cards: [] },
    { id: 'review',      label: 'Review',      cards: [] },
    { id: 'trash',       label: 'Trash',       cards: [] },
  ],
  dependencies: [],
  version: 2,
})

const boards  = new Map()  // workspacePath -> board
const sessions = new Map() // taskId -> session

function boardPath(workspacePath) {
  const safe = (workspacePath || 'default').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  return join(KANBAN_HOME, `${safe}.json`)
}

async function loadBoard(workspacePath) {
  if (boards.has(workspacePath)) return boards.get(workspacePath)
  try {
    const raw = await readFile(boardPath(workspacePath), 'utf8')
    const b = JSON.parse(raw)
    boards.set(workspacePath, b)
    return b
  } catch {
    const b = DEFAULT_BOARD()
    boards.set(workspacePath, b)
    return b
  }
}

async function saveBoard(workspacePath, board) {
  boards.set(workspacePath, board)
  await mkdir(KANBAN_HOME, { recursive: true })
  await writeFile(boardPath(workspacePath), JSON.stringify(board, null, 2))
}

// ─── Task ID (from task-id.ts) ────────────────────────────────────────────────

function createShortId() { return crypto.randomUUID().replaceAll('-', '').slice(0, 5) }

function createUniqueTaskId(board) {
  const existing = new Set()
  for (const col of board.columns) for (const c of col.cards) existing.add(c.id)
  for (let i = 0; i < 16; i++) {
    const id = createShortId()
    if (!existing.has(id)) return id
  }
  return (Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 5)
}

// ─── Board mutations (from task-board-mutations.ts) ────────────────────────────

function findTask(board, taskId) {
  for (let ci = 0; ci < board.columns.length; ci++) {
    const col = board.columns[ci]
    const ti = col.cards.findIndex(c => c.id === taskId)
    if (ti !== -1) return { ci, ti, columnId: col.id, task: col.cards[ti] }
  }
  return null
}

function getTaskColumnId(board, taskId) {
  const loc = findTask(board, taskId)
  return loc ? loc.columnId : null
}

function updateTaskDependencies(board) {
  if (!board.dependencies.length) return board
  const allIds = new Set()
  for (const col of board.columns) for (const c of col.cards) allIds.add(c.id)
  const seen = new Set()
  const deps = []
  for (const dep of board.dependencies) {
    const fId = dep.fromTaskId.trim(), tId = dep.toTaskId.trim()
    if (!fId || !tId || fId === tId || !allIds.has(fId) || !allIds.has(tId)) continue
    const fCol = getTaskColumnId(board, fId), tCol = getTaskColumnId(board, tId)
    if (!fCol || !tCol || fCol === 'trash' || tCol === 'trash') continue
    const key = `${fId}::${tId}`
    if (seen.has(key)) continue
    seen.add(key)
    deps.push({ ...dep })
  }
  return { ...board, dependencies: deps }
}

function addTaskToColumn(board, columnId, input) {
  const task = {
    id: createUniqueTaskId(board),
    prompt: input.prompt.trim(),
    agentId: input.agentId || 'claude',
    baseRef: input.baseRef || 'HEAD',
    startInPlanMode: Boolean(input.startInPlanMode),
    autoReviewEnabled: Boolean(input.autoReviewEnabled),
    autoReviewMode: input.autoReviewMode || 'commit',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  const columns = board.columns.map(col =>
    col.id === columnId ? { ...col, cards: [task, ...col.cards] } : col
  )
  return { board: { ...board, columns }, task }
}

function moveTaskToColumn(board, taskId, targetColumnId) {
  const loc = findTask(board, taskId)
  if (!loc) return { moved: false, board, task: null, fromColumnId: null }
  if (loc.columnId === targetColumnId) return { moved: false, board, task: loc.task, fromColumnId: loc.columnId }

  const movedTask = { ...loc.task, updatedAt: Date.now() }
  const columns = board.columns.map((col, ci) => {
    if (ci === loc.ci) return { ...col, cards: col.cards.filter((_, ti) => ti !== loc.ti) }
    if (col.id === targetColumnId) {
      const cards = targetColumnId === 'trash' ? [movedTask, ...col.cards] : [...col.cards, movedTask]
      return { ...col, cards }
    }
    return col
  })
  const newBoard = updateTaskDependencies({ ...board, columns })
  return { moved: true, board: newBoard, task: movedTask, fromColumnId: loc.columnId }
}

function updateTask(board, taskId, input) {
  let updatedTask = null
  const columns = board.columns.map(col => {
    const cards = col.cards.map(c => {
      if (c.id !== taskId) return c
      updatedTask = { ...c, ...input, id: c.id, updatedAt: Date.now() }
      return updatedTask
    })
    return { ...col, cards }
  })
  return { board: { ...board, columns }, task: updatedTask, updated: !!updatedTask }
}

function deleteTask(board, taskId) {
  const columns = board.columns.map(col => ({
    ...col, cards: col.cards.filter(c => c.id !== taskId)
  }))
  const dependencies = board.dependencies.filter(
    d => d.fromTaskId !== taskId && d.toTaskId !== taskId
  )
  return { board: { ...board, columns, dependencies } }
}

function addDependency(board, fromTaskId, toTaskId) {
  const fId = fromTaskId.trim(), tId = toTaskId.trim()
  if (!fId || !tId || fId === tId) return { board, added: false, reason: 'same_task' }
  const fCol = getTaskColumnId(board, fId), tCol = getTaskColumnId(board, tId)
  if (!fCol || !tCol) return { board, added: false, reason: 'missing_task' }
  if (fCol === 'trash' || tCol === 'trash') return { board, added: false, reason: 'trash_task' }
  // Ensure fromTaskId is the backlog task
  let backlogId = fId, linkedId = tId
  if (fCol !== 'backlog' && tCol === 'backlog') { backlogId = tId; linkedId = fId }
  if (fCol !== 'backlog' && tCol !== 'backlog') return { board, added: false, reason: 'non_backlog' }
  const dup = board.dependencies.some(d => d.fromTaskId === backlogId && d.toTaskId === linkedId)
  if (dup) return { board, added: false, reason: 'duplicate' }
  const dep = { id: crypto.randomUUID().replaceAll('-', '').slice(0, 8), fromTaskId: backlogId, toTaskId: linkedId, createdAt: Date.now() }
  return { board: { ...board, dependencies: [...board.dependencies, dep] }, added: true, dependency: dep }
}

function removeDependency(board, dependencyId) {
  const deps = board.dependencies.filter(d => d.id !== dependencyId)
  if (deps.length === board.dependencies.length) return { board, removed: false }
  return { board: { ...board, dependencies: deps }, removed: true }
}

// Which backlog tasks become unblocked when taskId moves from review to trash
function getReadyTasksOnTrash(board, taskId) {
  const fromCol = getTaskColumnId(board, taskId)
  if (fromCol !== 'review') return []
  return board.dependencies
    .filter(d => d.toTaskId === taskId && getTaskColumnId(board, d.fromTaskId) === 'backlog')
    .map(d => d.fromTaskId)
}

// Is a backlog task blocked (has dependency on a review task)?
function getBlockedStatus(board, taskId) {
  const blockedBy = board.dependencies
    .filter(d => d.fromTaskId === taskId)
    .map(d => d.toTaskId)
    .filter(id => getTaskColumnId(board, id) === 'review')
  return { isBlocked: blockedBy.length > 0, blockedBy }
}

// ─── Git helpers ──────────────────────────────────────────────────────────────

function runGit(cwd, args) {
  return new Promise((resolve) => {
    const proc = spawn('git', args, { cwd, stdio: 'pipe' })
    let stdout = '', stderr = ''
    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('close', code => resolve({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim(), code }))
    proc.on('error', err => resolve({ ok: false, stdout: '', stderr: err.message, code: -1 }))
  })
}

function worktreePath(repoPath, taskId) {
  const safe = taskId.replace(/[^a-zA-Z0-9]/g, '_')
  const label = repoPath.replace(/[^a-zA-Z0-9]/g, '_').slice(-20)
  return join(WORKTREES_HOME, safe, label)
}

async function pathExists(p) {
  try { await access(p); return true } catch { return false }
}

async function ensureWorktree(repoPath, taskId, baseRef) {
  const wPath = worktreePath(repoPath, taskId)
  if (await pathExists(wPath)) {
    const check = await runGit(wPath, ['rev-parse', 'HEAD'])
    if (check.ok) return { ok: true, path: wPath, existed: true }
  }
  // Resolve baseRef to commit
  const refResult = await runGit(repoPath, ['rev-parse', '--verify', `${baseRef}^{commit}`])
  if (!refResult.ok) return { ok: false, error: `Cannot resolve base ref "${baseRef}": ${refResult.stderr}` }
  const commit = refResult.stdout
  await mkdir(dirname(wPath), { recursive: true })
  // Prune stale registrations
  await runGit(repoPath, ['worktree', 'prune'])
  const addResult = await runGit(repoPath, ['worktree', 'add', '--detach', wPath, commit])
  if (!addResult.ok) return { ok: false, error: addResult.stderr || addResult.stdout }
  return { ok: true, path: wPath, existed: false, baseCommit: commit }
}

async function deleteWorktree(repoPath, taskId) {
  const wPath = worktreePath(repoPath, taskId)
  if (!(await pathExists(wPath))) return { ok: true, removed: false }
  // Save a patch of uncommitted changes before deleting
  try {
    const diffResult = await runGit(wPath, ['diff', '--binary', 'HEAD', '--'])
    if (diffResult.ok && diffResult.stdout.trim()) {
      const head = await runGit(wPath, ['rev-parse', 'HEAD'])
      if (head.ok) {
        await mkdir(PATCHES_HOME, { recursive: true })
        const safe = taskId.replace(/[^a-zA-Z0-9]/g, '_')
        await writeFile(join(PATCHES_HOME, `${safe}.${head.stdout}.patch`), diffResult.stdout)
      }
    }
  } catch { /* patch capture is best-effort */ }
  await runGit(repoPath, ['worktree', 'remove', '--force', wPath])
  await rm(wPath, { recursive: true, force: true })
  return { ok: true, removed: true }
}

// ─── Agent sessions ───────────────────────────────────────────────────────────

// session: { proc, state, outputLines, startedAt, taskId, agentId, worktreePath }
// state: 'idle'|'running'|'awaiting_review'|'interrupted'|'done'

function makeSession(taskId, agentId, wPath) {
  return { taskId, agentId, worktreePath: wPath, proc: null, state: 'idle', outputLines: [], startedAt: null, exitCode: null }
}

function startAgentProcess(session, task, bus) {
  const entry = AGENT_CATALOG.find(a => a.id === session.agentId)
  if (!entry) throw new Error(`Unknown agent: ${session.agentId}`)

  const args = [...entry.autonomousArgs, task.prompt]
  const env = { ...process.env, CARD_ID: task.id }

  const proc = spawn(entry.binary, args, {
    cwd: session.worktreePath,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  session.proc = proc
  session.state = 'running'
  session.startedAt = Date.now()

  function pushLine(line) {
    session.outputLines.push({ t: Date.now() - session.startedAt, text: line })
    if (session.outputLines.length > 2000) session.outputLines.shift()
    bus.publish(`agent-kanban:output:${task.id}`, 'data', { taskId: task.id, line })
  }

  let stdoutBuf = '', stderrBuf = ''
  proc.stdout.on('data', chunk => {
    stdoutBuf += chunk.toString('utf8')
    const lines = stdoutBuf.split('\n')
    stdoutBuf = lines.pop() || ''
    lines.forEach(l => pushLine(l))
  })
  proc.stderr.on('data', chunk => {
    stderrBuf += chunk.toString('utf8')
    const lines = stderrBuf.split('\n')
    stderrBuf = lines.pop() || ''
    lines.forEach(l => pushLine(`[stderr] ${l}`))
  })
  proc.on('close', (code) => {
    if (stdoutBuf) pushLine(stdoutBuf)
    if (stderrBuf) pushLine(`[stderr] ${stderrBuf}`)
    session.state = code === 0 ? 'done' : (session.state === 'running' ? 'interrupted' : session.state)
    session.exitCode = code
    session.proc = null
    bus.publish(`agent-kanban:output:${task.id}`, 'data', { taskId: task.id, line: `[exit ${code}]`, done: true, state: session.state })
  })
  proc.on('error', err => {
    session.state = 'interrupted'
    session.proc = null
    pushLine(`[error] ${err.message}`)
    bus.publish(`agent-kanban:output:${task.id}`, 'data', { taskId: task.id, line: `[error] ${err.message}`, done: true, state: 'interrupted' })
  })
}

// ─── activate ────────────────────────────────────────────────────────────────

module.exports = {
  activate(ctx) {
    ctx.log('Agent Kanban v2 activated')

    // ── Board CRUD ────────────────────────────────────────────────────────────

    ctx.ipc.handle('getBoard', async (workspacePath) => {
      const board = await loadBoard(workspacePath || '')
      // Annotate each backlog card with its blocked status
      const annotated = {
        ...board,
        columns: board.columns.map(col => ({
          ...col,
          cards: col.cards.map(card => {
            if (col.id === 'backlog') {
              return { ...card, ...getBlockedStatus(board, card.id) }
            }
            const sess = sessions.get(card.id)
            return { ...card, sessionState: sess ? sess.state : 'idle' }
          }),
        })),
      }
      return annotated
    })

    ctx.ipc.handle('createTask', async ({ workspacePath, prompt, agentId, baseRef, columnId, startInPlanMode, autoReviewEnabled, autoReviewMode }) => {
      const board = await loadBoard(workspacePath || '')
      const { board: newBoard, task } = addTaskToColumn(board, columnId || 'backlog', { prompt, agentId, baseRef: baseRef || 'HEAD', startInPlanMode, autoReviewEnabled, autoReviewMode })
      await saveBoard(workspacePath || '', newBoard)
      return { board: newBoard, task }
    })

    ctx.ipc.handle('moveTask', async ({ workspacePath, taskId, columnId }) => {
      const board = await loadBoard(workspacePath || '')
      const result = moveTaskToColumn(board, taskId, columnId)
      if (result.moved) {
        await saveBoard(workspacePath || '', result.board)
        // If moving to trash: delete worktree, unblock dependents
        if (columnId === 'trash') {
          const readyIds = getReadyTasksOnTrash(board, taskId)
          const sess = sessions.get(taskId)
          if (sess && sess.proc) { try { sess.proc.kill() } catch {} }
          // Delete worktree async (don't block response)
          if (workspacePath) {
            deleteWorktree(workspacePath, taskId).catch(() => {})
          }
          return { ...result, readyTaskIds: readyIds }
        }
      }
      return { ...result, readyTaskIds: [] }
    })

    ctx.ipc.handle('updateTask', async ({ workspacePath, taskId, ...input }) => {
      const board = await loadBoard(workspacePath || '')
      const result = updateTask(board, taskId, input)
      if (result.updated) await saveBoard(workspacePath || '', result.board)
      return result
    })

    ctx.ipc.handle('deleteTask', async ({ workspacePath, taskId }) => {
      const board = await loadBoard(workspacePath || '')
      const result = deleteTask(board, taskId)
      await saveBoard(workspacePath || '', result.board)
      const sess = sessions.get(taskId)
      if (sess && sess.proc) { try { sess.proc.kill() } catch {} }
      sessions.delete(taskId)
      return result
    })

    // ── Dependencies ──────────────────────────────────────────────────────────

    ctx.ipc.handle('addDependency', async ({ workspacePath, fromTaskId, toTaskId }) => {
      const board = await loadBoard(workspacePath || '')
      const result = addDependency(board, fromTaskId, toTaskId)
      if (result.added) await saveBoard(workspacePath || '', result.board)
      return result
    })

    ctx.ipc.handle('removeDependency', async ({ workspacePath, dependencyId }) => {
      const board = await loadBoard(workspacePath || '')
      const result = removeDependency(board, dependencyId)
      if (result.removed) await saveBoard(workspacePath || '', result.board)
      return result
    })

    // ── Agent sessions ────────────────────────────────────────────────────────

    ctx.ipc.handle('startAgent', async ({ workspacePath, taskId }) => {
      const board = await loadBoard(workspacePath || '')
      const task = board.columns.flatMap(c => c.cards).find(c => c.id === taskId)
      if (!task) return { ok: false, error: 'Task not found' }

      // Check not already running
      const existing = sessions.get(taskId)
      if (existing && existing.state === 'running') return { ok: false, error: 'Agent already running' }

      // Check not blocked
      const { isBlocked, blockedBy } = getBlockedStatus(board, taskId)
      if (isBlocked) return { ok: false, error: `Task is blocked by: ${blockedBy.join(', ')}` }

      // Create worktree
      let wPath = workspacePath
      if (workspacePath) {
        const wt = await ensureWorktree(workspacePath, taskId, task.baseRef || 'HEAD')
        if (!wt.ok) return { ok: false, error: wt.error }
        wPath = wt.path
      }

      // Move to in_progress
      const { board: movedBoard } = moveTaskToColumn(board, taskId, 'in_progress')
      await saveBoard(workspacePath || '', movedBoard)

      // Spawn agent
      const sess = makeSession(taskId, task.agentId || 'claude', wPath)
      sessions.set(taskId, sess)
      try {
        startAgentProcess(sess, task, ctx.bus)
      } catch (err) {
        sessions.delete(taskId)
        return { ok: false, error: err.message }
      }

      ctx.bus.publish(`agent-kanban:sessions`, 'data', { action: 'started', taskId, agentId: task.agentId })
      return { ok: true, worktreePath: wPath, state: 'running' }
    })

    ctx.ipc.handle('stopAgent', async ({ taskId }) => {
      const sess = sessions.get(taskId)
      if (!sess || !sess.proc) return { ok: false, error: 'No running agent' }
      sess.state = 'interrupted'
      try { sess.proc.kill('SIGTERM') } catch {}
      ctx.bus.publish(`agent-kanban:sessions`, 'data', { action: 'stopped', taskId })
      return { ok: true }
    })

    ctx.ipc.handle('sendInput', ({ taskId, input }) => {
      const sess = sessions.get(taskId)
      if (!sess || !sess.proc) return { ok: false, error: 'No running agent' }
      try { sess.proc.stdin.write(input + '\n') } catch (e) { return { ok: false, error: e.message } }
      return { ok: true }
    })

    ctx.ipc.handle('getOutput', ({ taskId, since }) => {
      const sess = sessions.get(taskId)
      if (!sess) return { lines: [], state: 'idle' }
      const lines = since ? sess.outputLines.filter(l => l.t >= since) : sess.outputLines
      return { lines, state: sess.state, startedAt: sess.startedAt, exitCode: sess.exitCode }
    })

    ctx.ipc.handle('getSessionState', ({ taskId }) => {
      const sess = sessions.get(taskId)
      return sess ? { state: sess.state, startedAt: sess.startedAt, agentId: sess.agentId, worktreePath: sess.worktreePath, exitCode: sess.exitCode } : { state: 'idle' }
    })

    ctx.ipc.handle('listAgents', () => AGENT_CATALOG)

    ctx.ipc.handle('getWorktreeInfo', async ({ workspacePath, taskId }) => {
      if (!workspacePath) return { exists: false }
      const wPath = worktreePath(workspacePath, taskId)
      const exists = await pathExists(wPath)
      if (!exists) return { exists: false, path: wPath }
      const head = await runGit(wPath, ['rev-parse', '--short', 'HEAD'])
      const branch = await runGit(wPath, ['rev-parse', '--abbrev-ref', 'HEAD'])
      return { exists: true, path: wPath, headCommit: head.ok ? head.stdout : null, branch: branch.ok ? branch.stdout : null }
    })

    ctx.ipc.handle('deleteWorktree', async ({ workspacePath, taskId }) => {
      if (!workspacePath) return { ok: false, error: 'No workspace path' }
      return deleteWorktree(workspacePath, taskId)
    })

    // ── MCP tools for agents ──────────────────────────────────────────────────

    ctx.mcp.registerTool({
      name: 'board_get',
      description: 'Get the current kanban board state including all tasks and dependencies.',
      inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' } } },
      handler: async ({ workspacePath }) => JSON.stringify(await loadBoard(workspacePath || ''), null, 2),
    })

    ctx.mcp.registerTool({
      name: 'board_create_task',
      description: 'Create a new task on the kanban board. Returns the created task.',
      inputSchema: {
        type: 'object',
        properties: {
          workspacePath: { type: 'string' },
          prompt:        { type: 'string', description: 'Full task instructions for the agent' },
          agentId:       { type: 'string', description: 'claude|codex|gemini|cline|opencode' },
          baseRef:       { type: 'string', description: 'Git branch/ref for the worktree (default: HEAD)' },
          columnId:      { type: 'string', description: 'backlog|in_progress|review (default: backlog)' },
        },
        required: ['prompt'],
      },
      handler: async ({ workspacePath, prompt, agentId, baseRef, columnId }) => {
        const board = await loadBoard(workspacePath || '')
        const { board: newBoard, task } = addTaskToColumn(board, columnId || 'backlog', { prompt, agentId, baseRef })
        await saveBoard(workspacePath || '', newBoard)
        return JSON.stringify(task)
      },
    })

    ctx.mcp.registerTool({
      name: 'board_move_task',
      description: 'Move a task to a different column: backlog|in_progress|review|trash',
      inputSchema: {
        type: 'object',
        properties: {
          workspacePath: { type: 'string' },
          taskId:        { type: 'string' },
          columnId:      { type: 'string', description: 'backlog|in_progress|review|trash' },
        },
        required: ['taskId', 'columnId'],
      },
      handler: async ({ workspacePath, taskId, columnId }) => {
        const board = await loadBoard(workspacePath || '')
        const result = moveTaskToColumn(board, taskId, columnId)
        if (result.moved) await saveBoard(workspacePath || '', result.board)
        return JSON.stringify({ moved: result.moved, fromColumnId: result.fromColumnId })
      },
    })

    return () => {
      // Kill all running sessions on deactivate
      for (const [taskId, sess] of sessions) {
        if (sess.proc) { try { sess.proc.kill() } catch {} }
      }
      sessions.clear()
      ctx.log('Agent Kanban deactivated')
    }
  },
}
