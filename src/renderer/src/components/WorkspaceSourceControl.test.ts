import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./WorkspaceSourceControl.tsx', import.meta.url), 'utf8')
const sectionSource = readFileSync(new URL('./SourceControlRepositorySection.tsx', import.meta.url), 'utf8')
const workspacePanelSource = readFileSync(new URL('./WorkspacePanel.tsx', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')

for (const requiredLabel of ['Staged Changes', 'Changes', 'Only changed', 'Refresh all', 'Fetch', 'Pull', 'Push', 'Sync']) {
  if (!source.includes(requiredLabel) && !sectionSource.includes(requiredLabel)) {
    throw new Error(`source control must render ${requiredLabel}`)
  }
}

for (const requiredAction of [
  'window.electron.git.status(requestWorkspaceId, repositoryPath)',
  'window.electron.git.history(requestWorkspaceId, repositoryPath)',
  'window.electron.git.stage(requestWorkspaceId, repositoryPath',
  'window.electron.git.unstage(requestWorkspaceId, repositoryPath',
  'window.electron.git.commit(requestWorkspaceId, repositoryPath',
]) {
  if (!source.includes(requiredAction)) throw new Error(`Git action must be scoped to its repository: ${requiredAction}`)
}

if (!source.includes('Promise.all(targets.map')) throw new Error('Refresh all must load repository statuses in parallel')
if (!source.includes('repositoryStatusVersionsRef.current[repositoryPath] !== nextVersion')) throw new Error('late repository status responses must be ignored')
if (!source.includes('historyLoadingPathsRef.current.has(repositoryPath)')) throw new Error('lazy history requests must be deduplicated while in flight')
if (!source.includes('if (isExpanded && repositoryStatus?.isRepository && histories')) throw new Error('history must load only for expanded repositories')
if (!source.includes('histories[repositoryPath] === undefined')) throw new Error('loaded history must not be requested again on render')
if (!source.includes('pendingActionsRef.current.has(actionKey)')) throw new Error('repository actions must prevent duplicate pending operations')
if (!source.includes('manuallyToggledCommitsRef.current.has(repositoryPath)')) throw new Error('outgoing commits must respect a manual accordion toggle')
if (!source.includes('onRetryStatus') || !sectionSource.includes('Retry operation')) throw new Error('status and action failures must provide retry controls')
if (!source.includes("t('workspace.noRepositoriesConfigured')") || !source.includes("t('workspace.configureSourceControl')")) {
  throw new Error('unconfigured source control must link to workspace settings')
}

for (const requiredSectionText of [
  'Commit message',
  'disabled={!canCommit || Boolean(pendingAction)}',
  '.slice(0, 5)',
  'No se pudo cargar el historial',
  'Date.parse',
  'No upstream',
]) {
  if (!sectionSource.includes(requiredSectionText)) throw new Error(`repository section must preserve ${requiredSectionText}`)
}

if (sectionSource.includes('window.electron.files.open')) throw new Error('source-control rows must not open files')
if (source.includes('placeholder="Search') || source.includes('type="search"')) throw new Error('source-control header must not add search')
if (!workspacePanelSource.includes('sourceControlRepositoryPaths={sourceControlRepositoryPaths}')
  || !appSource.includes('sourceControlRepositoryPaths={activeWorkspaceConfig.sourceControlRepositoryPaths}')) {
  throw new Error('workspace repository configuration must reach Source Control')
}
