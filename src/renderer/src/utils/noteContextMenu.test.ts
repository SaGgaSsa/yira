import assert from 'node:assert/strict'
import test from 'node:test'
import { buildNoteContextMenuItems } from './noteContextMenu'

function buildItems(overrides: Partial<Parameters<typeof buildNoteContextMenuItems>[0]> = {}) {
  return buildNoteContextMenuItems({
    selectedText: '',
    editable: true,
    onCopySelection: () => {},
    onCutSelection: () => {},
    onPaste: () => {},
    onSelectAll: () => {},
    ...overrides,
  })
}

test('note menu disables copy and cut without a selection and enables paste for editable content', () => {
  const items = buildItems()

  assert.equal(items[0].disabled, true)
  assert.equal(items[1].disabled, true)
  assert.equal(items[2].disabled, false)
  assert.equal(items[3].disabled, undefined)
  assert.equal(items.some((item) => item.label === 'Send to new prompt'), false)
})

test('note preview disables cut and paste while allowing copy and select all', () => {
  const items = buildItems({ editable: false, selectedText: 'selected preview' })

  assert.equal(items[0].disabled, false)
  assert.equal(items[1].disabled, true)
  assert.equal(items[2].disabled, true)
  assert.equal(items[3].disabled, undefined)
})

test('editable note selection enables cut and paste', () => {
  const items = buildItems({ selectedText: 'selected text' })

  assert.equal(items[0].disabled, false)
  assert.equal(items[1].disabled, false)
  assert.equal(items[2].disabled, false)
})

test('note menu sends the selection to a new prompt only when text is selected', () => {
  let sent = false
  const items = buildItems({
    selectedText: 'prompt text',
    onSendToPrompt: () => { sent = true },
  })
  const sendItem = items.find((item) => item.label === 'Send to new prompt')

  assert.ok(sendItem)
  assert.equal(sendItem.disabled, false)
  assert.equal(sendItem.submenu, undefined)
  sendItem.action?.()
  assert.equal(sent, true)

  const noSelection = buildItems({ onSendToPrompt: () => {} })
  assert.equal(noSelection.find((item) => item.label === 'Send to new prompt')?.disabled, true)
})
