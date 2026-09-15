import assert from 'node:assert/strict'
import { MARKDOWN_NOTE_SOURCE_PATH, resolveMarkdownImageSource } from './markdownImage'

const fileSourcePath = 'docs/guide.md'

assert.deepEqual(resolveMarkdownImageSource(fileSourcePath, './images/diagram.png'), {
  kind: 'local',
  relativePath: 'docs/images/diagram.png',
})
assert.deepEqual(resolveMarkdownImageSource(fileSourcePath, './images/My%20Diagram.png?raw=1#preview'), {
  kind: 'local',
  relativePath: 'docs/images/My Diagram.png',
})
assert.deepEqual(resolveMarkdownImageSource(fileSourcePath, '/images/diagram.png'), {
  kind: 'local',
  relativePath: 'images/diagram.png',
})
assert.deepEqual(resolveMarkdownImageSource(MARKDOWN_NOTE_SOURCE_PATH, 'images/diagram.png'), {
  kind: 'local',
  relativePath: 'images/diagram.png',
})
assert.deepEqual(resolveMarkdownImageSource(fileSourcePath, 'https://example.com/diagram.png'), {
  kind: 'remote',
  url: 'https://example.com/diagram.png',
})

for (const url of ['data:image/png;base64,AAAA', 'javascript:alert(1)', 'file:///tmp/diagram.png', '//example.com/diagram.png', 'irc://example.com']) {
  assert.deepEqual(resolveMarkdownImageSource(fileSourcePath, url), { kind: 'blocked' }, url)
}

assert.deepEqual(resolveMarkdownImageSource(fileSourcePath, '../outside.png'), {
  kind: 'local',
  relativePath: 'outside.png',
})
assert.deepEqual(resolveMarkdownImageSource(fileSourcePath, '../../outside.png'), { kind: 'blocked' })
assert.deepEqual(resolveMarkdownImageSource(MARKDOWN_NOTE_SOURCE_PATH, '../outside.png'), { kind: 'blocked' })
