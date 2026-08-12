import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./WorkspaceSourceControl.tsx', import.meta.url), 'utf8')

for (const requiredLabel of ['Staged Changes', 'Changes']) {
  if (!source.includes(requiredLabel)) throw new Error(`source control must render the ${requiredLabel} section`)
}

if (!source.includes('window.electron.git.status')) {
  throw new Error('source control must load status through the restricted Git bridge')
}
if (!source.includes('window.electron.git.history')) {
  throw new Error('source control must load commit history through the restricted Git bridge')
}
const refreshBody = source.match(/const refresh = useCallback\(async [\s\S]*?=> \{([\s\S]*?)\n  \}, \[workspaceId\]\)/)?.[1]
if (!refreshBody?.includes('window.electron.git.status') || !refreshBody.includes('window.electron.git.history')) {
  throw new Error('every Source Control refresh must request both status and history')
}
if (!source.includes('Promise.allSettled')) {
  throw new Error('history failures must not replace a healthy Source Control status')
}
if (!source.includes('window.electron.git.stage') || !source.includes('window.electron.git.unstage')) {
  throw new Error('source control must expose stage and unstage actions per file')
}
if (!source.includes('window.electron.git.commit') || !source.includes('window.electron.git.sync')) {
  throw new Error('source control must use the restricted commit and sync bridge')
}
if (!source.includes('sourceControlViewMode')) {
  throw new Error('source control must persist the list/tree preference')
}
if (source.includes('window.electron.files.open')) {
  throw new Error('source-control file rows must not open files externally')
}
if (source.includes('placeholder="Search')) {
  throw new Error('source-control header must not add search')
}
if (!source.includes('Retry operation')) {
  throw new Error('failed Git mutations must offer an explicit retry action')
}
for (const requiredLabel of ['Commit', 'Sync', 'Commit message']) {
  if (!source.includes(requiredLabel)) throw new Error(`source control must render ${requiredLabel}`)
}
if (!source.includes('disabled={!canCommit || actionPending}')) {
  throw new Error('commit must be disabled without staged changes, a message, or while Git is busy')
}
if (!source.includes('disabled={!status?.upstream || actionPending}') && !source.includes('disabled={!currentStatus?.upstream || actionPending}')) {
  throw new Error('sync must require an upstream and respect pending work')
}
if (!source.includes('Commits')) {
  throw new Error('source control must render a collapsible Commits accordion')
}
if ((!source.includes('aria-expanded={expanded}') && !source.includes('aria-expanded={commitsExpanded}')) || !source.includes('aria-controls="source-control-commits"')) {
  throw new Error('commits accordion must expose sensible ARIA toggle state')
}
for (const requiredLabel of ['Por subir (', 'Últimos en remoto', 'No hay comparación remota', 'Últimos locales']) {
  if (!source.includes(requiredLabel)) throw new Error(`commit history must render ${requiredLabel}`)
}
if (!source.includes('No se pudo cargar el historial')) {
  throw new Error('commit history failures must stay localized inside the accordion')
}
if (!source.includes('historyLoadedWorkspaceRef.current !== workspaceId') || !source.includes('setCommitsExpanded(nextHistory.outgoing.length > 0)')) {
  throw new Error('commit history must auto-expand only on each workspace first load with outgoing commits')
}
if (!source.includes('.slice(0, 5)')) {
  throw new Error('remote and local commit history must be limited to five entries')
}
if (!source.includes('Date.parse')) {
  throw new Error('commit dates must be parsed defensively for relative display')
}
if (!source.includes('activeWorkspaceRef.current = workspaceId') || !source.includes('activeWorkspaceRef.current !== workspaceId') || !source.includes('statusWorkspaceRef.current === workspaceId')) {
  throw new Error('source control async work must be scoped to the active workspace')
}
if (!source.includes('const actionWorkspaceId = workspaceId') || !source.includes('const updateWorkspaceId = workspaceId')) {
  throw new Error('Git and workspace update completions must retain their originating workspace identity')
}
for (const resetCall of ['setStatus(null)', 'setHistory(null)', 'setCommitMessage(\'\')', 'setRetryAction(null)', 'setActionPending(false)']) {
  if (!source.includes(resetCall)) throw new Error(`workspace changes must clear ${resetCall}`)
}
if (!source.includes('manualCommitsToggleRef') || !source.includes('manualCommitsToggleRef.current.has(workspaceId)')) {
  throw new Error('manual commit accordion toggles must be tracked per workspace')
}
if (!source.includes('preserveActionError') || !source.includes('await refresh({ preserveActionError:')) {
  throw new Error('mutation failures must refresh status/history without replacing the original error')
}
if (!source.includes('setRetryAction({ workspaceId: actionWorkspaceId, repositoryPath: actionRepositoryPath, action })')) {
  throw new Error('retry actions must retain their originating workspace')
}
if (!source.includes('const currentRetryAction = retryAction?.workspaceId === workspaceId && retryAction.repositoryPath === activeRepositoryPath')) {
  throw new Error('retry actions must be derived only for the active workspace')
}
if (!source.includes('retryAction.workspaceId !== workspaceId')) {
  throw new Error('retry handler must reject actions from another workspace')
}
if (!source.includes('const currentActionError = actionError?.workspaceId === workspaceId && actionError.repositoryPath === activeRepositoryPath')) {
  throw new Error('action errors must be scoped to the active workspace')
}
if (!source.includes('{currentActionError &&') || !source.includes('{currentRetryAction &&')) {
  throw new Error('stale workspace errors and retry controls must not render')
}

if (!source.includes('window.electron.workspace.getActive()')) {
  throw new Error('source control must load the active workspace repository configuration')
}
if (!source.includes('window.electron.git.discoverRepositories(workspaceId)')) {
  throw new Error('source control must discover repository names when it mounts')
}
if (!source.includes('sourceControlRepositoryPaths')) {
  throw new Error('source control must use the configured repository paths')
}
if (!source.includes('sortRepositories(configuredRepositories)')) {
  throw new Error('source control repositories must be ordered by name')
}
if (!source.includes('source-control-repository')) {
  throw new Error('source control must render a repository selector')
}
if (!source.includes('No hay repositorios configurados')) {
  throw new Error('source control must render the exact unconfigured state')
}
if (!source.includes('onOpenWorkspaceSettings')) {
  throw new Error('unconfigured source control must offer workspace configuration')
}
for (const requiredRepositoryCall of [
  'window.electron.git.status(workspaceId, repositoryPath)',
  'window.electron.git.history(workspaceId, repositoryPath)',
  'window.electron.git.stage(workspaceId, actionRepositoryPath',
  'window.electron.git.unstage(workspaceId, actionRepositoryPath',
  'window.electron.git.commit(workspaceId, actionRepositoryPath',
  'window.electron.git.sync(workspaceId, actionRepositoryPath)',
]) {
  if (!source.includes(requiredRepositoryCall)) throw new Error(`source control must send the active repository path to ${requiredRepositoryCall}`)
}
if (!source.includes('setActiveRepositoryPath')) {
  throw new Error('source control must retain the selected repository during refresh and actions')
}
