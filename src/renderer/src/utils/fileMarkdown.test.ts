import { fileMarkdownLayout, isMarkdownFilePath, normalizeFileMarkdownViewMode } from './fileMarkdown'

for (const path of ['README.md', 'docs/Guide.MD', 'notes/design.markdown']) {
  if (!isMarkdownFilePath(path)) throw new Error(`${path} must be recognized as Markdown`)
}

for (const path of ['README.md.txt', 'docs/markdown', 'image.png']) {
  if (isMarkdownFilePath(path)) throw new Error(`${path} must not be recognized as Markdown`)
}

if (normalizeFileMarkdownViewMode(undefined) !== 'edit') {
  throw new Error('new Markdown file tiles must default to edit mode')
}

for (const mode of ['edit', 'live', 'preview'] as const) {
  if (normalizeFileMarkdownViewMode(mode) !== mode) {
    throw new Error(`valid Markdown file mode ${mode} must be preserved`)
  }
}

if (normalizeFileMarkdownViewMode('invalid') !== 'edit') {
  throw new Error('invalid Markdown file modes must normalize to edit mode')
}

const layouts = {
  edit: { showEditor: true, showPreview: false },
  live: { showEditor: true, showPreview: true },
  preview: { showEditor: false, showPreview: true },
} as const

for (const [mode, expected] of Object.entries(layouts)) {
  const actual = fileMarkdownLayout(mode)
  if (actual.showEditor !== expected.showEditor || actual.showPreview !== expected.showPreview) {
    throw new Error(`${mode} must select the expected editor and preview panes`)
  }
}
