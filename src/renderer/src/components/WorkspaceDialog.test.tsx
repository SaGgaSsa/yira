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

test('discovers repositories only for an identified workspace and persists selected paths', () => {
  assert.match(source, /workspaceId\?: string/)
  assert.match(source, /activeTab === 'sourceControl'/)
  assert.match(source, /if \(!workspaceId \|\| !rootFolderPath\)/)
  assert.match(source, /window\.electron\.git\.discoverRepositories\(workspaceId\)/)
  assert.match(source, /sourceControlRepositoryPaths/)
  assert.match(source, /sourceControlRepositoryPaths: \[\]/)
  assert.match(source, /rootChanged \? \{ sourceControlRepositoryPaths: \[\] \}/)
})

test('passes workspace identity and repository paths through management and app saves', () => {
  assert.match(managementSource, /workspaceId: draft\?\.id/)
  assert.match(managementSource, /sourceControlRepositoryPaths: value\.sourceControlRepositoryPaths/)
  assert.match(managementSource, /sourceControlRepositoryPaths: draft\.sourceControlRepositoryPaths/)
  assert.match(appSource, /workspaceId: workspace\.id,\n        value:/)
  assert.match(appSource, /sourceControlRepositoryPaths: workspace\.config\.sourceControlRepositoryPaths/)
  assert.match(appSource, /sourceControlRepositoryPaths: value\.sourceControlRepositoryPaths/)
})
