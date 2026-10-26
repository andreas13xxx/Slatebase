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
import './PublicSharesSection.css'

/**
 * Settings section "Öffentliche Links": every public link the user created, across all vaults,
 * with the option to revoke it. New links are created from a note's context menu.
 */
export function PublicSharesSection({ apiClient }: { apiClient: IApiClient }) {
  const { state } = useAppContext()
  const [shares, setShares] = useState<PublicShareSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingRevoke, setPendingRevoke] = useState<PublicShareSummary | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setShares(await apiClient.listMyPublicShares())
    } catch (err) {
      setError(extractErrorMessage(err, 'Die Links konnten nicht geladen werden.'))
    }
  }, [apiClient])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load on mount
    void load()
  }, [load])

  const vaultName = (vaultId: string): string => state.vaults.find((v) => v.id === vaultId)?.name ?? 'Unbekannter Vault'

  const confirmRevoke = async (): Promise<void> => {
    const share = pendingRevoke
    setPendingRevoke(null)
    if (share === null) return
    try {
      await apiClient.revokeMyPublicShare(share.id)
      showToast('success', 'Der Link wurde widerrufen.')
      notifyPublicSharesChanged()
      await load()
    } catch (err) {
      setError(extractErrorMessage(err, 'Der Link konnte nicht widerrufen werden.'))
    }
  }

  return (
    <SettingSection
      title="Öffentliche Links"
      description="Links, über die Personen ohne Konto eine Notiz lesen können. Neue Links erzeugst du im Kontextmenü einer Notiz („Öffentlichen Link verwalten“)."
    >
      {error !== null && <p role="alert">{error}</p>}
      {shares === null && error === null && <p role="status">Wird geladen…</p>}
      {shares !== null && shares.length === 0 && <p>Du hast noch keine öffentlichen Links erzeugt.</p>}
      {shares !== null && shares.length > 0 && (
        <table className="public-shares-table">
          <caption className="sr-only">Deine öffentlichen Links</caption>
          <thead>
            <tr>
              <th scope="col">Notiz</th>
              <th scope="col">Vault</th>
              <th scope="col">Erstellt</th>
              <th scope="col">Gültig bis</th>
              <th scope="col">Passwort</th>
              <th scope="col">Zuletzt abgerufen</th>
              <th scope="col"><span className="sr-only">Aktionen</span></th>
            </tr>
          </thead>
          <tbody>
            {shares.map((share) => (
              <tr key={share.id}>
                <th scope="row">{share.filePath}</th>
                <td>{vaultName(share.vaultId)}</td>
                <td>{formatShareDate(share.createdAt)}</td>
                <td>{share.expiresAt !== undefined ? formatShareDate(share.expiresAt) : 'unbegrenzt'}</td>
                <td>{share.passwordProtected ? 'ja' : 'nein'}</td>
                <td>{share.lastAccessAt !== undefined ? formatShareDate(share.lastAccessAt) : 'noch nie'}</td>
                <td>
                  <Button variant="danger" onClick={() => setPendingRevoke(share)} aria-label={`Link zu ${share.filePath} widerrufen`}>
                    Widerrufen
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ConfirmModal
        open={pendingRevoke !== null}
        title="Link widerrufen?"
        message={`Der Link zu „${pendingRevoke?.filePath ?? ''}“ funktioniert danach nicht mehr.`}
        confirmLabel="Widerrufen"
        onConfirm={() => { void confirmRevoke() }}
        onCancel={() => setPendingRevoke(null)}
      />
    </SettingSection>
  )
}
