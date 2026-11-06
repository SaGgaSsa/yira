import type { AgentProvider } from '@shared/types'

export const PROGRAM_STATUS_OSC = 7501
export const PROGRAM_STATUS_SUPPORT_REPLY = '\u001b]7501;?:states=idle,working,done,blocked,error:kinds=permission,question,auth\u001b\\'

export type ProgramStatusState = 'idle' | 'working' | 'done' | 'blocked' | 'error' | 'clear'
export type ProgramStatusKind = 'permission' | 'question' | 'auth'

export type ProgramStatusReport =
  | { type: 'query' }
  | { type: 'status'; state: ProgramStatusState; provider: AgentProvider | null; kind?: ProgramStatusKind; detail?: string }

const STATES: readonly ProgramStatusState[] = ['idle', 'working', 'done', 'blocked', 'error', 'clear']
const KINDS: readonly ProgramStatusKind[] = ['permission', 'question', 'auth']
const PROVIDERS: Readonly<Record<string, AgentProvider>> = {
  'claude-code': 'claude',
  codex: 'codex',
}
const MAX_DETAIL_LENGTH = 300
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g

function parseFields(payload: string): Map<string, string> {
  const fields = new Map<string, string>()
  for (const pair of payload.split(':')) {
    const separator = pair.indexOf('=')
    if (separator <= 0) continue
    fields.set(pair.slice(0, separator), pair.slice(separator + 1))
  }
  return fields
}

function normalizeDetail(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const detail = Buffer.from(value, 'base64')
    .toString('utf8')
    .replace(CONTROL_CHARACTERS, ' ')
    .trim()
    .slice(0, MAX_DETAIL_LENGTH)
  return detail || undefined
}

export function parseProgramStatus(payload: string): ProgramStatusReport | null {
  if (payload.startsWith('?')) return { type: 'query' }

  const fields = parseFields(payload)
  const state = fields.get('state')
  if (!state || !STATES.includes(state as ProgramStatusState)) return null

  const provider = PROVIDERS[fields.get('app') ?? ''] ?? null
  const kindValue = fields.get('kind')
  const kind = kindValue !== undefined && KINDS.includes(kindValue as ProgramStatusKind)
    ? kindValue as ProgramStatusKind
    : undefined
  const detail = normalizeDetail(fields.get('msg'))

  return {
    type: 'status',
    state: state as ProgramStatusState,
    provider,
    ...(kind ? { kind } : {}),
    ...(detail ? { detail } : {}),
  }
}
