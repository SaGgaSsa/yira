import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import type { WorkspaceGitDiffResult } from '@shared/types'
import { i18n, initializeI18n } from '@/i18n'
import {
  formatWorkspaceGitDiffCount,
  formatWorkspaceGitDiffExactCount,
  WorkspaceGitDiff,
  WorkspaceGitDiffIndicator,
} from './WorkspaceGitDiff'

await initializeI18n('en')

function renderIndicator(result: WorkspaceGitDiffResult | null): string {
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <WorkspaceGitDiffIndicator result={result} />
    </I18nextProvider>,
  )
}

test('does not render a workspace diff without a root folder', () => {
  const markup = renderToStaticMarkup(
    <WorkspaceGitDiff
      workspaceId="workspace-a"
      sourceControlRepositoryPaths={[]}
    />,
  )

  assert.equal(markup, '')
})

test('does not render an indicator before the diff result arrives', () => {
  const markup = renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <WorkspaceGitDiff
        workspaceId="workspace-a"
        rootFolderPath="/workspace"
        sourceControlRepositoryPaths={[]}
      />
    </I18nextProvider>,
  )

  assert.equal(markup, '')
})

test('hides the indicator without an available result, repositories, or pending changes', () => {
  assert.equal(renderIndicator(null), '')
  assert.equal(renderIndicator({ additions: 0, deletions: 0, available: false }), '')
  assert.equal(
    renderIndicator({ additions: 0, deletions: 0, available: false, repositoryCount: 0 }),
    '',
  )
  assert.equal(renderIndicator({ additions: 0, deletions: 0, available: true }), '')
})

test('shows only the positive side of the pending diff', () => {
  const additionsOnly = renderIndicator({ additions: 3, deletions: 0, available: true })
  assert.match(additionsOnly, /data-workspace-git-diff="true"/)
  assert.match(additionsOnly, /data-available="true"/)
  assert.match(additionsOnly, />\+3<\/span>/)
  assert.doesNotMatch(additionsOnly, /var\(--danger\)/)
  assert.doesNotMatch(additionsOnly, />\+0</)
  assert.doesNotMatch(additionsOnly, />−0</)

  const deletionsOnly = renderIndicator({ additions: 0, deletions: 5, available: true })
  assert.match(deletionsOnly, />−5<\/span>/)
  assert.doesNotMatch(deletionsOnly, /var\(--success\)/)
  assert.doesNotMatch(deletionsOnly, />\+0</)
  assert.doesNotMatch(deletionsOnly, />−0</)
})

test('keeps exact totals in the accessible text when both sides are positive', () => {
  const markup = renderIndicator({ additions: 4, deletions: 2, available: true })

  assert.match(markup, />\+4<\/span>/)
  assert.match(markup, />−2<\/span>/)
  assert.match(markup, /title="[^"]*\(\+4 −2\)/)
  assert.match(markup, /aria-label="[^"]*\(\+4 −2\)/)
})

test('keeps compact counts bounded and exact totals available for accessibility text', () => {
  assert.equal(formatWorkspaceGitDiffCount(42), '42')
  assert.equal(formatWorkspaceGitDiffCount(1_234), '1.2k')
  assert.equal(formatWorkspaceGitDiffCount(999_999), '1M')
  assert.equal(formatWorkspaceGitDiffCount(Number.MAX_SAFE_INTEGER), '999T+')
  assert.equal(formatWorkspaceGitDiffExactCount(1_234_567), (1_234_567).toLocaleString())
})
