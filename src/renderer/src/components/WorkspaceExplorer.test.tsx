import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { i18n, initializeI18n } from '../i18n'
import { WorkspaceExplorer } from './WorkspaceExplorer'

await initializeI18n('en')

const markup = renderToStaticMarkup(
  <I18nextProvider i18n={i18n}>
    <WorkspaceExplorer
      rootPath="/workspace"
      activeFilePath={null}
      onOpenFile={async () => undefined}
      requestConfirm={async () => true}
    />
  </I18nextProvider>,
)

if (!markup.includes('Search workspace files')) {
  throw new Error('workspace explorer must render an accessible file search button')
}
if (!markup.includes('Empty folder') || markup.includes('<li')) {
  throw new Error('workspace explorer must show root contents directly without a root directory node')
}

for (const label of ['New file', 'New folder', 'Show hidden files']) {
  if (!markup.includes(`aria-label="${label}"`)) throw new Error(`workspace explorer must render the ${label} button`)
}
