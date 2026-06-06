export interface BlockNoteClipboardExport {
  externalHTML: string
  markdown: string
}

export interface ElectronClipboardPayload {
  html: string
  text: string
}

export function createElectronClipboardPayload(exported: BlockNoteClipboardExport): ElectronClipboardPayload | null {
  const html = exported.externalHTML.trim()
  const text = exported.markdown.replace(/\r\n?/g, '\n').trimEnd()

  if (!html && !text.trim()) return null

  return { html, text }
}
