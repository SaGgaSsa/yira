const SAFE_PROTOCOLS = new Set(['http', 'https', 'irc', 'ircs', 'mailto', 'xmpp'])

export function safeMarkdownUrl(url: string): string {
  const trimmed = url.trim()
  const protocol = trimmed
    .replace(/[\u0000-\u0020\u007f-\u009f]/g, '')
    .match(/^([a-z][a-z\d+.-]*):/i)?.[1]
    ?.toLowerCase()

  if (!protocol || SAFE_PROTOCOLS.has(protocol)) return trimmed
  return ''
}
