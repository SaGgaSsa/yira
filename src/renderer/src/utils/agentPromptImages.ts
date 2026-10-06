export interface PromptTextEdit {
  value: string
  caret: number
}

export function getPromptImageReference(number: number): string {
  return `[Image #${number}]`
}

/** Insert `[Image #n]` references at the selection, like Claude Code does on paste. */
export function insertPromptImageReferences(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  numbers: number[],
): PromptTextEdit {
  const before = value.slice(0, selectionStart)
  const after = value.slice(selectionEnd)
  const needsLeadingSpace = before.length > 0 && !/\s$/.test(before)
  const needsTrailingSpace = !/^\s/.test(after)
  const references = numbers.map(getPromptImageReference).join(' ')
  const inserted = `${needsLeadingSpace ? ' ' : ''}${references}${needsTrailingSpace ? ' ' : ''}`
  return {
    value: before + inserted + after,
    caret: before.length + inserted.length,
  }
}

/** Remove every `[Image #n]` reference along with one space that separated it. */
export function removePromptImageReference(value: string, number: number): string {
  const reference = getPromptImageReference(number).replace(/[[\]#]/g, '\\$&')
  return value
    .replace(new RegExp(`${reference} ?`, 'g'), '')
    .replace(/ +$/gm, '')
}
