/**
 * ServerRestartSection — Restart server section for the unified settings panel.
 * Shows a warning about server restart and a button to trigger it with confirmation.
 *
 * @module components/settings/ServerRestartSection
 */

import { useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { ConfirmModal } from '../ConfirmModal'
import type { IApiClient } from '../../api'

/** Props for the ServerRestartSection component. */
export interface ServerRestartSectionProps {
  /** API client instance for making admin requests. */
  apiClient: IApiClient
}

/**
 * Builds auth headers for the restart request.
 */
function buildAuthHeaders(apiClient: IApiClient): Record<string, string> {
  const headers: Record<string, string> = {}
  const token = apiClient.getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const csrfToken = apiClient.getCsrfToken()
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }
  return headers
}

/**
 * Server restart section component.
 * Displays a warning and a button to restart the server with confirmation modal.
 */
export function ServerRestartSection({ apiClient }: ServerRestartSectionProps) {
  const { t } = useTranslation()

  const [isRestarting, setIsRestarting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleRestartConfirmed(): Promise<void> {
    setConfirmOpen(false)
    setMessage(null)
    setError(null)
    setIsRestarting(true)

    try {
      const response = await fetch('/api/v1/admin/restart', {
        method: 'POST',
        headers: buildAuthHeaders(apiClient),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: t('admin.config.restartError') }))
        throw new Error(body.message ?? `HTTP ${response.status}`)
      }
      setMessage(t('admin.config.restartSuccess'))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('admin.config.unknownError'))
    } finally {
      setIsRestarting(false)
    }
  }

  return (
    <div className="server-restart-section">
      <div className="admin-config-card admin-config-card--danger">
        <p className="admin-config-card-desc">
          <AlertTriangle size={15} /> {t('admin.config.dangerDesc')}
        </p>

        {message && <div className="admin-config-message admin-config-message--success">{message}</div>}
        {error && <div className="admin-config-message admin-config-message--error">{error}</div>}

        <button
          type="button"
          className="admin-config-btn admin-config-btn--danger"
          onClick={() => setConfirmOpen(true)}
          disabled={isRestarting}
        >
          <RefreshCw size={14} />
          {isRestarting ? t('admin.config.restarting') : t('admin.config.restart')}
        </button>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title={t('admin.config.restart')}
        message={t('admin.config.restartConfirm')}
        confirmLabel={t('admin.config.restart')}
        variant="danger"
        onConfirm={handleRestartConfirmed}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}
