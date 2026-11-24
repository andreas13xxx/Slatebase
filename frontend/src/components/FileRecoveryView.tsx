import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '../i18n'
import type { IApiClient } from '../api'
import { extractErrorMessage } from '../utils/error'
import { VersionBrowser } from './VersionBrowser'
import './FileRecoveryView.css'

/** Props for the FileRecoveryView component. */
export interface FileRecoveryViewProps {
  vaultId: string
  /** Vault path of the file whose versions are shown. */
  filePath: string
  apiClient: IApiClient
  /** Called with the restored content, so open tabs of the file can follow. */
  onRestored: (content: string) => void
}

/**
 * Tab content of Obsidian's `file-recovery` view: the version browser for one file, as a tab
 * instead of the dialog. Loads the file's current content (the browser diffs against it) and
 * reloads it after a restore.
 */
export function FileRecoveryView({ vaultId, filePath, apiClient, onRestored }: FileRecoveryViewProps) {
  const { t } = useTranslation()
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<string | null> => {
    try {
      const result = await apiClient.fetchFileContent(vaultId, filePath)
      setContent(result.content)
      setError(null)
      return result.content
    } catch (err) {
      // A failed read says nothing about the file: show it, keep what was loaded before.
      setError(extractErrorMessage(err, ''))
      return null
    }
  }, [apiClient, vaultId, filePath])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const result = await apiClient.fetchFileContent(vaultId, filePath)
        if (cancelled) return
        setContent(result.content)
        setError(null)
      } catch (err) {
        if (!cancelled) setError(extractErrorMessage(err, ''))
      }
    })()
    return () => { cancelled = true }
  }, [apiClient, vaultId, filePath])

  const handleRestore = useCallback(() => {
    void load().then((restored) => {
      if (restored !== null) onRestored(restored)
    })
  }, [load, onRestored])

  return (
    <div className="tab-content tab-content--file-recovery" role="tabpanel" aria-label={t('viewTabs.recovery.panelLabel')}>
      {error !== null && content === null ? (
        <p role="alert">{t('viewTabs.recovery.loadError', { error })}</p>
      ) : content === null ? (
        <p role="status" aria-live="polite">{t('viewTabs.recovery.loading')}</p>
      ) : (
        <VersionBrowser
          vaultId={vaultId}
          filePath={filePath}
          currentContent={content}
          apiClient={apiClient}
          onRestore={handleRestore}
        />
      )}
    </div>
  )
}
