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
  assert.equal(items.some((item) => item.label === 'Send to agent'), false)
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

test('note menu adds an enabled agent submenu only when selection exists', () => {
  let sentTo = ''
  const items = buildItems({
    selectedText: 'prompt text',
    agentTargets: [{ id: 'agent-one', label: 'Claude task' }],
    onSendToAgent: (id) => { sentTo = id },
  })
  const sendItem = items.find((item) => item.label === 'Send to agent')

  assert.ok(sendItem)
  assert.equal(sendItem.disabled, false)
  assert.equal(sendItem.submenu?.[0].label, 'Claude task')
  sendItem.submenu?.[0].action?.()
  assert.equal(sentTo, 'agent-one')

  const noSelection = buildItems({
    onSendToAgent: () => {},
    agentTargets: [{ id: 'agent-one', label: 'Claude task' }],
  })
  assert.equal(noSelection.find((item) => item.label === 'Send to agent')?.disabled, true)
})

test('note menu shows a disabled empty-workspace item when no agents are available', () => {
  const items = buildItems({ onSendToAgent: () => {}, agentTargets: [] })
  const emptyItem = items.find((item) => item.label === 'No agents in this workspace')

  assert.ok(emptyItem)
  assert.equal(emptyItem.disabled, true)
  assert.equal(emptyItem.submenu, undefined)
})
