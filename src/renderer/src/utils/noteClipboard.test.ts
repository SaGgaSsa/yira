import { createElectronClipboardPayload } from './noteClipboard'

const payload = createElectronClipboardPayload({
  externalHTML: '<h2>Title</h2><p>First line<br>Second line</p><ul><li>Item</li></ul>',
  markdown: '## Title\n\nFirst line\nSecond line\n\n- Item\n',
})

if (!payload) throw new Error('rich BlockNote clipboard payload should be created')
if (!payload.html.includes('<h2>Title</h2>')) throw new Error('clipboard HTML should preserve formatting')
if (payload.text !== '## Title\n\nFirst line\nSecond line\n\n- Item') {
  throw new Error(`clipboard text should preserve markdown line breaks, got ${JSON.stringify(payload.text)}`)
}

const emptyPayload = createElectronClipboardPayload({
  externalHTML: '  ',
  markdown: '  ',
})

if (emptyPayload !== null) throw new Error('empty clipboard payload should be ignored')
