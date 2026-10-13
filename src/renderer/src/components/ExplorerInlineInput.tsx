import React, { useEffect, useRef, useState } from 'react'
import { File, Folder } from 'lucide-react'
import type { FileEntryKind } from '@shared/types'

interface ExplorerInlineInputProps {
  kind: FileEntryKind
  depth: number
  initialValue?: string
  /** Select only the name without its extension (used when renaming files). */
  selectBaseName?: boolean
  ariaLabel: string
  /** Live validation message for the current value, or null when it is acceptable. */
  validate: (value: string) => string | null
  /** Resolves to an error message to keep the input open, or null once the action succeeded. */
  onSubmit: (value: string) => Promise<string | null>
  onCancel: () => void
}

export function ExplorerInlineInput({
  kind,
  depth,
  initialValue = '',
  selectBaseName = false,
  ariaLabel,
  validate,
  onSubmit,
  onCancel,
}: ExplorerInlineInputProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null)
  const finishedRef = useRef(false)
  const [value, setValue] = useState(initialValue)
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const Icon = kind === 'directory' ? Folder : File
  const validationError = value === '' ? null : validate(value)
  const error = validationError ?? serverError

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    const extensionIndex = initialValue.lastIndexOf('.')
    const end = selectBaseName && extensionIndex > 0 ? extensionIndex : initialValue.length
    input.setSelectionRange(0, end)
  }, [initialValue, selectBaseName])

  const cancel = () => {
    if (finishedRef.current) return
    finishedRef.current = true
    onCancel()
  }

  const submit = async () => {
    if (submitting || finishedRef.current) return
    if (value === '' || validate(value)) return
    setSubmitting(true)
    const failure = await onSubmit(value)
    setSubmitting(false)
    if (failure === null) {
      finishedRef.current = true
      return
    }
    setServerError(failure)
    inputRef.current?.focus()
  }

  const handleBlur = () => {
    if (submitting || finishedRef.current) return
    if (value === '' || validate(value) || serverError) {
      cancel()
      return
    }
    void submit()
  }

  return (
    <div style={{ paddingLeft: `${12 + depth * 16}px` }} className="py-1 pr-3">
      <div className="flex items-center gap-1.5">
        <span className="w-[14px] shrink-0" />
        <Icon size={14} className="shrink-0 text-text-secondary" />
        <input
          ref={inputRef}
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          className={`min-w-0 flex-1 rounded-sm border bg-transparent px-1.5 py-0.5 text-sm text-text-display outline-hidden ${error ? 'border-danger' : 'border-border-visible focus:border-text-secondary'}`}
          disabled={submitting}
          onBlur={handleBlur}
          onChange={(event) => {
            setValue(event.target.value)
            setServerError(null)
          }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void submit()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              cancel()
            }
          }}
          spellCheck={false}
          value={value}
        />
      </div>
      {error && <p role="alert" className="mt-1 pl-[34px] text-xs text-danger">{error}</p>}
    </div>
  )
}
