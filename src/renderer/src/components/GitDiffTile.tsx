import React, { useCallback, useEffect, useState } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { Columns2, RefreshCw, Rows2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { GitFileDiffContent, TileState } from '@shared/types'
import { fileLanguage } from '@/utils/fileEditorState'
import { useSettingsStore } from '@/store/settingsStore'
import { defineYiraThemes } from './FilesTile'

interface GitDiffTileProps {
  tile: TileState
  workspaceId: string
  isVisible: boolean
  onOpenFile?: (path: string) => void | Promise<void>
}

export function GitDiffTile({ tile, workspaceId, isVisible, onOpenFile }: GitDiffTileProps): React.ReactElement {
  const { t } = useTranslation()
  const themeId = useSettingsStore((state) => state.themeId)
  const appearance = useSettingsStore((state) => state.appearance)
  const material = useSettingsStore((state) => state.activeWindowBackgroundMaterial)
  const [lightTheme, setLightTheme] = useState(() => document.documentElement.classList.contains('light'))
  const [inline, setInline] = useState(false)
  const [loading, setLoading] = useState(false)
  const [content, setContent] = useState<GitFileDiffContent | null>(null)
  const [request, setRequest] = useState(0)
  const diff = tile.fileDiff

  useEffect(() => {
    const update = () => setLightTheme(document.documentElement.classList.contains('light'))
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [appearance])

  const refresh = useCallback(() => setRequest((value) => value + 1), [])
  useEffect(() => {
    if (!diff || !isVisible) return
    let current = true
    setLoading(true)
    setContent(null)
    void window.electron.git.fileDiff(workspaceId, diff.repositoryPath, diff.path, diff.staged, diff.originalPath)
      .then((result) => { if (current) setContent(result) })
      .catch((error: unknown) => { if (current) setContent({ original: '', modified: '', error: error instanceof Error ? error.message : String(error) }) })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [diff?.repositoryPath, diff?.path, diff?.originalPath, diff?.staged, isVisible, request, workspaceId])

  const filePath = tile.filePath ?? ''
  const editorTheme = `${themeId === 'default' ? (lightTheme ? 'yira-light' : 'yira-dark') : `yira-${themeId}`}${material === 'none' ? '' : '-material'}`
  const hasModifiedFile = Boolean(content && !content.error && !content.binary && !content.tooLarge && content.modifiedExists !== false)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
        <button type="button" className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-text-secondary hover:bg-hover-bg" onClick={() => setInline((value) => !value)} title={inline ? t('files.diffSideBySide') : t('files.diffInline')}>
          {inline ? <Rows2 size={14} /> : <Columns2 size={14} />}{inline ? t('files.diffSideBySide') : t('files.diffInline')}
        </button>
        <button type="button" className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-text-secondary hover:bg-hover-bg" onClick={refresh} title={t('common.refresh')}><RefreshCw size={14} />{t('common.refresh')}</button>
        <button type="button" className="ml-auto rounded px-2 py-1 text-xs text-text-secondary hover:bg-hover-bg disabled:opacity-50" onClick={() => { if (filePath) void Promise.resolve(onOpenFile?.(filePath)).catch((error: unknown) => console.error('[GitDiffTile] Failed to open file:', error)) }} disabled={!hasModifiedFile}>{t('files.openDiffFile')}</button>
      </div>
      <div className="relative min-h-0 flex-1">
        {loading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-primary text-sm text-text-secondary">{t('files.diffLoading')}</div>}
        {content?.error && <div role="alert" className="p-4 text-sm text-red-300">{content.error}</div>}
        {content?.binary && <div className="p-4 text-sm text-text-secondary">{t('files.diffBinary')}</div>}
        {content?.tooLarge && <div className="p-4 text-sm text-text-secondary">{t('files.diffTooLarge')}</div>}
        {content && !content.error && !content.binary && !content.tooLarge && content.original === content.modified && <div className="p-4 text-sm text-text-secondary">{t('files.diffNoChanges')}</div>}
        {content && !content.error && !content.binary && !content.tooLarge && content.original !== content.modified && (
          <DiffEditor
            height="100%"
            original={content.original}
            modified={content.modified}
            language={fileLanguage(filePath)}
            theme={editorTheme}
            beforeMount={defineYiraThemes}
            options={{ readOnly: true, originalEditable: false, renderSideBySide: !inline, automaticLayout: true, minimap: { enabled: false }, scrollBeyondLastLine: false }}
          />
        )}
      </div>
    </div>
  )
}
