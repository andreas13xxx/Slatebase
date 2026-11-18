import { useCallback, useEffect, useState } from 'react'
import type { IApiClient } from '../api'
import { useAppContext } from '../state'
import type { PublicShareSummary } from './types'
import { extractErrorMessage } from '../utils/error'
import { ConfirmModal } from '../components/ConfirmModal'
import { showToast } from '../components/ToastNotification'
import { SettingSection, Button } from '../components/settings/ui'
import { formatShareDate } from './publicShareFormat'
import { notifyPublicSharesChanged } from './publicShareEvents'
import { useTranslation } from '../i18n'
import './PublicSharesSection.css'

/**
 * Settings section "Öffentliche Links": every public link the user created, across all vaults,
 * with the option to revoke it. New links are created from a note's context menu.
 */
export function PublicSharesSection({ apiClient }: { apiClient: IApiClient }) {
  const { state } = useAppContext()
  const { t } = useTranslation()
  const [shares, setShares] = useState<PublicShareSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingRevoke, setPendingRevoke] = useState<PublicShareSummary | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setShares(await apiClient.listMyPublicShares())
    } catch (err) {
      setError(extractErrorMessage(err, t('publicShare.section.loadFailed')))
    }
  }, [apiClient, t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load on mount
    void load()
  }, [load])

  const vaultName = (vaultId: string): string => state.vaults.find((v) => v.id === vaultId)?.name ?? t('publicShare.section.unknownVault')

  const confirmRevoke = async (): Promise<void> => {
    const share = pendingRevoke
    setPendingRevoke(null)
    if (share === null) return
    try {
      await apiClient.revokeMyPublicShare(share.id)
      showToast('success', t('publicShare.section.revoked'))
      notifyPublicSharesChanged()
      await load()
    } catch (err) {
      setError(extractErrorMessage(err, t('publicShare.section.revokeFailed')))
    }
  }

  return (
    <SettingSection
      title={t('publicShare.section.title')}
      description={t('publicShare.section.description')}
    >
      {error !== null && <p role="alert">{error}</p>}
      {shares === null && error === null && <p role="status">{t('publicShare.loading')}</p>}
      {shares !== null && shares.length === 0 && <p>{t('publicShare.section.empty')}</p>}
      {shares !== null && shares.length > 0 && (
        <div className="table-scroll">
        <table className="public-shares-table data-table">
          <caption className="sr-only">{t('publicShare.section.caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('publicShare.section.note')}</th>
              <th scope="col">{t('publicShare.section.vault')}</th>
              <th scope="col">{t('publicShare.created')}</th>
              <th scope="col">{t('publicShare.validUntil')}</th>
              <th scope="col">{t('publicShare.password')}</th>
              <th scope="col">{t('publicShare.lastAccess')}</th>
              <th scope="col"><span className="sr-only">{t('publicShare.section.actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {shares.map((share) => (
              <tr key={share.id}>
                <th scope="row">{share.filePath}</th>
                <td>{vaultName(share.vaultId)}</td>
                <td>{formatShareDate(share.createdAt)}</td>
                <td>{share.expiresAt !== undefined ? formatShareDate(share.expiresAt) : t('publicShare.unlimited')}</td>
                <td>{share.passwordProtected ? t('publicShare.yes') : t('publicShare.no')}</td>
                <td>{share.lastAccessAt !== undefined ? formatShareDate(share.lastAccessAt) : t('publicShare.never')}</td>
                <td>
                  <Button variant="danger" onClick={() => setPendingRevoke(share)} aria-label={t('publicShare.section.revokeFor', { path: share.filePath })}>
                    {t('publicShare.revoke')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      <ConfirmModal
        open={pendingRevoke !== null}
        title={t('publicShare.section.confirmTitle')}
        message={t('publicShare.section.confirmMessage', { path: pendingRevoke?.filePath ?? '' })}
        confirmLabel={t('publicShare.revoke')}
        onConfirm={() => { void confirmRevoke() }}
        onCancel={() => setPendingRevoke(null)}
      />
    </SettingSection>
  )
}
