import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getPromptImageReference,
  insertPromptImageReferences,
  removePromptImageReference,
} from './agentPromptImages'

test('formats image references like Claude Code', () => {
  assert.equal(getPromptImageReference(3), '[Image #3]')
})

test('inserts references at the selection with separating spaces', () => {
  assert.deepEqual(insertPromptImageReferences('', 0, 0, [1]), {
    value: '[Image #1] ',
    caret: 11,
  })
  assert.deepEqual(insertPromptImageReferences('Look at', 7, 7, [2, 3]), {
    value: 'Look at [Image #2] [Image #3] ',
    caret: 30,
  })
  assert.deepEqual(insertPromptImageReferences('Compare  and', 8, 8, [4]), {
    value: 'Compare [Image #4] and',
    caret: 18,
  })
  assert.deepEqual(insertPromptImageReferences('Replace THIS now', 8, 12, [5]), {
    value: 'Replace [Image #5] now',
    caret: 18,
  })
})

test('removes only the matching reference', () => {
  assert.equal(
    removePromptImageReference('Compare [Image #1] with [Image #12] ', 1),
    'Compare with [Image #12]',
  )
  assert.equal(removePromptImageReference('[Image #2] here', 2), 'here')
  assert.equal(removePromptImageReference('No reference', 3), 'No reference')
})
