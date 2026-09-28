import { COLOR_PRESETS } from '@shared/appThemes'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { type Monaco } from '@monaco-editor/react'
import { AlertTriangle, Check, Code2, Columns2, Eye, RefreshCw, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TileState } from '@shared/types'
import { useSettingsStore } from '@/store/settingsStore'
import {
  applyExternalStat,
  applyFileRead,
  applyFileWrite,
  beginFileEdit,
  createFileEditorState,
  fileLanguage,
  type FileEditorState,
  type FileEditorTransition,
} from '@/utils/fileEditorState'
import { windowBufferRegistry } from '@/utils/windowBufferRegistry'
import { fileMarkdownLayout, isMarkdownFilePath, normalizeFileMarkdownViewMode } from '@/utils/fileMarkdown'
import { isImageFilePath } from '@/utils/fileImage'
import { ImageFilePreview } from './ImageFilePreview'
import { MarkdownPreviewPane } from './MarkdownPreviewPane'

const FILE_POLL_INTERVAL_MS = 2_000

interface FilesTileProps {
  tile: TileState
  rootPath: string
  isFocused: boolean
  isVisible: boolean
  onUpdate: (patch: Partial<TileState>) => void | Promise<void>
  onOpenFile?: (relativePath: string) => void | Promise<void>
  onOpenBrowser?: (url: string) => void
}

function defineYiraThemes(monaco: Monaco): void {
  const define = (
    name: string,
    base: 'vs-dark' | 'vs',
    rules: Parameters<Monaco['editor']['defineTheme']>[1]['rules'],
    colors: Record<string, string>,
  ) => {
    monaco.editor.defineTheme(name, { base, inherit: true, rules, colors })
    const translucentColors = Object.fromEntries(Object.entries(colors).map(([key, value]) => {
      const hex = /^#([\da-f]{6})$/i.exec(value)
      return [key, hex && ['editor.background', 'editorGutter.background', 'minimap.background', 'editorWidget.background'].includes(key)
        ? `#${hex[1]}99`
        : value]
    }))
    monaco.editor.defineTheme(`${name}-material`, { base, inherit: true, rules, colors: translucentColors })
  }
  for (const preset of Object.values(COLOR_PRESETS)) {
    define(`yira-${preset.id}`, 'vs-dark', [
      { token: 'comment', foreground: preset.tokens['--text-disabled'].slice(1) },
      { token: 'string', foreground: preset.terminal.green.slice(1) },
      { token: 'keyword', foreground: preset.terminal.magenta.slice(1) },
      { token: 'number', foreground: preset.terminal.yellow.slice(1) },
    ], {
      'editor.background': preset.tokens['--surface'],
      'editor.foreground': preset.tokens['--text-primary'],
      'editorLineNumber.foreground': preset.tokens['--text-disabled'],
      'editorLineNumber.activeForeground': preset.tokens['--text-display'],
      'editor.selectionBackground': preset.terminal.selectionBackground,
      'editor.inactiveSelectionBackground': preset.tokens['--surface-raised'],
      'editorCursor.foreground': preset.terminal.cursor,
      'editorWidget.background': preset.tokens['--surface-raised'],
      'editorWidget.border': preset.tokens['--border-visible'],
    })
  }
  define('yira-dark', 'vs-dark', [], {
    'editor.background': '#111111',
    'editor.foreground': '#e8e8e8',
    'editorLineNumber.foreground': '#666666',
    'editorLineNumber.activeForeground': '#ffffff',
    'editor.selectionBackground': '#333333',
    'editor.inactiveSelectionBackground': '#252525',
  })
  define('yira-light', 'vs', [], {
    'editor.background': '#ffffff',
    'editor.foreground': '#1a1a1a',
    'editorLineNumber.foreground': '#999999',
    'editorLineNumber.activeForeground': '#000000',
    'editor.selectionBackground': '#d6d6d6',
    'editor.inactiveSelectionBackground': '#ececec',
  })
}

function hasPatch(patch: Partial<TileState>): boolean {
  return Object.keys(patch).length > 0
}

export function FilesTile(props: FilesTileProps): React.ReactElement {
  const filePath = props.tile.filePath?.trim() ?? ''
  if (isImageFilePath(filePath)) {
    return (
      <ImageFilePreview
        key={`${props.rootPath}\u0000${filePath}`}
        rootPath={props.rootPath}
        relativePath={filePath}
        filePreview={props.tile.filePreview}
        isVisible={props.isVisible}
      />
    )
  }

  return <TextFileTile {...props} />
}

function TextFileTile({ tile, rootPath, isFocused, isVisible, onUpdate, onOpenFile, onOpenBrowser }: FilesTileProps): React.ReactElement {
  const { t } = useTranslation()
  const themeId = useSettingsStore((state) => state.themeId)
  const appearance = useSettingsStore((state) => state.appearance)
  const windowBackgroundMaterial = useSettingsStore((state) => state.windowBackgroundMaterial)
  const tileFontSizePx = useSettingsStore((state) => state.tileFontSizePx)
  const filePath = tile.filePath?.trim() ?? ''
  const [state, setState] = useState<FileEditorState>(() => createFileEditorState(tile))
  const [operationError, setOperationError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveConfirmed, setSaveConfirmed] = useState(false)
  const [lightTheme, setLightTheme] = useState(() => document.documentElement.classList.contains('light'))
  const stateRef = useRef(state)
  const readRequestRef = useRef(0)
  const savingRef = useRef(false)
  const onUpdateRef = useRef(onUpdate)
  const isMarkdown = isMarkdownFilePath(filePath)
  const markdownView = normalizeFileMarkdownViewMode(tile.fileMarkdownView)
  const markdownLayout = isMarkdown ? fileMarkdownLayout(markdownView) : { showEditor: true, showPreview: false }

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  useEffect(() => windowBufferRegistry.register(`file:${tile.id}`, async () => {
    const current = stateRef.current
    if (current.status !== 'ready') return
    await onUpdateRef.current({
      fileDraft: current.dirty ? current.draft : undefined,
      fileVersion: current.baseVersion,
      fileChangeToken: current.revision.metadataToken,
    })
  }), [tile.id])

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setLightTheme(document.documentElement.classList.contains('light'))
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    setLightTheme(document.documentElement.classList.contains('light'))
    return () => observer.disconnect()
  }, [appearance])

  const applyTransition = useCallback((transition: FileEditorTransition) => {
    stateRef.current = transition.state
    setState(transition.state)
    if (hasPatch(transition.patch)) onUpdate(transition.patch)
  }, [onUpdate])

  const readFile = useCallback(async (restorePersistedDraft: boolean) => {
    const requestId = ++readRequestRef.current
    if (!rootPath || !filePath) {
      const next: FileEditorState = {
        status: 'error',
        filePath,
        message: t('files.fileOperationFailed'),
      }
      stateRef.current = next
      setState(next)
      return
    }

    const loading = restorePersistedDraft
      ? createFileEditorState(tile)
      : createFileEditorState({ ...tile, fileDraft: undefined, fileVersion: undefined, fileChangeToken: undefined })
    stateRef.current = loading
    setState(loading)
    setOperationError(null)
    setSaveConfirmed(false)

    try {
      const result = await window.electron.files.read(rootPath, filePath)
      if (requestId !== readRequestRef.current) return
      applyTransition(applyFileRead(loading, result))
    } catch (error) {
      if (requestId !== readRequestRef.current) return
      const next: FileEditorState = {
        status: 'error',
        filePath,
        message: error instanceof Error ? error.message : t('files.fileOperationFailed'),
      }
      stateRef.current = next
      setState(next)
    }
  }, [applyTransition, filePath, rootPath, t, tile])

  useEffect(() => {
    void readFile(true)
    return () => {
      readRequestRef.current += 1
    }
  // A preview tile keeps its identity when another path replaces it; path/root are the lifecycle keys.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, rootPath])

  const reloadCleanFile = useCallback(async () => {
    const current = stateRef.current
    if (current.status !== 'ready' || current.dirty) return
    const requestId = ++readRequestRef.current
    try {
      const result = await window.electron.files.read(rootPath, filePath)
      if (requestId !== readRequestRef.current) return
      const latest = stateRef.current
      if (latest.status !== 'ready' || latest.dirty) return
      const loading = createFileEditorState({ ...tile, fileDraft: undefined, fileVersion: undefined, fileChangeToken: undefined })
      applyTransition(applyFileRead(loading, result))
    } catch (error) {
      if (requestId === readRequestRef.current) {
        setOperationError(error instanceof Error ? error.message : t('files.fileOperationFailed'))
      }
    }
  }, [applyTransition, filePath, rootPath, t, tile])

  useEffect(() => {
    if (!isVisible || !rootPath || !filePath) return
    let disposed = false
    let polling = false

    const poll = async () => {
      const current = stateRef.current
      if (polling || savingRef.current || current.status !== 'ready') return
      polling = true
      try {
        const result = await window.electron.files.stat(rootPath, filePath)
        if (disposed) return
        const latest = stateRef.current
        if (latest.status !== 'ready') return
        const transition = applyExternalStat(latest, result)
        if (transition.action === 'reload') {
          await reloadCleanFile()
        } else if (transition.state !== latest) {
          applyTransition(transition)
        }
      } catch (error) {
        if (!disposed) setOperationError(error instanceof Error ? error.message : t('files.fileOperationFailed'))
      } finally {
        polling = false
      }
    }

    const interval = window.setInterval(() => {
      void poll()
    }, FILE_POLL_INTERVAL_MS)
    return () => {
      disposed = true
      window.clearInterval(interval)
    }
  }, [applyTransition, filePath, isVisible, reloadCleanFile, rootPath, t])

  const saveFile = useCallback(async (force: boolean) => {
    const current = stateRef.current
    if (savingRef.current || current.status !== 'ready' || !current.dirty) return
    savingRef.current = true
    setSaving(true)
    setOperationError(null)
    setSaveConfirmed(false)
    try {
      const result = await window.electron.files.write(rootPath, filePath, {
        content: current.draft,
        expectedVersion: current.baseVersion,
        ...(force ? { force: true } : {}),
      })
      const latest = stateRef.current
      const transition = applyFileWrite(current, result, latest.status === 'ready' ? latest : current)
      applyTransition(transition)
      setSaveConfirmed(result.status === 'saved')
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : t('files.fileOperationFailed'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [applyTransition, filePath, rootPath, t])

  useEffect(() => {
    if (!isFocused || !isVisible) return
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      void saveFile(false)
    }
    window.addEventListener('keydown', handleSaveShortcut)
    return () => window.removeEventListener('keydown', handleSaveShortcut)
  }, [isFocused, isVisible, saveFile])

  const retry = () => {
    void readFile(true)
  }

  if (state.status !== 'ready') {
    const message = state.status === 'loading'
      ? t('common.loading')
      : state.status === 'missing'
        ? t('files.missing')
        : state.status === 'unsupported'
          ? `${t('files.unsupported')} ${state.reason}`
          : state.message

    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg-secondary px-8 text-center text-text-secondary">
        <div className="max-w-xl text-sm">{message}</div>
        {state.status !== 'loading' && (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-border-visible px-4 py-2 text-sm text-text-display hover:bg-hover-bg"
            onClick={retry}
          >
            <RefreshCw size={14} />
            {t('files.retry')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-secondary">
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-secondary" title={filePath}>{filePath}</span>
        {tile.filePreview && (
          <span className="nd-caption rounded-full border border-border-visible px-2 py-1 text-text-secondary">{t('files.temporary')}</span>
        )}
        {isMarkdown && (
          <div className="flex items-center gap-0.5 rounded-md border border-border-visible bg-bg-tertiary p-0.5">
            {([
              { mode: 'edit' as const, label: t('files.markdownEdit'), Icon: Code2 },
              { mode: 'live' as const, label: t('files.markdownSplit'), Icon: Columns2 },
              { mode: 'preview' as const, label: t('files.markdownPreview'), Icon: Eye },
            ]).map(({ mode, label, Icon }) => (
              <button
                key={mode}
                type="button"
                className={`inline-flex h-7 w-7 items-center justify-center rounded transition-colors ${markdownView === mode ? 'bg-active-bg text-text-display' : 'text-text-secondary hover:bg-hover-bg hover:text-text-display'}`}
                title={label}
                aria-label={label}
                aria-pressed={markdownView === mode}
                onClick={() => void onUpdate({ fileMarkdownView: mode })}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
        )}
        {state.conflict ? (
          <span className="inline-flex items-center gap-1 text-xs text-warning"><AlertTriangle size={13} />{t('files.conflict')}</span>
        ) : state.dirty ? (
          <span className="text-xs text-warning">{t('files.dirty')}</span>
        ) : saveConfirmed ? (
          <span className="inline-flex items-center gap-1 text-xs text-success"><Check size={13} />{t('files.saved')}</span>
        ) : null}
        {state.conflict && (
          <>
            <button
              type="button"
              className="rounded-full border border-border-visible px-3 py-1.5 text-xs text-text-display hover:bg-hover-bg"
              disabled={saving}
              onClick={() => void readFile(false)}
            >
              {t('files.reload')}
            </button>
            <button
              type="button"
              className="rounded-full border border-warning px-3 py-1.5 text-xs text-warning hover:bg-hover-bg"
              disabled={saving || state.diskMissing}
              onClick={() => void saveFile(true)}
            >
              {t('files.overwrite')}
            </button>
          </>
        )}
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-border-visible px-3 py-1.5 text-xs text-text-display hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-40"
          disabled={saving || !state.dirty || state.conflict}
          onClick={() => void saveFile(false)}
          title={`${t('common.save')} (Ctrl/Cmd+S)`}
        >
          <Save size={13} />
          {t('common.save')}
        </button>
      </div>
      {(operationError || state.diskMissing) && (
        <div className="shrink-0 border-b border-border bg-accent-subtle px-3 py-2 text-xs text-text-primary">
          {operationError ?? t('files.missing')}
        </div>
      )}
      <div className="flex min-h-0 flex-1" style={{ '--font-base': 'var(--tile-font-base)' } as React.CSSProperties}>
        {markdownLayout.showEditor && (
          <div className={`min-h-0 min-w-0 flex-1 ${markdownLayout.showPreview ? 'border-r border-border' : ''}`}>
            <Editor
              path={`file:///${filePath}`}
              language={fileLanguage(filePath)}
              value={state.draft}
              beforeMount={defineYiraThemes}
              theme={`${themeId === 'default' ? (lightTheme ? 'yira-light' : 'yira-dark') : `yira-${themeId}`}${windowBackgroundMaterial === 'none' ? '' : '-material'}`}
              onChange={(value) => {
                const current = stateRef.current
                if (current.status !== 'ready') return
                setSaveConfirmed(false)
                applyTransition(beginFileEdit(current, value ?? ''))
              }}
              options={{
                automaticLayout: true,
                fontFamily: "'IBM Plex Mono', 'Consolas', monospace",
                fontSize: tileFontSizePx,
                minimap: { enabled: false },
                padding: { top: 12, bottom: 12 },
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                tabSize: 2,
                readOnly: saving,
              }}
            />
          </div>
        )}
        {markdownLayout.showPreview && (
          <div className="min-h-0 min-w-0 flex-1">
            <MarkdownPreviewPane
              source={state.draft}
              colorMode={lightTheme ? 'light' : 'dark'}
              rootPath={rootPath}
              filePath={filePath}
              onOpenFile={onOpenFile}
              onOpenBrowser={onOpenBrowser}
            />
          </div>
        )}
      </div>
    </div>
  )
}
