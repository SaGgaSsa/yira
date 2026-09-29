import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorkspaceExplorer } from './WorkspaceExplorer'

const markup = renderToStaticMarkup(
  <WorkspaceExplorer
    rootPath="/workspace"
    activeFilePath={null}
    onOpenFile={async () => undefined}
  />,
)

if (!markup.includes('Search workspace files')) {
  throw new Error('workspace explorer must render an accessible file search button')
}
if (!markup.includes('Empty folder') || markup.includes('<li')) {
  throw new Error('workspace explorer must show root contents directly without a root directory node')
}
