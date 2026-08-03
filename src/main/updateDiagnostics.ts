import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

const DEFAULT_MAX_BYTES = 512 * 1024
const NETWORK_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ETIMEDOUT',
])

export type UpdateDiagnosticValue = boolean | number | string | null

export type SafeUpdateErrorData = Record<string, UpdateDiagnosticValue>

export interface UpdateDiagnosticEvent {
  event: string
  data?: Record<string, unknown>
}

export function waitForUpdateDiagnosticTask(task: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  const delay = Number.isFinite(timeoutMs) ? Math.max(0, Math.floor(timeoutMs)) : 0

  return new Promise((resolve) => {
    let settled = false
    let timeoutId: NodeJS.Timeout | null = null
    const finish = (completed: boolean) => {
      if (settled) return
      settled = true
      if (timeoutId) clearTimeout(timeoutId)
      resolve(completed)
    }
    timeoutId = setTimeout(() => finish(false), delay)

    void task.then(
      () => finish(true),
      () => finish(false),
    )
  })
}

interface UpdateDiagnosticsOptions {
  homeDir: string
  getVersion: () => string
  maxBytes?: number
  onError?: (error: unknown) => void
}

interface ErrorDetails {
  code?: unknown
  message?: unknown
  statusCode?: unknown
}

function getPrivilegeCommandFailure(message: string): SafeUpdateErrorData | null {
  const match = /\bcommand\s+pkexec\s+exited\s+with\s+code\s+(\d+)\b/.exec(message)
  if (!match) return null

  const exitCode = Number(match[1])
  if (Number.isSafeInteger(exitCode)) return { category: 'privilege-command-failed', exitCode }
  return { category: 'privilege-command-failed' }
}

function getErrorDetails(error: unknown): { code: string; message: string; statusCode: string } {
  if (typeof error !== 'object' || error === null) {
    return {
      code: '',
      message: typeof error === 'string' ? error.toLowerCase() : '',
      statusCode: '',
    }
  }

  const details = error as ErrorDetails
  return {
    code: typeof details.code === 'string' ? details.code.toUpperCase() : '',
    message: typeof details.message === 'string' ? details.message.toLowerCase() : '',
    statusCode: typeof details.statusCode === 'number' || typeof details.statusCode === 'string'
      ? String(details.statusCode)
      : '',
  }
}

export function getSafeUpdateErrorData(error: unknown): SafeUpdateErrorData {
  const { code, message, statusCode } = getErrorDetails(error)
  const errorText = `${code.toLowerCase()} ${message}`
  const isNotFound = statusCode === '404' || /httperror:\s*404|status(?:code)?\s*[:=]?\s*404/.test(message)
  const isUnauthorized = statusCode === '401' || statusCode === '403'
    || /httperror:\s*(401|403)|status(?:code)?\s*[:=]?\s*(401|403)/.test(message)
  const privilegeFailure = getPrivilegeCommandFailure(message)

  if (privilegeFailure) return privilegeFailure

  if (NETWORK_ERROR_CODES.has(code) || /\b(eai_again|econnrefused|econnreset|enetunreach|enotfound|ehostunreach|etimedout|network error)\b/.test(errorText)) {
    return { category: 'network' }
  }

  if (message.includes('latest.yml') && isNotFound) return { category: 'missing-manifest' }
  if (isUnauthorized) return { category: 'authorization' }
  if (message.includes('latest.yml') && /\b(parse|invalid|malformed|corrupt)\b/.test(message)) return { category: 'invalid-metadata' }
  return { category: 'unknown' }
}

export function getSafeUpdaterLogData(message: unknown): SafeUpdateErrorData {
  const text = typeof message === 'string' ? message.toLowerCase() : ''
  const privilegeFailure = getPrivilegeCommandFailure(text)

  if (privilegeFailure) return privilegeFailure
  if (/executing:\s*pkexec\b/.test(text)) return { category: 'privilege-command-started' }
  if (/running as non-root user, using sudo/.test(text)) return { category: 'privilege-escalation-selected' }
  if (/dpkg installation failed|command .*dpkg.* exited with code/.test(text)) return { category: 'package-manager-failed' }
  if (/install on explicit quitandinstall/.test(text)) return { category: 'explicit-install-requested' }
  if (/auto install update on quit/.test(text)) return { category: 'auto-install-on-quit' }
  if (/update installer has already been triggered/.test(text)) return { category: 'installer-triggered' }
  if (/new version .* has been downloaded|update has already been downloaded/.test(text)) return { category: 'download-ready' }
  if (/checking for update/.test(text)) return { category: 'checking' }
  return { category: 'updater-message' }
}

function isSafeValue(value: unknown): value is UpdateDiagnosticValue {
  return value === null
    || typeof value === 'boolean'
    || typeof value === 'string'
    || (typeof value === 'number' && Number.isFinite(value))
}

function sanitizeData(data: Record<string, unknown> | undefined): Record<string, UpdateDiagnosticValue> | undefined {
  if (!data) return undefined

  const entries = Object.entries(data).filter((entry): entry is [string, UpdateDiagnosticValue] => isSafeValue(entry[1]))
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

export class UpdateDiagnostics {
  private readonly logDirectory: string
  private readonly activePath: string
  private readonly previousPath: string
  private readonly getVersion: () => string
  private readonly maxBytes: number
  private readonly onError: (error: unknown) => void
  private enabled = false
  private writeQueue: Promise<void> = Promise.resolve()

  constructor({ homeDir, getVersion, maxBytes = DEFAULT_MAX_BYTES, onError = (error) => console.error('Unable to write Yira update diagnostics:', error) }: UpdateDiagnosticsOptions) {
    this.logDirectory = join(homeDir, 'logs')
    this.activePath = join(this.logDirectory, 'updater.log')
    this.previousPath = join(this.logDirectory, 'updater.previous.log')
    this.getVersion = getVersion
    this.maxBytes = Math.max(1, Math.floor(maxBytes))
    this.onError = onError
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  isEnabled(): boolean {
    return this.enabled
  }

  record(event: UpdateDiagnosticEvent): Promise<void> {
    if (!this.enabled) return Promise.resolve()

    let line: string
    try {
      const data = sanitizeData(event.data)
      line = `${JSON.stringify({
        timestamp: new Date().toISOString(),
        event: event.event,
        version: this.getVersion(),
        ...(data ? { data } : {}),
      })}\n`
    } catch (error) {
      this.reportError(error)
      return Promise.resolve()
    }

    this.writeQueue = this.writeQueue
      .then(() => this.appendLine(line))
      .catch((error) => {
        this.reportError(error)
      })

    return this.writeQueue
  }

  private async appendLine(line: string): Promise<void> {
    await mkdir(this.logDirectory, { recursive: true })

    let activeSize = 0
    try {
      activeSize = (await stat(this.activePath)).size
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    if (activeSize > 0 && activeSize + Buffer.byteLength(line) > this.maxBytes) {
      await rm(this.previousPath, { force: true })
      await rename(this.activePath, this.previousPath)
    }

    await appendFile(this.activePath, line, 'utf8')
  }

  private reportError(error: unknown): void {
    try {
      this.onError(error)
    } catch {
      // Diagnostics must remain best-effort even when their error reporter fails.
    }
  }
}
