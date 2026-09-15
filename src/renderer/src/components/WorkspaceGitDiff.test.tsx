import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { i18n, initializeI18n } from '@/i18n'
import {
  formatWorkspaceGitDiffCount,
  formatWorkspaceGitDiffExactCount,
  WorkspaceGitDiff,
} from './WorkspaceGitDiff'

await initializeI18n('en')

test('does not render a workspace diff without a root folder', () => {
  const markup = renderToStaticMarkup(
    <WorkspaceGitDiff
      workspaceId="workspace-a"
      sourceControlRepositoryPaths={[]}
    />,
  )

  assert.equal(markup, '')
})

test('renders the diff indicator with a root folder and no selected repositories', () => {
  const markup = renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <WorkspaceGitDiff
        workspaceId="workspace-a"
        rootFolderPath="/workspace"
        sourceControlRepositoryPaths={[]}
      />
    </I18nextProvider>,
  )

  assert.match(markup, /data-workspace-git-diff="true"/)
  assert.match(markup, /data-available="false"/)
  assert.match(markup, />—<\/span>/)
  assert.match(markup, /title="Git diff unavailable for this workspace\."/)
  assert.match(markup, /aria-label="Git diff unavailable for this workspace\."/)
})

test('keeps compact counts bounded and exact totals available for accessibility text', () => {
  assert.equal(formatWorkspaceGitDiffCount(42), '42')
  assert.equal(formatWorkspaceGitDiffCount(1_234), '1.2k')
  assert.equal(formatWorkspaceGitDiffCount(999_999), '1M')
  assert.equal(formatWorkspaceGitDiffCount(Number.MAX_SAFE_INTEGER), '999T+')
  assert.equal(formatWorkspaceGitDiffExactCount(1_234_567), (1_234_567).toLocaleString())
})
