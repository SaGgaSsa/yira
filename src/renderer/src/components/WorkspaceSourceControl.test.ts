import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./WorkspaceSourceControl.tsx', import.meta.url), 'utf8')

for (const requiredLabel of ['Staged Changes', 'Changes']) {
  if (!source.includes(requiredLabel)) throw new Error(`source control must render the ${requiredLabel} section`)
}

if (!source.includes('window.electron.git.status')) {
  throw new Error('source control must load status through the restricted Git bridge')
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
