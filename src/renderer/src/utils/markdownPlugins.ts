import type { MarkdownPreviewProps } from '@uiw/react-markdown-preview'
import rehypeRaw from 'rehype-raw'

export const filterUnsafeMarkdownPlugins: NonNullable<MarkdownPreviewProps['pluginsFilter']> = (type, plugins) => {
  if (type !== 'rehype') return plugins

  return plugins.filter((entry) => {
    const plugin = Array.isArray(entry) ? entry[0] : entry
    return plugin !== rehypeRaw && !(typeof plugin === 'function' && plugin.name === 'rehypeRaw')
  })
}

export const safeMarkdownPreviewOptions = {
  skipHtml: true,
  pluginsFilter: filterUnsafeMarkdownPlugins,
} satisfies Pick<MarkdownPreviewProps, 'skipHtml' | 'pluginsFilter'>
