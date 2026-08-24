import assert from 'node:assert/strict'

import {
  createFloatingFileNavigationRequest,
  normalizeFloatingNavigationRequest,
} from './floatingNavigation'

assert.deepEqual(
  normalizeFloatingNavigationRequest({
    kind: 'file',
    target: 'docs/guide.md',
    fileMarkdownView: 'preview',
  }),
  {
    kind: 'file',
    target: 'docs/guide.md',
    fileMarkdownView: 'preview',
  },
)

assert.deepEqual(
  normalizeFloatingNavigationRequest({
    kind: 'browser',
    target: 'https://example.com',
    fileMarkdownView: 'preview',
  }),
  {
    kind: 'browser',
    target: 'https://example.com',
  },
)

assert.deepEqual(
  normalizeFloatingNavigationRequest({
    kind: 'file',
    target: 'README.md',
    fileMarkdownView: 'side-by-side',
  }),
  {
    kind: 'file',
    target: 'README.md',
  },
)

assert.equal(normalizeFloatingNavigationRequest({ kind: 'other', target: 'README.md' }), null)
assert.equal(normalizeFloatingNavigationRequest({ kind: 'file', target: '' }), null)
assert.equal(normalizeFloatingNavigationRequest({ kind: 'file', target: '   ' }), null)

const preservedTarget = normalizeFloatingNavigationRequest({ kind: 'file', target: ' docs/guide.md ' })
assert.deepEqual(preservedTarget, {
  kind: 'file',
  target: ' docs/guide.md ',
})

const detachedPreviewRequest = createFloatingFileNavigationRequest('docs/guide.md', { markdownView: 'preview' })
assert.deepEqual(detachedPreviewRequest, {
  kind: 'file',
  target: 'docs/guide.md',
  fileMarkdownView: 'preview',
})
assert.deepEqual(normalizeFloatingNavigationRequest(detachedPreviewRequest), {
  kind: 'file',
  target: 'docs/guide.md',
  fileMarkdownView: 'preview',
})

assert.deepEqual(createFloatingFileNavigationRequest('README.md'), {
  kind: 'file',
  target: 'README.md',
})
