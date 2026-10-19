import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, X } from 'lucide-react'
import { useUpdateStore } from '@/store/updateStore'

export function UpdateBanner(): React.ReactElement | null {
  const { t } = useTranslation()
  const updateStatus = useUpdateStore((s) => s.status)
  const updateAvailableVersion = useUpdateStore((s) => s.availableVersion)
  const updateProgressPercent = useUpdateStore((s) => s.progressPercent)
  const updateMessage = useUpdateStore((s) => s.message)
  const installUpdate = useUpdateStore((s) => s.installUpdate)
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null)

  const currentUpdateBannerKey = updateStatus === 'downloaded'
    ? `downloaded:${updateAvailableVersion ?? 'ready'}`
    : `progress:${updateAvailableVersion ?? updateStatus}`
  const showUpdateBanner =
    (updateStatus === 'available' || updateStatus === 'downloading' || updateStatus === 'downloaded') &&
    dismissedUpdateVersion !== currentUpdateBannerKey

  const updateBannerCopy = (() => {
    if (updateStatus === 'downloaded') {
      return {
        title: t('ui.updateReady', { version: updateAvailableVersion ?? '' }),
        message: t('ui.restartUpdateMessage'),
      }
    }

    if (updateStatus === 'downloading') {
      return {
        title: updateAvailableVersion
          ? t('ui.downloadingUpdate', { version: updateAvailableVersion })
          : t('ui.downloadingUpdateUnknown'),
        message: updateProgressPercent !== null
          ? t('ui.updateProgress', { percent: updateProgressPercent })
          : t('ui.downloadingUpdateMessage'),
      }
    }

    return {
      title: updateAvailableVersion
        ? t('ui.updateFound', { version: updateAvailableVersion })
        : t('ui.updateFoundUnknown'),
      message: updateMessage ?? t('update.downloading'),
    }
  })()

  if (!showUpdateBanner) return null

  return (
    <div className="border-b border-border bg-bg-secondary px-6 py-3">
      <div className="flex items-center justify-between gap-4 rounded-[20px] border border-border-visible bg-bg-tertiary px-4 py-3">
        <div className="min-w-0">
          <div className="nd-label text-text-secondary">{t('ui.updates')}</div>
          <div className="mt-1 text-sm text-text-display">{updateBannerCopy.title}</div>
          <div className="mt-1 text-sm text-text-secondary">{updateBannerCopy.message}</div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {updateStatus === 'downloaded' && (
            <button
              className="inline-flex items-center gap-2 rounded-full border border-text-display px-4 py-2 text-sm text-text-display transition-colors hover:bg-bg-secondary"
              onClick={() => {
                void installUpdate()
              }}
            >
              <Download size={14} />
              <span>{t('update.restartToInstall')}</span>
            </button>
          )}

          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:text-text-display"
            onClick={() => setDismissedUpdateVersion(currentUpdateBannerKey)}
            title={t('ui.dismissUpdateBanner')}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
