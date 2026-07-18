# Source Control Commit and Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users commit staged workspace changes and synchronize the configured upstream from the Source Control panel.

**Architecture:** Extend the existing safe Git runner with commit, branch-upstream parsing, and a fast-forward-only pull followed by push. Expose only workspace-ID-based IPC methods, then add a compact commit composer and Sync action to the existing source-control component; successful mutations reload Git status.

**Tech Stack:** Electron IPC and preload bridge, Node.js `execFile`, TypeScript, React 19, Tailwind CSS, colocated TypeScript tests.

## Global Constraints

- Operate only on the persisted `rootFolderPath` resolved from `workspaceId`; never accept a renderer-supplied root path.
- Use `execFile` with fixed Git subcommands and no shell.
- Git network commands must be non-interactive and fail visibly rather than waiting for credentials or conflict resolution.
- Sync means `git pull --ff-only` then `git push`; do not run push after a failed pull.
- Commit accepts a trimmed, non-empty message up to 10,000 characters and only includes already staged changes.
- Preserve the existing list/tree, stage/unstage, refresh, retry and no-file-opening behavior.
- Do not commit repository changes unless the user explicitly requests a commit.

---

### Task 1: Extend shared Git status and the secure runner

**Files:**
- Modify: `src/shared/types.ts:58-72`
- Modify: `src/main/git/runner.ts:118-250`
- Modify: `src/main/git/runner.test.ts:1-118`

**Interfaces:**
- Consumes: `GitCommandExecutor`, `runGitAtRoot(rootPath, args, executor)`, and `GitStatusResult`.
- Produces: `GitStatusResult.upstream?: string`, `GitStatusResult.ahead: number`, `GitStatusResult.behind: number`, `commitGitChanges(rootPath, message, executor?)`, and `syncGitRepository(rootPath, executor?)`.

- [ ] **Step 1: Write failing runner tests**

  Add these expectations to `src/main/git/runner.test.ts`:

  ```ts
  const syncStatus = parseGitStatus('## main...origin/main [ahead 2, behind 1]\0')
  if (syncStatus.upstream !== 'origin/main' || syncStatus.ahead !== 2 || syncStatus.behind !== 1) {
    throw new Error('status parser must expose the upstream and divergence counts')
  }

  const calls: Array<{ command: string; args: string[] }> = []
  const executor: GitCommandExecutor = async (command, args) => {
    calls.push({ command, args })
    return { stdout: '', stderr: '' }
  }
  await commitGitChanges(tempRoot, 'Ship source control', executor)
  if (calls.at(-1)?.args.join('|') !== ['-C', tempRoot, 'commit', '-m', 'Ship source control'].join('|')) {
    throw new Error('commit must use fixed Git arguments')
  }
  await syncGitRepository(tempRoot, executor)
  if (calls.slice(-2).map(({ args }) => args.join('|')).join('\n') !== [
    ['-C', tempRoot, 'pull', '--ff-only'].join('|'),
    ['-C', tempRoot, 'push'].join('|'),
  ].join('\n')) throw new Error('sync must pull fast-forward-only before pushing')
  ```

  Add rejection checks for `''`, whitespace-only, and 10,001-character messages, and use an executor that throws on `pull` to assert no `push` call occurs.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `npx --no-install tsx src/main/git/runner.test.ts`

  Expected: failure because the parser properties and runner functions do not yet exist.

- [ ] **Step 3: Implement status parsing and Git operations**

  Update the status contract:

  ```ts
  export interface GitStatusResult {
    isRepository: boolean
    branch: string | null
    upstream?: string
    ahead: number
    behind: number
    originUrl?: string
    staged: GitFileChange[]
    unstaged: GitFileChange[]
    error?: string
  }
  ```

  Parse the `## branch...upstream [ahead N, behind N]` porcelain record into branch, upstream, and non-negative counts (zero when absent). Return zero counts in every `getGitStatus` error result. Add a `validateCommitMessage` helper, then implement:

  ```ts
  export async function commitGitChanges(rootPathInput: string, message: string, executor: GitCommandExecutor = execGitCommand): Promise<void> {
    const rootPath = await resolveGitRootPath(rootPathInput)
    await runGitAtRoot(rootPath, ['commit', '-m', validateCommitMessage(message)], executor)
  }

  export async function syncGitRepository(rootPathInput: string, executor: GitCommandExecutor = execGitCommand): Promise<void> {
    const rootPath = await resolveGitRootPath(rootPathInput)
    await runGitAtRoot(rootPath, ['pull', '--ff-only'], executor)
    await runGitAtRoot(rootPath, ['push'], executor)
  }
  ```

- [ ] **Step 4: Run the focused test to verify it passes**

  Run: `npx --no-install tsx src/main/git/runner.test.ts`

  Expected: exit code 0.

### Task 2: Expose restricted commit and sync IPC

**Files:**
- Modify: `src/main/ipc/git.ts:1-44`
- Modify: `src/preload/index.ts:68-75`
- Modify: `src/renderer/src/electron.d.ts:72-77`
- Modify: `src/main/git/runner.test.ts:1-118`

**Interfaces:**
- Consumes: `commitGitChanges(rootPath, message)` and `syncGitRepository(rootPath)` from Task 1.
- Produces: `window.electron.git.commit(workspaceId, message): Promise<void>` and `window.electron.git.sync(workspaceId): Promise<void>`.

- [ ] **Step 1: Write bridge-level contract checks**

  Extend `src/renderer/src/components/WorkspaceSourceControl.test.ts` with:

  ```ts
  if (!source.includes('window.electron.git.commit') || !source.includes('window.electron.git.sync')) {
    throw new Error('source control must use the restricted commit and sync bridge')
  }
  ```

  This fails until the UI consumes both bridge methods and prevents replacing them with renderer-side process access.

- [ ] **Step 2: Run the UI contract test to verify it fails**

  Run: `npx --no-install tsx src/renderer/src/components/WorkspaceSourceControl.test.ts`

  Expected: failure that the commit and sync bridge is missing.

- [ ] **Step 3: Register the main-process handlers and bridge methods**

  Import the Task 1 functions into `src/main/ipc/git.ts` and add handlers that call `getWorkspaceGitRoot(workspaceId)` before invoking them:

  ```ts
  ipcMain.handle('git:commit', async (_event, workspaceId: string, message: string) => {
    await commitGitChanges(await getWorkspaceGitRoot(workspaceId), message)
  })
  ipcMain.handle('git:sync', async (_event, workspaceId: string) => {
    await syncGitRepository(await getWorkspaceGitRoot(workspaceId))
  })
  ```

  Add matching preload invocations and strict renderer declarations. Do not expose a root path or arbitrary Git arguments.

- [ ] **Step 4: Run the UI contract test to verify it passes**

  Run: `npx --no-install tsx src/renderer/src/components/WorkspaceSourceControl.test.ts`

  Expected: exit code 0.

### Task 3: Add commit composer and Sync UI behavior

**Files:**
- Modify: `src/renderer/src/components/WorkspaceSourceControl.tsx:1-213`
- Modify: `src/renderer/src/components/WorkspaceSourceControl.test.ts:1-29`

**Interfaces:**
- Consumes: `GitStatusResult.upstream`, `GitStatusResult.ahead`, `GitStatusResult.behind`, and `window.electron.git.commit/sync` from Tasks 1-2.
- Produces: commit message composer, commit mutation, sync mutation, controlled pending state, retry state, and status refresh.

- [ ] **Step 1: Write failing component source-contract checks**

  Add focused static checks:

  ```ts
  for (const requiredLabel of ['Commit', 'Sync', 'Commit message']) {
    if (!source.includes(requiredLabel)) throw new Error(`source control must render ${requiredLabel}`)
  }
  if (!source.includes('disabled={!canCommit || actionPending}')) {
    throw new Error('commit must be disabled without staged changes, a message, or while Git is busy')
  }
  if (!source.includes('disabled={!status?.upstream || actionPending}')) {
    throw new Error('sync must require an upstream and respect pending work')
  }
  ```

- [ ] **Step 2: Run the focused UI test to verify it fails**

  Run: `npx --no-install tsx src/renderer/src/components/WorkspaceSourceControl.test.ts`

  Expected: failure that Commit and Sync controls are absent.

- [ ] **Step 3: Implement mutations and controls**

  In `WorkspaceSourceControl`, add `commitMessage` and `actionPending` state. Keep `handleToggle` unchanged in purpose but prevent it while `actionPending` is set. Create a reusable mutation wrapper that clears the prior error, records a retry callback, awaits the bridge operation, then calls `refresh`.

  Implement exact handlers:

  ```ts
  const canCommit = Boolean(status?.staged.length) && Boolean(commitMessage.trim())
  const handleCommit = useCallback(async () => {
    await runAction(() => window.electron.git.commit(workspaceId, commitMessage.trim()))
    setCommitMessage('')
  }, [commitMessage, runAction, workspaceId])

  const handleSync = useCallback(async () => {
    await runAction(() => window.electron.git.sync(workspaceId))
  }, [runAction, workspaceId])
  ```

  Only clear `commitMessage` after a successful commit (use a boolean return from `runAction`). Add Sync next to the refresh button with `disabled={!status?.upstream || actionPending}`. Add a bottom composer with a labelled `<textarea placeholder="Commit message" />` and `Commit` button with `disabled={!canCommit || actionPending}`. Keep the existing error area; its retry callback must retry commit or sync as well as stage/unstage. Show a short upstream/ahead/behind status label only when an upstream exists.

- [ ] **Step 4: Run the focused UI test to verify it passes**

  Run: `npx --no-install tsx src/renderer/src/components/WorkspaceSourceControl.test.ts`

  Expected: exit code 0.

### Task 4: Verify the complete change

**Files:**
- Verify: `src/main/git/runner.test.ts`
- Verify: `src/renderer/src/components/WorkspaceSourceControl.test.ts`
- Verify: all `src/**/*.test.ts` and `src/**/*.test.tsx`

**Interfaces:**
- Consumes: all changes from Tasks 1-3.
- Produces: evidence that source-control commit/sync works through strict TypeScript and the repository's self-contained tests.

- [ ] **Step 1: Run all colocated tests**

  Run:

  ```bash
  rg --files -g '*.test.ts' -g '*.test.tsx' src | sort -u | xargs -r -n1 -P4 npx --no-install tsx
  ```

  Expected: exit code 0.

- [ ] **Step 2: Run strict TypeScript validation**

  Run: `npx tsc --noEmit`

  Expected: exit code 0.

- [ ] **Step 3: Inspect change hygiene**

  Run: `git diff --check && git status --short`

  Expected: no whitespace errors; only intentional source-control, spec, and plan changes are listed.
