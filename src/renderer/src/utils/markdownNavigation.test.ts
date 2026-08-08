import { resolveMarkdownAssetPath, resolveMarkdownNavigation } from './markdownNavigation'

const currentPath = 'docs/guides/setup.md'

const anchor = resolveMarkdownNavigation(currentPath, '#installation')
if (anchor.kind !== 'anchor' || anchor.anchor !== 'installation') {
  throw new Error('same-document fragments must resolve as anchors')
}

const documentTop = resolveMarkdownNavigation(currentPath, '#')
if (documentTop.kind !== 'top') {
  throw new Error('an empty same-document fragment must resolve to the document top')
}

const sibling = resolveMarkdownNavigation(currentPath, '../reference.md#api')
if (sibling.kind !== 'workspace-file' || sibling.relativePath !== 'docs/reference.md' || sibling.anchor !== 'api') {
  throw new Error('relative Markdown links must resolve from the source document directory')
}

const rootFile = resolveMarkdownNavigation(currentPath, '/README.md')
if (rootFile.kind !== 'workspace-file' || rootFile.relativePath !== 'README.md') {
  throw new Error('root-relative links must resolve from the workspace root')
}

const encoded = resolveMarkdownNavigation(currentPath, './images/My%20Diagram.png?raw=1')
if (encoded.kind !== 'workspace-file' || encoded.relativePath !== 'docs/guides/images/My Diagram.png') {
  throw new Error('workspace links must decode paths and ignore query strings')
}

const browser = resolveMarkdownNavigation(currentPath, 'https://example.com/docs')
if (browser.kind !== 'browser' || browser.url !== 'https://example.com/docs') {
  throw new Error('HTTP links must resolve to browser navigation')
}

const external = resolveMarkdownNavigation(currentPath, 'mailto:hello@example.com')
if (external.kind !== 'external' || external.url !== 'mailto:hello@example.com') {
  throw new Error('mailto links must resolve to external navigation')
}

for (const unsafe of [
  'javascript:alert(1)',
  'data:text/html,boom',
  'file:///etc/passwd',
  '//example.com/path',
  '../../../../outside.md',
  '/../../outside.md',
  '..%2F..%2F..%2Foutside.md',
  '..%252F..%252F..%252Foutside.md',
]) {
  if (resolveMarkdownNavigation(currentPath, unsafe).kind !== 'blocked') {
    throw new Error(`${unsafe} must be blocked`)
  }
}

if (resolveMarkdownAssetPath(currentPath, '../images/diagram.png') !== 'docs/images/diagram.png') {
  throw new Error('relative image paths must resolve inside the workspace')
}
if (resolveMarkdownAssetPath(currentPath, 'https://example.com/image.png') !== null) {
  throw new Error('remote image URLs must not be fetched by the local asset bridge')
}
