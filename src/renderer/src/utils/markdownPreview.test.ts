import { safeMarkdownUrl } from './markdownPreview'

const safeUrls = ['docs/guide.md', '../docs/guide.md', '/workspace', '#section', 'https://example.com', 'mailto:hello@example.com']
for (const url of safeUrls) {
  if (safeMarkdownUrl(url) !== url) throw new Error(`expected ${url} to remain a safe Markdown URL`)
}

const unsafeUrls = ['javascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,alert(1)', 'file:///etc/passwd']
for (const url of unsafeUrls) {
  if (safeMarkdownUrl(url) !== '') throw new Error(`expected ${url} to be rejected from Markdown previews`)
}
