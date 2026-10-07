import assert from 'node:assert/strict'
import test from 'node:test'
import type { IBufferCell, IBufferLine, Terminal } from '@xterm/xterm'

import {
  createTerminalMarkdownLinkProvider,
  findTerminalMarkdownLinks,
} from './terminalMarkdownLinks'

test('detects and normalizes supported Markdown path forms', () => {
  const cases = [
    ['README.md', '', 'README.md'],
    ['./docs/Guide.MD', '', 'docs/Guide.MD'],
    ['see docs/guide.markdown:24:3 now', '', 'docs/guide.markdown'],
    ['open "My Docs/Guide.md"', '', 'My Docs/Guide.md'],
    ['README.md', 'packages/app', 'packages/app/README.md'],
  ] as const

  const expectedIndexes = [
    [0, 9],
    [0, 15],
    [4, 28],
    [5, 23],
    [0, 9],
  ] as const

  for (const [index, [text, baseDirectory, relativePath]] of cases.entries()) {
    const matches = findTerminalMarkdownLinks(text, baseDirectory)
    assert.deepEqual(matches, [{
      text: text === 'see docs/guide.markdown:24:3 now'
        ? 'docs/guide.markdown:24:3'
        : text === 'open "My Docs/Guide.md"'
          ? '"My Docs/Guide.md"'
          : text,
      relativePath,
      startIndex: expectedIndexes[index][0],
      endIndex: expectedIndexes[index][1],
    }])
  }
})

test('strips agent tool calls, Markdown links, and mentions around Markdown paths', () => {
  assert.deepEqual(
    findTerminalMarkdownLinks('Read(docs/plan.md) [plan](docs/a.md) @docs/b.md').map(({ text, relativePath }) => ({ text, relativePath })),
    [
      { text: 'docs/plan.md', relativePath: 'docs/plan.md' },
      { text: 'docs/a.md', relativePath: 'docs/a.md' },
      { text: 'docs/b.md', relativePath: 'docs/b.md' },
    ],
  )
})

test('preserves backticks while detecting the Markdown path inside them', () => {
  assert.deepEqual(findTerminalMarkdownLinks('`README.md`'), [{
    text: '`README.md`',
    relativePath: 'README.md',
    startIndex: 0,
    endIndex: 11,
  }])

  assert.deepEqual(findTerminalMarkdownLinks('run `docs/guide.md:12` now'), [{
    text: '`docs/guide.md:12`',
    relativePath: 'docs/guide.md',
    startIndex: 4,
    endIndex: 22,
  }])
})

test('normalizes separators and safe dot segments without filesystem access', () => {
  assert.deepEqual(findTerminalMarkdownLinks(String.raw`./docs\\guide\\README.md`), [{
    text: String.raw`./docs\\guide\\README.md`,
    relativePath: 'docs/guide/README.md',
    startIndex: 0,
    endIndex: 24,
  }])

  assert.deepEqual(findTerminalMarkdownLinks('../docs/guide.md', 'packages/app'), [{
    text: '../docs/guide.md',
    relativePath: 'packages/docs/guide.md',
    startIndex: 0,
    endIndex: 16,
  }])

  assert.deepEqual(findTerminalMarkdownLinks('./docs/../README.md', 'packages/app'), [{
    text: './docs/../README.md',
    relativePath: 'packages/app/README.md',
    startIndex: 0,
    endIndex: 19,
  }])
})

test('supports a line and column suffix after a quoted path', () => {
  assert.deepEqual(findTerminalMarkdownLinks('open "My Docs/Guide.md":24:3 now'), [{
    text: '"My Docs/Guide.md":24:3',
    relativePath: 'My Docs/Guide.md',
    startIndex: 5,
    endIndex: 28,
  }])
})

test('rejects unsafe paths, URLs, and false Markdown extensions', () => {
  const unsafeInputs = [
    'README.md.txt',
    'https://example.com/readme.md',
    './https://example.com/readme.md',
    'HTTPS://example.com/readme.md',
    'ssh://example.com/readme.md',
    '/workspace/README.md',
    String.raw`C:\workspace\README.md`,
    String.raw`\\server\share\README.md`,
    'docs/\u0000guide.md',
    '../../../README.md',
    'README.markdown.bak',
    '~/README.md',
  ]

  for (const input of unsafeInputs) {
    assert.deepEqual(findTerminalMarkdownLinks(input, 'packages/app'), [], input)
  }

  assert.deepEqual(findTerminalMarkdownLinks('../README.md'), [])
})

test('does not return duplicate or overlapping matches', () => {
  const matches = findTerminalMarkdownLinks('README.md "README.md" README.md.txt')
  assert.deepEqual(matches, [
    {
      text: 'README.md',
      relativePath: 'README.md',
      startIndex: 0,
      endIndex: 9,
    },
    {
      text: '"README.md"',
      relativePath: 'README.md',
      startIndex: 10,
      endIndex: 21,
    },
  ])
})

interface FakeCell {
  chars: string
  width: number
}

function createCell({ chars, width }: FakeCell): IBufferCell {
  return {
    getChars: () => chars,
    getWidth: () => width,
  } as IBufferCell
}

function createLine(text: string, cells: FakeCell[]): IBufferLine {
  return {
    length: cells.length,
    translateToString: () => text,
    getCell: (column: number) => {
      const cell = cells[column]
      return cell ? createCell(cell) : undefined
    },
  } as IBufferLine
}

function provideLinks(provider: ReturnType<typeof createTerminalMarkdownLinkProvider>, lineNumber = 1) {
  let provided: Parameters<Parameters<typeof provider.provideLinks>[1]>[0] | undefined
  provider.provideLinks(lineNumber, (links) => {
    provided = links
  })
  return provided ?? []
}

test('maps text indexes after a wide Unicode cell to xterm cell ranges', () => {
  const text = '界 README.md'
  const cells = [
    { chars: '界', width: 2 },
    { chars: '', width: 0 },
    ...Array.from(' README.md', (chars) => ({ chars, width: 1 })),
  ]
  const terminal = {
    buffer: {
      active: {
        getLine: () => createLine(text, cells),
      },
    },
  } as unknown as Terminal

  const provider = createTerminalMarkdownLinkProvider(terminal, {
    onActivate: () => {},
  })
  const links = provideLinks(provider)

  assert.equal(links.length, 1)
  assert.deepEqual(links[0]?.range, {
    start: { x: 4, y: 1 },
    end: { x: 12, y: 1 },
  })
  assert.equal(links[0]?.text, 'README.md')
})

test('activates Markdown links only for a left click', () => {
  const text = 'docs/guide.md'
  const cells = Array.from(text, (chars) => ({ chars, width: 1 }))
  const terminal = {
    buffer: {
      active: {
        getLine: () => createLine(text, cells),
      },
    },
  } as unknown as Terminal
  const activated: string[] = []
  const provider = createTerminalMarkdownLinkProvider(terminal, {
    baseDirectory: 'packages/app',
    onActivate: (relativePath) => {
      activated.push(relativePath)
    },
  })
  const link = provideLinks(provider)[0]
  assert.ok(link)

  link.activate({ button: 2 } as MouseEvent, link.text)
  assert.deepEqual(activated, [])

  link.activate({ button: 0 } as MouseEvent, link.text)
  assert.deepEqual(activated, ['packages/app/docs/guide.md'])
})

test('activates the normalized path inside backticks', () => {
  const text = '`docs/guide.md:12`'
  const cells = Array.from(text, (chars) => ({ chars, width: 1 }))
  const terminal = {
    buffer: {
      active: {
        getLine: () => createLine(text, cells),
      },
    },
  } as unknown as Terminal
  const activated: string[] = []
  const provider = createTerminalMarkdownLinkProvider(terminal, {
    baseDirectory: 'packages/app',
    onActivate: (relativePath) => {
      activated.push(relativePath)
    },
  })
  const link = provideLinks(provider)[0]
  assert.ok(link)

  link.activate({ button: 0 } as MouseEvent, link.text)
  assert.deepEqual(activated, ['packages/app/docs/guide.md'])
})

test('reports normalized paths on hover and leave', () => {
  const text = 'docs/guide.md'
  const cells = Array.from(text, (chars) => ({ chars, width: 1 }))
  const terminal = {
    buffer: {
      active: {
        getLine: () => createLine(text, cells),
      },
    },
  } as unknown as Terminal
  const hovered: string[] = []
  const left: string[] = []
  const provider = createTerminalMarkdownLinkProvider(terminal, {
    baseDirectory: './packages/../app',
    onActivate: () => {},
    onHover: (relativePath) => hovered.push(relativePath),
    onLeave: (relativePath) => left.push(relativePath),
  })
  const link = provideLinks(provider)[0]
  assert.ok(link)

  link.hover?.({} as MouseEvent, link.text)
  link.leave?.({} as MouseEvent, link.text)

  assert.deepEqual(hovered, ['app/docs/guide.md'])
  assert.deepEqual(left, ['app/docs/guide.md'])
})

test('returns no links for a missing or non-Markdown buffer row', () => {
  const terminal = {
    buffer: {
      active: {
        getLine: () => undefined,
      },
    },
  } as unknown as Terminal
  const provider = createTerminalMarkdownLinkProvider(terminal, {
    onActivate: () => {},
  })
  assert.deepEqual(provideLinks(provider), [])

  const plainText = 'no link here'
  const plainTerminal = {
    buffer: {
      active: {
        getLine: () => createLine(plainText, Array.from(plainText, (chars) => ({ chars, width: 1 }))),
      },
    },
  } as unknown as Terminal
  const plainProvider = createTerminalMarkdownLinkProvider(plainTerminal, {
    onActivate: () => {},
  })
  assert.deepEqual(provideLinks(plainProvider), [])
})
