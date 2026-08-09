export type FileSearchQueryResult =
  | {
      ok: true
      query: string
      mode: 'literal' | 'regex'
      matches: (fileName: string) => boolean
    }
  | {
      ok: false
      query: string
      mode: 'regex'
      error: string
    }

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function compileFileSearchQuery(rawQuery: string): FileSearchQueryResult {
  const isRegex = rawQuery.includes('.*')
  const pattern = isRegex ? rawQuery : escapeRegExp(rawQuery)

  try {
    const matcher = new RegExp(pattern, 'i')

    return {
      ok: true,
      query: rawQuery,
      mode: isRegex ? 'regex' : 'literal',
      matches: (fileName) => matcher.test(fileName),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    return {
      ok: false,
      query: rawQuery,
      mode: 'regex',
      error: `Invalid regular expression: ${message}`,
    }
  }
}
