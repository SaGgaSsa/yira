export type TranscriptEvent =
  | { kind: 'prompt'; text: string; timestamp?: string }
  | { kind: 'command'; name: string; args?: string; timestamp?: string }
  | { kind: 'reply'; text: string; messageId?: string; timestamp?: string }
  | { kind: 'title'; source: 'custom' | 'ai' | 'summary'; text: string }

export interface TranscriptRecordContext {
  sessionId?: string
  cwd?: string
  model?: string
}

export interface TranscriptRecordClassification {
  context: TranscriptRecordContext
  events: TranscriptEvent[]
  sessionMeta?: Record<string, unknown>
}

const MAX_CONTENT_DEPTH = 32

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function safeString(value: unknown, maxLength = 4_096): string | undefined {
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b-\u000c\u000e-\u001f\u007f]/.test(value)) return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : undefined
}

function firstSafeString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const candidate = safeString(value)
    if (candidate) return candidate
  }
  return undefined
}

function transcriptText(value: unknown): string | undefined {
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b-\u000c\u000e-\u001f\u007f]/.test(value)) return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function timestampValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1_000 : value
    const date = new Date(milliseconds)
    return Number.isNaN(date.valueOf()) ? undefined : date.toISOString()
  }
  const candidate = safeString(value)
  if (!candidate) return undefined
  const date = new Date(candidate)
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString()
}

function readTimestamp(row: Record<string, unknown>): string | undefined {
  return timestampValue(row.timestamp)
    ?? timestampValue(row.createdAt)
    ?? timestampValue(row.created_at)
    ?? timestampValue(row.updatedAt)
    ?? timestampValue(row.updated_at)
}

function readNestedTimestamp(row: Record<string, unknown>, payload?: Record<string, unknown>): string | undefined {
  return readTimestamp(row) ?? (payload ? readTimestamp(payload) : undefined)
}

function textFromContent(value: unknown, allowedTypes: Set<string>, depth = 0): string | undefined {
  if (depth > MAX_CONTENT_DEPTH) return undefined
  if (typeof value === 'string') return transcriptText(value)
  if (!Array.isArray(value)) return undefined

  const parts = value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.type !== 'string' || !allowedTypes.has(entry.type)) return []
    const text = textFromContent(entry.text, allowedTypes, depth + 1)
    return text ? [text] : []
  })
  return transcriptText(parts.join('\n'))
}

function contextFromClaude(row: Record<string, unknown>, type: string): TranscriptRecordContext {
  const message = isRecord(row.message) ? row.message : undefined
  const sessionId = firstSafeString(row.sessionId, row.session_id, type === 'system' ? row.id : undefined)
  const cwd = safeString(row.cwd)
  const model = firstSafeString(row.model, message?.model)
  return {
    ...(sessionId ? { sessionId } : {}),
    ...(cwd ? { cwd } : {}),
    ...(model ? { model } : {}),
  }
}

function contextFromCodex(
  row: Record<string, unknown>,
  payload?: Record<string, unknown>,
): TranscriptRecordContext {
  const sessionId = firstSafeString(payload?.id, payload?.session_id, row.sessionId, row.session_id)
  const cwd = firstSafeString(payload?.cwd, row.cwd)
  const model = firstSafeString(payload?.model, payload?.model_name, row.model)
  return {
    ...(sessionId ? { sessionId } : {}),
    ...(cwd ? { cwd } : {}),
    ...(model ? { model } : {}),
  }
}

function makeClassification(
  context: TranscriptRecordContext,
  events: TranscriptEvent[] = [],
  sessionMeta?: Record<string, unknown>,
): TranscriptRecordClassification {
  return { context, events, ...(sessionMeta ? { sessionMeta } : {}) }
}

function classifyClaudeUser(row: Record<string, unknown>, timestamp?: string): TranscriptEvent[] {
  const message = isRecord(row.message) ? row.message : undefined
  const rawText = textFromContent(message?.content ?? message?.text ?? row.content ?? row.text, new Set(['text']))
  if (!rawText) return []

  const text = rawText.trim()
  if (/^<(?:local-command-caveat|local-command-stdout|local-command-stderr|task-notification|system-reminder)\b/i.test(text)) {
    return []
  }
  // Claude records interruptions as synthetic user text.
  if (/^\[Request interrupted by user(?: for tool use)?\]$/i.test(text)) return []

  const commandTag = text.match(/<command-name>([\s\S]*?)<\/command-name>/i)
  if (commandTag) {
    const commandName = commandTag[1].trim()
    if (!commandName) return []
    const args = text.match(/<command-args>([\s\S]*?)<\/command-args>/i)?.[1]?.trim()
    return [{ kind: 'command', name: commandName, ...(args ? { args } : {}), ...(timestamp ? { timestamp } : {}) }]
  }

  const visibleText = transcriptText(text.replace(/<system-reminder\b[^>]*>[\s\S]*?<\/system-reminder>/gi, ''))
  return visibleText ? [{ kind: 'prompt', text: visibleText, ...(timestamp ? { timestamp } : {}) }] : []
}

export function classifyClaudeRecord(value: unknown): TranscriptRecordClassification {
  if (!isRecord(value)) return makeClassification({}, [])
  const type = typeof value.type === 'string' ? value.type.toLowerCase() : ''
  const context = contextFromClaude(value, type)
  if (value.isMeta === true || value.isSidechain === true) return makeClassification(context)
  const timestamp = readTimestamp(value)

  if (type === 'user') return makeClassification(context, classifyClaudeUser(value, timestamp))
  if (type === 'assistant') {
    const message = isRecord(value.message) ? value.message : undefined
    const text = textFromContent(message?.content ?? message?.text ?? value.content ?? value.text, new Set(['text']))
    if (!text) return makeClassification(context)
    const messageId = safeString(message?.id)
    return makeClassification(context, [{
      kind: 'reply',
      text,
      ...(messageId ? { messageId } : {}),
      ...(timestamp ? { timestamp } : {}),
    }])
  }
  if (type === 'custom-title') {
    const text = transcriptText(value.customTitle)
    return makeClassification(context, text ? [{ kind: 'title', source: 'custom', text }] : [])
  }
  if (type === 'ai-title') {
    const text = transcriptText(value.aiTitle)
    return makeClassification(context, text ? [{ kind: 'title', source: 'ai', text }] : [])
  }
  if (type === 'summary' || type === 'title') {
    const text = transcriptText(value.summary ?? value.title ?? value.text)
    return makeClassification(context, text ? [{ kind: 'title', source: 'summary', text }] : [])
  }
  return makeClassification(context)
}

export function isCodexWorkerSession(meta: Record<string, unknown> | undefined): boolean {
  if (meta && Object.prototype.hasOwnProperty.call(meta, 'thread_source')) {
    return safeString(meta.thread_source)?.toLowerCase() !== 'user'
  }
  const source = isRecord(meta?.source) ? meta.source : undefined
  return isRecord(source?.subagent)
}

export function isCodexExecSession(meta: Record<string, unknown> | undefined): boolean {
  const originator = safeString(meta?.originator)?.toLowerCase()
  const source = safeString(meta?.source)?.toLowerCase()
  return originator === 'codex_exec' || source === 'exec'
}

function eventText(value: unknown, allowedTypes: Set<string>): string | undefined {
  if (typeof value === 'string') return transcriptText(value)
  return textFromContent(value, allowedTypes)
}

export function classifyCodexRecord(value: unknown): TranscriptRecordClassification {
  if (!isRecord(value)) return makeClassification({}, [])
  const type = typeof value.type === 'string' ? value.type.toLowerCase() : ''
  const payload = isRecord(value.payload) ? value.payload : undefined
  const context = contextFromCodex(value, payload)

  if (type === 'session_meta') return makeClassification(context, [], payload ?? value)
  if (type === 'turn_context') {
    const cwd = safeString(payload?.cwd)
    const model = firstSafeString(payload?.model, payload?.model_name)
    return makeClassification({
      ...(cwd ? { cwd } : {}),
      ...(model ? { model } : {}),
    })
  }

  const timestamp = readNestedTimestamp(value, payload)
  if (type === 'event_msg' && payload?.type === 'item_completed') {
    const item = isRecord(payload.item) ? payload.item : undefined
    if (item?.type === 'UserMessage') {
      const text = eventText(item.content, new Set(['text', 'input_text']))
      // Answers to an agent question arrive as a tool payload, not as a prompt.
      if (!text || /^<send_user_message_question_reply>/i.test(text)) return makeClassification(context)
      return makeClassification(context, [{ kind: 'prompt', text, ...(timestamp ? { timestamp } : {}) }])
    }
    return makeClassification(context)
  }
  if (type === 'event_msg' && payload?.type === 'user_message') {
    const text = eventText(payload.message, new Set(['text', 'input_text']))
    return makeClassification(context, text ? [{ kind: 'prompt', text, ...(timestamp ? { timestamp } : {}) }] : [])
  }
  if (type === 'response_item' && payload?.type === 'message' && payload.role === 'assistant') {
    const text = eventText(payload.content ?? payload.message, new Set(['output_text', 'text']))
    return makeClassification(context, text ? [{ kind: 'reply', text, ...(timestamp ? { timestamp } : {}) }] : [])
  }
  if (type === 'message') {
    const role = safeString(value.role ?? payload?.role)?.toLowerCase()
    if (role === 'assistant') {
      const message = isRecord(value.message) ? value.message : undefined
      const text = eventText(value.content ?? message?.content ?? value.text ?? message?.text, new Set(['output_text', 'text']))
      return makeClassification(context, text ? [{ kind: 'reply', text, ...(timestamp ? { timestamp } : {}) }] : [])
    }
  }

  return makeClassification(context)
}
