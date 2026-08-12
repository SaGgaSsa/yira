import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./WorkspaceDialog.tsx', import.meta.url), 'utf8')
const managementSource = readFileSync(new URL('./WorkspaceManagementDialog.tsx', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
const resources = readFileSync(new URL('../i18n/resources.ts', import.meta.url), 'utf8')

test('renders the workspace settings tabs', () => {
  for (const tabId of ['general', 'terminal', 'agents', 'sourceControl']) {
    assert.match(source, new RegExp(`workspace\\.${tabId}`))
  }
})

test('renders source control repository selection copy', () => {
  for (const copy of ['Source Control', 'Repository', 'Select repositories', 'No repositories configured']) {
    assert.match(resources, new RegExp(copy))
  }
})

test('discovers repositories from the current root and persists selected paths', () => {
  assert.match(source, /workspaceId\?: string/)
  assert.match(source, /activeTab === 'sourceControl'/)
  assert.match(source, /if \(!rootFolderPath\)/)
  assert.match(source, /window\.electron\.git\.discoverRepositoriesAtRoot\(rootFolderPath\)/)
  assert.match(source, /sourceControlRepositoryPaths/)
  assert.match(source, /sourceControlRepositoryPaths: \[\]/)
  assert.match(source, /rootChanged \? \{ sourceControlRepositoryPaths: \[\] \}/)
})

test('connects tabs to explicit tab panels', () => {
  assert.match(source, /id=\{`workspace-dialog-tab-\$\{tab\.id\}`\}/)
  assert.match(source, /aria-controls=\{`workspace-dialog-panel-\$\{tab\.id\}`\}/)
  assert.match(source, /role="tabpanel"/)
  assert.match(source, /id=\{`workspace-dialog-panel-\$\{activeTab\}`\}/)
})

test('supports opening the Source Control tab directly', () => {
  assert.match(source, /initialTab/)
})

test('passes workspace identity and repository paths through management and app saves', () => {
  assert.match(managementSource, /workspaceId: draft\?\.id/)
  assert.match(managementSource, /sourceControlRepositoryPaths: value\.sourceControlRepositoryPaths/)
  assert.match(managementSource, /sourceControlRepositoryPaths: draft\.sourceControlRepositoryPaths/)
  assert.match(appSource, /workspaceId: workspace\.id,[\s\S]*?value:/)
  assert.match(appSource, /sourceControlRepositoryPaths: workspace\.config\.sourceControlRepositoryPaths/)
  assert.match(appSource, /sourceControlRepositoryPaths: value\.sourceControlRepositoryPaths/)
})
