import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MOD_PANEL_MAX_DEPTH,
  MOD_PANEL_MAX_ID_LENGTH,
  MOD_PANEL_MAX_NODES,
  MOD_PANEL_MAX_TEXT_LENGTH,
  modPanelKey,
  normalizeModPanelAddress,
  sanitizeModPanelTree,
  type ModPanelElement,
} from './modPanels'

function asElement(node: unknown): ModPanelElement {
  assert.ok(node && typeof node === 'object' && !Array.isArray(node))
  return node as ModPanelElement
}

test('sanitizer keeps only allowlisted props and clamps spacing', () => {
  const tree = sanitizeModPanelTree({
    type: 'Box',
    props: { gap: 99, padding: -4, flexDirection: 'diagonal', border: 'yes', wrap: true, extra: 1 },
    children: [
      { type: 'Text', props: { color: 'purple', bold: true, italic: 'no', dim: false }, children: ['hello'] },
    ],
  })

  assert.deepEqual(tree, {
    type: 'Box',
    props: { gap: 8, padding: 0, wrap: true },
    children: [{ type: 'Text', props: { bold: true, dim: false }, children: ['hello'] }],
  })
})

test('sanitizer drops buttons without a valid key', () => {
  const tree = sanitizeModPanelTree({
    type: 'Box',
    children: [
      { type: 'Button', props: { label: 'missing key' }, children: [] },
      { type: 'Button', props: { key: '   ' } },
      { type: 'Button', props: { key: 'x'.repeat(MOD_PANEL_MAX_ID_LENGTH + 1) } },
      { type: 'Button', props: { key: ' approve ', label: 'Approve', variant: 'ghost', disabled: true } },
    ],
  })

  assert.deepEqual(tree, {
    type: 'Box',
    children: [{ type: 'Button', props: { key: 'approve', label: 'Approve', disabled: true } }],
  })
})

test('sanitizer discards unknown element types', () => {
  assert.equal(sanitizeModPanelTree({ type: 'Plot' }), null)
  assert.equal(sanitizeModPanelTree({ props: {} }), null)

  assert.deepEqual(
    sanitizeModPanelTree({
      type: 'Box',
      children: [{ type: 'Plot' }, { type: 'Text', children: ['kept'] }],
    }),
    { type: 'Box', children: [{ type: 'Text', children: ['kept'] }] },
  )
})

test('sanitizer clips long text and language strings', () => {
  const long = 'a'.repeat(MOD_PANEL_MAX_TEXT_LENGTH + 25)
  assert.equal(sanitizeModPanelTree(long), 'a'.repeat(MOD_PANEL_MAX_TEXT_LENGTH))

  assert.deepEqual(
    sanitizeModPanelTree({ type: 'Code', props: { source: long, language: 'l'.repeat(100) } }),
    { type: 'Code', props: { source: 'a'.repeat(MOD_PANEL_MAX_TEXT_LENGTH), language: 'l'.repeat(64) } },
  )
})

test('sanitizer requires Markdown text and Code source', () => {
  assert.equal(sanitizeModPanelTree({ type: 'Markdown', props: {} }), null)
  assert.equal(sanitizeModPanelTree({ type: 'Markdown', props: { text: 42 } }), null)
  assert.equal(sanitizeModPanelTree({ type: 'Code' }), null)
  assert.equal(sanitizeModPanelTree({ type: 'Code', props: { language: 'ts' } }), null)
  assert.deepEqual(sanitizeModPanelTree({ type: 'Markdown', props: { text: 'hi' } }), {
    type: 'Markdown',
    props: { text: 'hi' },
  })
})

test('sanitizer caps the total node count', () => {
  const tree = asElement(sanitizeModPanelTree({
    type: 'Box',
    children: Array.from({ length: MOD_PANEL_MAX_NODES + 50 }, (_, index) => `node-${index}`),
  }))

  assert.equal(tree.type, 'Box')
  assert.equal(tree.children?.length, MOD_PANEL_MAX_NODES - 1)
})

test('sanitizer caps tree depth', () => {
  let nested: unknown = 'leaf'
  for (let index = 0; index < MOD_PANEL_MAX_DEPTH + 5; index += 1) {
    nested = { type: 'Box', children: [nested] }
  }

  let node: unknown = sanitizeModPanelTree(nested)
  let depth = 1
  while (node && typeof node === 'object' && !Array.isArray(node)) {
    const children = (node as { children?: unknown[] }).children
    if (!children?.length) break
    node = children[0]
    depth += 1
  }
  assert.equal(depth, MOD_PANEL_MAX_DEPTH)
})

test('sanitizer flattens nested arrays and drops unsupported children', () => {
  assert.deepEqual(
    sanitizeModPanelTree({
      type: 'Box',
      children: [['a', ['b', [42]]], null, undefined, true, 'c'],
    }),
    { type: 'Box', children: ['a', 'b', '42', 'c'] },
  )

  assert.equal(sanitizeModPanelTree(['a', 'b']), null)
})

test('sanitizer does not keep functions or prototypes', () => {
  const callback = (): string => 'hidden'
  assert.equal(sanitizeModPanelTree(callback), null)
  assert.deepEqual(
    sanitizeModPanelTree({
      type: 'Box',
      props: { gap: 1 },
      children: [callback, { type: 'Text', props: () => ({ bold: true }) }],
    }),
    { type: 'Box', props: { gap: 1 }, children: [{ type: 'Text' }] },
  )
})

test('sanitizer limits text and button children to strings and Text elements', () => {
  assert.deepEqual(
    sanitizeModPanelTree({
      type: 'Text',
      children: [
        'one',
        { type: 'Box', children: ['dropped'] },
        { type: 'Text', children: ['nested'] },
        { type: 'Button', props: { key: 'dropped' } },
      ],
    }),
    { type: 'Text', children: ['one', { type: 'Text', children: ['nested'] }] },
  )
})

test('normalizeModPanelAddress trims and bounds identifiers', () => {
  assert.deepEqual(
    normalizeModPanelAddress({ tileId: ' tile ', plugin: ' demo ', id: ' panel ' }),
    { tileId: 'tile', plugin: 'demo', id: 'panel' },
  )
  assert.equal(normalizeModPanelAddress({ tileId: '', plugin: 'demo', id: 'panel' }), null)
  assert.equal(normalizeModPanelAddress({ tileId: 1, plugin: 'demo', id: 'panel' }), null)
  assert.equal(
    normalizeModPanelAddress({ tileId: 'x'.repeat(MOD_PANEL_MAX_ID_LENGTH + 1), plugin: 'demo', id: 'panel' }),
    null,
  )
  assert.equal(normalizeModPanelAddress(null), null)
})

test('modPanelKey joins the address parts', () => {
  assert.equal(modPanelKey({ tileId: 'tile', plugin: 'demo', id: 'panel' }), 'tile\ndemo\npanel')
})
