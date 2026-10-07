import React from 'react'
import { AlertTriangle, Copy, RotateCcw } from 'lucide-react'
import { i18n } from '../i18n'

interface AppErrorBoundaryProps {
  children: React.ReactNode
  /** Test seam: replaces the page reload used by the recovery button. */
  onReload?: () => void
}

interface AppErrorBoundaryState {
  error: Error | null
  componentStack: string | null
}

/** Builds the copyable detail without file contents or user data beyond the stack. */
export function formatAppErrorDetail(error: Error, componentStack: string | null): string {
  const lines = [`${error.name}: ${error.message}`]
  if (error.stack) lines.push('', error.stack)
  if (componentStack) lines.push('', 'Component stack:', componentStack.trim())
  return lines.join('\n')
}

export function AppErrorFallback({
  error,
  componentStack,
  onReload,
}: {
  error: Error
  componentStack: string | null
  onReload: () => void
}): React.ReactElement {
  // The i18n instance may be the thing that failed; fall back to English copy.
  const t = (key: string, fallback: string): string => {
    try {
      return i18n.isInitialized ? i18n.t(key, { defaultValue: fallback }) : fallback
    } catch {
      return fallback
    }
  }
  const detail = formatAppErrorDetail(error, componentStack)

  const copyDetail = (): void => {
    void navigator.clipboard?.writeText(detail).catch(() => undefined)
  }

  return (
    <div
      role="alert"
      className="flex h-screen w-screen items-center justify-center bg-bg-primary p-6 text-text-primary"
    >
      <div className="flex w-full max-w-xl flex-col gap-4 rounded-lg border border-border-visible bg-bg-secondary p-6">
        <div className="flex items-center gap-2 text-text-display">
          <AlertTriangle size={18} className="text-warning" aria-hidden="true" />
          <h1 className="text-base font-medium">{t('app.crashTitle', 'Something went wrong')}</h1>
        </div>
        <p className="text-sm text-text-secondary">
          {t('app.crashDescription', 'The window hit an unexpected error. Terminals and agents keep running in the background; reloading the window reconnects to them.')}
        </p>
        <details className="text-xs text-text-secondary">
          <summary className="cursor-pointer select-none">{t('app.crashDetails', 'Error details')}</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-bg-primary p-3 font-mono text-[11px]">
            {detail}
          </pre>
        </details>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
            onClick={copyDetail}
          >
            <Copy size={14} aria-hidden="true" />
            {t('app.crashCopy', 'Copy details')}
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-text-primary px-3 text-sm text-text-inverse transition-opacity hover:opacity-90"
            onClick={onReload}
          >
            <RotateCcw size={14} aria-hidden="true" />
            {t('app.crashReload', 'Reload window')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Keeps a render error from leaving the whole window blank. */
export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null, componentStack: null }

  static getDerivedStateFromError(error: unknown): Partial<AppErrorBoundaryState> {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? null })
    console.error('Renderer error caught by AppErrorBoundary', error, info.componentStack)
  }

  private reload = (): void => {
    if (this.props.onReload) this.props.onReload()
    else window.location.reload()
  }

  render(): React.ReactNode {
    const { error, componentStack } = this.state
    if (!error) return this.props.children
    return <AppErrorFallback error={error} componentStack={componentStack} onReload={this.reload} />
  }
}
