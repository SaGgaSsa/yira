import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, Globe, RefreshCw } from 'lucide-react'
import { useSettingsStore } from '@/store/settingsStore'
import type { TileState } from '@shared/types'

interface BrowserTileProps {
  tile: TileState
  onUpdate: (patch: Partial<TileState>) => void
}

interface WebviewElement extends HTMLElement {
  canGoBack: () => boolean
  canGoForward: () => boolean
  goBack: () => void
  goForward: () => void
  reload: () => void
  loadURL: (url: string) => void
  src: string
}

function normalizeUrl(raw: string): string {
  const value = raw.trim()
  if (!value) return 'https://example.com'
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)) return value
  return `https://${value}`
}

export function BrowserTile({ tile, onUpdate }: BrowserTileProps): React.ReactElement {
  const homeUrl = useSettingsStore((s) => s.browser.homeUrl)
  const initialUrl = useMemo(() => normalizeUrl(tile.browserUrl ?? homeUrl), [tile.browserUrl, homeUrl])
  const webviewRef = useRef<WebviewElement | null>(null)
  const [inputUrl, setInputUrl] = useState(initialUrl)
  const [currentUrl, setCurrentUrl] = useState(initialUrl)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)

  useEffect(() => {
    if (!tile.browserUrl) {
      onUpdate({ browserUrl: initialUrl })
    }
  }, [tile.browserUrl, initialUrl, onUpdate])

  useEffect(() => {
    setInputUrl(currentUrl)
  }, [currentUrl])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const syncState = () => {
      const nextUrl = webview.src || currentUrl
      setCurrentUrl(nextUrl)
      setInputUrl(nextUrl)
      setCanGoBack(webview.canGoBack?.() ?? false)
      setCanGoForward(webview.canGoForward?.() ?? false)
      if (tile.browserUrl !== nextUrl) {
        onUpdate({ browserUrl: nextUrl })
      }
    }

    const handleNavigate = () => syncState()
    webview.addEventListener('did-navigate', handleNavigate as EventListener)
    webview.addEventListener('did-navigate-in-page', handleNavigate as EventListener)
    webview.addEventListener('dom-ready', handleNavigate as EventListener)
    return () => {
      webview.removeEventListener('did-navigate', handleNavigate as EventListener)
      webview.removeEventListener('did-navigate-in-page', handleNavigate as EventListener)
      webview.removeEventListener('dom-ready', handleNavigate as EventListener)
    }
  }, [currentUrl, onUpdate, tile.browserUrl])

  const navigate = (target: string) => {
    const nextUrl = normalizeUrl(target)
    setCurrentUrl(nextUrl)
    setInputUrl(nextUrl)
    onUpdate({ browserUrl: nextUrl })
    webviewRef.current?.loadURL(nextUrl)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-primary">
      <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
        <button
          className="flex h-7 w-7 items-center justify-center rounded text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary disabled:opacity-40"
          onClick={() => webviewRef.current?.goBack()}
          disabled={!canGoBack}
          title="Back"
        >
          <ArrowLeft size={14} />
        </button>
        <button
          className="flex h-7 w-7 items-center justify-center rounded text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary disabled:opacity-40"
          onClick={() => webviewRef.current?.goForward()}
          disabled={!canGoForward}
          title="Forward"
        >
          <ArrowRight size={14} />
        </button>
        <button
          className="flex h-7 w-7 items-center justify-center rounded text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
          onClick={() => webviewRef.current?.reload()}
          title="Reload"
        >
          <RefreshCw size={14} />
        </button>

        <form
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-bg-secondary px-2"
          onSubmit={(event) => {
            event.preventDefault()
            navigate(inputUrl)
          }}
        >
          <Globe size={14} className="shrink-0 text-text-muted" />
          <input
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-text-primary outline-none"
            value={inputUrl}
            onChange={(event) => setInputUrl(event.target.value)}
            spellCheck={false}
          />
        </form>

        <button
          className="flex h-7 w-7 items-center justify-center rounded text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
          onClick={() => void window.electron.shell.openExternal(currentUrl)}
          title="Open externally"
        >
          <ExternalLink size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        <webview
          ref={(node) => { webviewRef.current = node as WebviewElement | null }}
          src={currentUrl}
          className="h-full w-full"
          allowpopups={false}
        />
      </div>
    </div>
  )
}
