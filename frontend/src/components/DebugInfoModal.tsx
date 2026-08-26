import { useState } from 'react'
import { InfoModal } from './InfoModal'
import { useVersionInfo } from '../hooks/useVersionInfo'
import { showToast } from './ToastNotification'
import { useTranslation } from '../i18n'

export interface DebugInfoModalProps {
  open: boolean
  onClose: () => void
  /** Name of the currently selected vault, or null when none is selected. */
  vaultName: string | null
}

/** `app:show-debug-info` — a modest diagnostics dump (version, browser, active vault). */
export function DebugInfoModal({ open, onClose, vaultName }: DebugInfoModalProps) {
  const { t } = useTranslation()
  const { installed, latest, latestUrl } = useVersionInfo()
  const [copied, setCopied] = useState(false)

  const rows: Array<[string, string]> = [
    [t('debugInfo.version'), installed ?? '—'],
    ...(latest ? [[t('debugInfo.latestVersion'), latest] as [string, string]] : []),
    [t('debugInfo.browser'), navigator.userAgent],
    [t('debugInfo.platform'), navigator.platform || '—'],
    [t('debugInfo.vault'), vaultName ?? t('debugInfo.noVault')],
  ]

  const handleCopy = async () => {
    const text = rows.map(([label, value]) => `${label}: ${value}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('error', t('debugInfo.copy'))
    }
  }

  return (
    <InfoModal open={open} title={t('debugInfo.title')} closeLabel={t('common.close')} onClose={onClose}>
      <div className="info-modal__debug-list">
        {rows.map(([label, value]) => (
          <div key={label} className="info-modal__debug-row">
            <span className="info-modal__debug-label">{label}</span>
            <span className="info-modal__debug-value">
              {label === t('debugInfo.latestVersion') && latestUrl ? (
                <a href={latestUrl} target="_blank" rel="noopener noreferrer">{value}</a>
              ) : (
                value
              )}
            </span>
          </div>
        ))}
      </div>
      <div className="info-modal__debug-actions">
        <button type="button" className="info-modal__debug-copy" onClick={() => void handleCopy()}>
          {copied ? t('debugInfo.copied') : t('debugInfo.copy')}
        </button>
      </div>
    </InfoModal>
  )
}
