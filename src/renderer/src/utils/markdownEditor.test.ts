import { getMarkdownEditorKey } from './markdownEditor'

const splitKey = getMarkdownEditorKey('note-1', 'live')
const previewKey = getMarkdownEditorKey('note-1', 'preview')

if (splitKey === previewKey) {
  throw new Error('Markdown editor keys must change when the requested view changes')
}

if (getMarkdownEditorKey('note-1', 'edit') !== 'note-1:edit') {
  throw new Error('Markdown editor keys must include the note and requested view')
}
