import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-markdown-preview/markdown.css'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Components } from 'react-markdown'
import privacyPolicy from '../../../../docs/legal/PRIVACY.md?raw'
import termsOfUse from '../../../../docs/legal/TERMS.md?raw'
import { safeMarkdownPreviewOptions } from '@/utils/markdownPlugins'
import { safeMarkdownUrl } from '@/utils/markdownPreview'

export type LegalDocumentId = 'privacy' | 'terms'

interface LegalDocumentsProps {
  documentId: LegalDocumentId
  onBack: () => void
}

const LEGAL_DOCUMENT_SOURCES: Record<LegalDocumentId, string> = {
  privacy: privacyPolicy,
  terms: termsOfUse,
}

export function LegalDocuments({ documentId, onBack }: LegalDocumentsProps): React.ReactElement {
  const { t } = useTranslation()
  const backButtonRef = useRef<HTMLButtonElement>(null)
  const [linkError, setLinkError] = useState(false)
  const source = LEGAL_DOCUMENT_SOURCES[documentId]
  const title = documentId === 'privacy' ? t('settings.privacyPolicy') : t('settings.termsOfUse')
  const colorMode = document.documentElement.classList.contains('light') ? 'light' : 'dark'

  useEffect(() => {
    backButtonRef.current?.focus()
    setLinkError(false)
  }, [documentId])

  const activateLink = useCallback((href: string) => {
    const safeHref = safeMarkdownUrl(href)
    if (!safeHref) return

    const protocol = safeHref.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase()
    if (protocol !== 'http' && protocol !== 'https') return

    setLinkError(false)
    void window.electron.shell.openExternal(safeHref).catch(() => {
      setLinkError(true)
    })
  }, [])

  const components = useMemo<Components>(() => ({
    a: ({ href = '', children, node: _node, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) => (
      <a
        {...props}
        href={safeMarkdownUrl(href)}
        onClick={(event) => {
          event.preventDefault()
          activateLink(href)
        }}
      >
        {children}
      </a>
    ),
  }), [activateLink])

  return (
    <section aria-labelledby="legal-document-title" className="min-h-full">
      <div className="mb-5 flex items-start gap-3">
        <button
          ref={backButtonRef}
          type="button"
          className="mt-0.5 inline-flex shrink-0 items-center gap-2 rounded-full border border-border-visible px-3 py-2 text-sm text-text-secondary transition-colors hover:border-text-secondary hover:text-text-display focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--interactive)]"
          onClick={onBack}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          <span>{t('settings.backToAbout')}</span>
        </button>
        <div>
          <div className="nd-label text-text-secondary">{t('settings.legalDocuments')}</div>
          <h3 id="legal-document-title" className="mt-1 text-xl text-text-display">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-text-secondary">{t('settings.legalDocumentEnglish')}</p>
        </div>
      </div>

      {linkError && (
        <p role="alert" className="mb-3 text-sm leading-6 text-text-secondary">{t('settings.legalDocumentLinkError')}</p>
      )}

      <div lang="en" className="rounded-[20px] border border-border-visible bg-bg-primary px-2 py-2" style={{ overflowWrap: 'anywhere' }}>
        <MDEditor.Markdown
          {...safeMarkdownPreviewOptions}
          source={source}
          className="min-h-full bg-transparent p-6 text-text-primary"
          wrapperElement={{ 'data-color-mode': colorMode }}
          urlTransform={safeMarkdownUrl}
          components={components}
        />
      </div>
    </section>
  )
}
