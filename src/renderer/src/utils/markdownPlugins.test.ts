import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import rehypeRaw from 'rehype-raw'
import { filterUnsafeMarkdownPlugins } from './markdownPlugins'

const keepPlugin = (): void => undefined
const remarkPlugins: Parameters<typeof filterUnsafeMarkdownPlugins>[1] = [rehypeRaw, keepPlugin]
const filteredRemarkPlugins = filterUnsafeMarkdownPlugins('remark', remarkPlugins)
if (filteredRemarkPlugins !== remarkPlugins) {
  throw new Error('remark plugins must pass through unchanged')
}

const rehypePlugins: Parameters<typeof filterUnsafeMarkdownPlugins>[1] = [
  keepPlugin,
  rehypeRaw,
  [rehypeRaw, { passThrough: [] }],
  [keepPlugin, {}],
]
const filteredRehypePlugins = filterUnsafeMarkdownPlugins('rehype', rehypePlugins)
if (filteredRehypePlugins.length !== 2 || filteredRehypePlugins[0] !== keepPlugin || filteredRehypePlugins[1] !== rehypePlugins[3]) {
  throw new Error('raw HTML plugins must be removed without changing safe rehype plugins')
}

const alternateModuleRawPlugin = function rehypeRaw(): void {}
if (filterUnsafeMarkdownPlugins('rehype', [alternateModuleRawPlugin]).length !== 0) {
  throw new Error('raw HTML plugins from a different module instance must also be removed')
}

const rendered = execFileSync(process.execPath, [
  resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs'),
  '-e',
  `import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MDEditor from '@uiw/react-md-editor';
import { safeMarkdownPreviewOptions } from './src/renderer/src/utils/markdownPlugins.ts';
const source = '<style>.x{color:red}</style><iframe src="https://example.com"></iframe><script>alert(1)</script><webview src="https://example.com"></webview>safe';
console.log(renderToStaticMarkup(React.createElement(MDEditor.Markdown, { ...safeMarkdownPreviewOptions, source })));`,
], { cwd: process.cwd(), encoding: 'utf8' })
for (const unsafeTag of ['<style', '<iframe', '<script', '<webview']) {
  assert.equal(rendered.includes(unsafeTag), false, `${unsafeTag} must not render as an active HTML element`)
}
assert.match(rendered, /safe/)
