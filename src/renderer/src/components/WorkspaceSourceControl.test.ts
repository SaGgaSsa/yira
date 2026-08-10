import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./WorkspaceSourceControl.tsx', import.meta.url), 'utf8')

for (const requiredLabel of ['Staged Changes', 'Changes']) {
  if (!source.includes(requiredLabel)) throw new Error(`source control must render the ${requiredLabel} section`)
}

if (!source.includes('window.electron.git.status')) {
  throw new Error('source control must load status through the restricted Git bridge')
}
if (!source.includes('window.electron.git.history(workspaceId)')) {
  throw new Error('source control must load commit history through the restricted Git bridge')
}
const refreshBody = source.match(/const refresh = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[workspaceId\]\)/)?.[1]
if (!refreshBody?.includes('window.electron.git.status(workspaceId)') || !refreshBody.includes('window.electron.git.history(workspaceId)')) {
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
if (!source.includes('disabled={!status?.upstream || actionPending}')) {
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
