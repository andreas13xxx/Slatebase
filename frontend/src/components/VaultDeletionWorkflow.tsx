import { useState, useEffect, useCallback } from 'react'
import type { IApiClient } from '../api'

/** A single vault share entry as returned by the backend. */
export interface VaultShareEntry {
  vaultId: string
  userId: string
  permission: 'read' | 'write'
  grantedBy: string
  grantedAt: string
}

/** Workflow step identifiers. */
type WorkflowStep = 'loading' | 'no-shares' | 'choose-action' | 'confirm-force' | 'transfer' | 'done' | 'error'

/** Props for the VaultDeletionWorkflow component. */
export interface VaultDeletionWorkflowProps {
  /** API client instance for making requests. */
  apiClient: IApiClient
  /** The vault ID to delete or transfer. */
  vaultId: string
  /** Callback invoked when the workflow completes (deletion or transfer succeeded, or user cancelled). */
  onComplete: () => void
}

/**
 * Guided workflow component for vault deletion with active shares.
 * Leads the user through the steps of deleting a vault or transferring ownership.
 *
 * Steps:
 * 1. Load current shares for the vault
 * 2. If no shares: simple delete confirmation
 * 3. If shares exist: present two options (force delete or transfer ownership)
 * 4. For force delete: confirm dialog, then call DELETE with force revocation
 * 5. For transfer: input target user, validate, call POST /vaults/:vaultId/transfer
 *
 * UI labels are in German.
 */
export function VaultDeletionWorkflow({ apiClient, vaultId, onComplete }: VaultDeletionWorkflowProps) {
  const [step, setStep] = useState<WorkflowStep>('loading')
  const [shares, setShares] = useState<VaultShareEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Transfer form state
  const [targetUser, setTargetUser] = useState('')
  const [transferError, setTransferError] = useState<string | null>(null)

  /** Whether any write-shared entries exist. */
  const hasWriteShares = shares.some((s) => s.permission === 'write')

  /**
   * Builds auth headers from the API client.
   */
  const buildHeaders = useCallback((includeJson: boolean): Record<string, string> => {
    const headers: Record<string, string> = {}
    const token = apiClient.getToken()
    const csrfToken = apiClient.getCsrfToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
    }
    if (includeJson) {
      headers['Content-Type'] = 'application/json'
    }
    return headers
  }, [apiClient])

  /**
   * Loads the current shares for the vault.
   */
  const loadShares = useCallback(async () => {
    setStep('loading')
    setError(null)
    try {
      const response = await fetch(`/api/v1/vaults/${vaultId}/shares`, {
        method: 'GET',
        headers: buildHeaders(false),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: 'Fehler beim Laden der Freigaben' }))
        throw new Error(body.message || `HTTP ${response.status}`)
      }

      const data: VaultShareEntry[] = await response.json()
      setShares(data)

      if (data.length === 0) {
        setStep('no-shares')
      } else {
        setStep('choose-action')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Fehler beim Laden der Freigaben'
      setError(message)
      setStep('error')
    }
  }, [vaultId, buildHeaders])

  useEffect(() => {
    void loadShares()
  }, [loadShares])

  /**
   * Handles simple vault deletion (no shares present).
   */
  async function handleSimpleDelete(): Promise<void> {
    setActionLoading(true)
    setError(null)
    try {
      await apiClient.deleteVault(vaultId)
      setStep('done')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Fehler beim Löschen'
      setError(message)
      setStep('error')
    } finally {
      setActionLoading(false)
    }
  }

  /**
   * Handles force deletion: revokes all shares then deletes the vault.
   * Calls each share revocation individually, then deletes the vault.
   */
  async function handleForceDelete(): Promise<void> {
    setActionLoading(true)
    setError(null)
    try {
      // Revoke all shares one by one
      for (const share of shares) {
        const response = await fetch(`/api/v1/vaults/${vaultId}/shares/${share.userId}`, {
          method: 'DELETE',
          headers: buildHeaders(false),
        })
        if (!response.ok) {
          const body = await response.json().catch(() => ({ message: 'Fehler beim Widerrufen' }))
          throw new Error(body.message || `Fehler beim Widerrufen der Freigabe für ${share.userId}`)
        }
      }

      // Now delete the vault
      await apiClient.deleteVault(vaultId)
      setStep('done')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Fehler beim Löschen'
      setError(message)
      setStep('error')
    } finally {
      setActionLoading(false)
    }
  }

  /**
   * Handles ownership transfer to the specified target user.
   * Precondition: all shares except to the target user must be revoked first.
   */
  async function handleTransfer(): Promise<void> {
    const trimmedUser = targetUser.trim()
    if (trimmedUser === '') {
      setTransferError('Benutzername darf nicht leer sein.')
      return
    }

    setActionLoading(true)
    setTransferError(null)
    setError(null)
    try {
      // Revoke all shares except to the target user
      const otherShares = shares.filter((s) => s.userId !== trimmedUser)
      for (const share of otherShares) {
        const response = await fetch(`/api/v1/vaults/${vaultId}/shares/${share.userId}`, {
          method: 'DELETE',
          headers: buildHeaders(false),
        })
        if (!response.ok) {
          const body = await response.json().catch(() => ({ message: 'Fehler beim Widerrufen' }))
          throw new Error(body.message || `Fehler beim Widerrufen der Freigabe für ${share.userId}`)
        }
      }

      // Transfer ownership
      const transferResponse = await fetch(`/api/v1/vaults/${vaultId}/transfer`, {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({ newOwnerId: trimmedUser }),
      })

      if (!transferResponse.ok) {
        const body = await transferResponse.json().catch(() => ({ message: 'Fehler bei der Übertragung' }))
        throw new Error(mapTransferError(body.code, body.message))
      }

      setStep('done')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Fehler bei der Besitzübertragung'
      setTransferError(message)
    } finally {
      setActionLoading(false)
    }
  }

  // --- Render ---

  if (step === 'loading') {
    return (
      <div className="vault-deletion-workflow" role="status" aria-live="polite">
        <p>Laden…</p>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="vault-deletion-workflow" role="status" aria-live="polite">
        <p className="vault-deletion-success">Vorgang abgeschlossen.</p>
        <button
          type="button"
          className="vault-deletion-btn vault-deletion-btn--primary"
          onClick={onComplete}
        >
          Schließen
        </button>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="vault-deletion-workflow">
        <p className="vault-deletion-error" role="alert">{error}</p>
        <div className="vault-deletion-actions">
          <button
            type="button"
            className="vault-deletion-btn"
            onClick={() => void loadShares()}
          >
            Erneut versuchen
          </button>
          <button
            type="button"
            className="vault-deletion-btn"
            onClick={onComplete}
          >
            Abbrechen
          </button>
        </div>
      </div>
    )
  }

  if (step === 'no-shares') {
    return (
      <div className="vault-deletion-workflow">
        <h3 className="vault-deletion-title">Vault löschen</h3>
        <p>Dieser Vault hat keine aktiven Freigaben. Möchten Sie ihn endgültig löschen?</p>
        <p className="vault-deletion-warning" role="alert">
          Alle Dateien werden unwiderruflich entfernt.
        </p>
        <div className="vault-deletion-actions">
          <button
            type="button"
            className="vault-deletion-btn vault-deletion-btn--danger"
            onClick={() => void handleSimpleDelete()}
            disabled={actionLoading}
          >
            {actionLoading ? 'Löschen…' : 'Vault löschen'}
          </button>
          <button
            type="button"
            className="vault-deletion-btn"
            onClick={onComplete}
            disabled={actionLoading}
          >
            Abbrechen
          </button>
        </div>
      </div>
    )
  }

  if (step === 'choose-action') {
    return (
      <div className="vault-deletion-workflow">
        <h3 className="vault-deletion-title">Vault löschen</h3>

        {hasWriteShares && (
          <p className="vault-deletion-warning" role="alert">
            Achtung: Dieser Vault hat aktive Schreibfreigaben. Andere Benutzer bearbeiten möglicherweise Inhalte.
          </p>
        )}

        <div className="vault-deletion-shares">
          <h4>Aktive Freigaben ({shares.length})</h4>
          <ul className="vault-deletion-share-list" aria-label="Aktive Freigaben">
            {shares.map((share) => (
              <li key={share.userId} className="vault-deletion-share-item">
                <span className="vault-deletion-share-user">{share.userId}</span>
                <span className="vault-deletion-share-permission">
                  {share.permission === 'write' ? 'Schreiben' : 'Lesen'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="vault-deletion-options">
          <button
            type="button"
            className="vault-deletion-btn vault-deletion-btn--danger"
            onClick={() => setStep('confirm-force')}
          >
            Alle Freigaben widerrufen und Vault löschen
          </button>
          <button
            type="button"
            className="vault-deletion-btn vault-deletion-btn--secondary"
            onClick={() => setStep('transfer')}
          >
            Besitz übertragen
          </button>
        </div>

        <button
          type="button"
          className="vault-deletion-btn vault-deletion-btn--cancel"
          onClick={onComplete}
        >
          Abbrechen
        </button>
      </div>
    )
  }

  if (step === 'confirm-force') {
    return (
      <div className="vault-deletion-workflow">
        <h3 className="vault-deletion-title">Löschung bestätigen</h3>

        {hasWriteShares && (
          <p className="vault-deletion-warning" role="alert">
            Warnung: Benutzer mit Schreibzugriff verlieren sofort den Zugang. Nicht gespeicherte Änderungen gehen verloren.
          </p>
        )}

        <p>
          Alle {shares.length} Freigabe(n) werden widerrufen und der Vault wird endgültig gelöscht.
          Dieser Vorgang kann nicht rückgängig gemacht werden.
        </p>

        <div className="vault-deletion-actions">
          <button
            type="button"
            className="vault-deletion-btn vault-deletion-btn--danger"
            onClick={() => void handleForceDelete()}
            disabled={actionLoading}
          >
            {actionLoading ? 'Löschen…' : 'Endgültig löschen'}
          </button>
          <button
            type="button"
            className="vault-deletion-btn"
            onClick={() => setStep('choose-action')}
            disabled={actionLoading}
          >
            Zurück
          </button>
        </div>
      </div>
    )
  }

  if (step === 'transfer') {
    return (
      <div className="vault-deletion-workflow">
        <h3 className="vault-deletion-title">Besitz übertragen</h3>

        <p>
          Geben Sie den Benutzernamen (User-ID) des neuen Besitzers ein.
          Alle anderen Freigaben werden automatisch widerrufen.
          Nach der Übertragung verlieren Sie jeglichen Zugriff auf diesen Vault.
        </p>

        <div className="vault-deletion-transfer-form">
          <label htmlFor="vault-deletion-target-user">Neuer Besitzer</label>
          <input
            id="vault-deletion-target-user"
            className="vault-deletion-input"
            type="text"
            value={targetUser}
            onChange={(e) => {
              setTargetUser(e.target.value)
              if (transferError) setTransferError(null)
            }}
            placeholder="Benutzer-ID"
            aria-invalid={transferError !== null}
            aria-describedby={transferError ? 'vault-deletion-transfer-error' : undefined}
            disabled={actionLoading}
          />

          {transferError && (
            <p id="vault-deletion-transfer-error" className="vault-deletion-error" role="alert">
              {transferError}
            </p>
          )}
        </div>

        <div className="vault-deletion-actions">
          <button
            type="button"
            className="vault-deletion-btn vault-deletion-btn--primary"
            onClick={() => void handleTransfer()}
            disabled={actionLoading || targetUser.trim() === ''}
          >
            {actionLoading ? 'Übertragen…' : 'Besitz übertragen'}
          </button>
          <button
            type="button"
            className="vault-deletion-btn"
            onClick={() => setStep('choose-action')}
            disabled={actionLoading}
          >
            Zurück
          </button>
        </div>
      </div>
    )
  }

  // Fallback (should not be reached)
  return null
}

/**
 * Maps backend error codes from the transfer endpoint to user-friendly German messages.
 */
function mapTransferError(code: string | undefined, fallbackMessage: string): string {
  switch (code) {
    case 'SHARES_NOT_REVOKED':
      return 'Es bestehen noch Freigaben an andere Benutzer. Bitte widerrufen Sie diese zuerst.'
    case 'VAULT_NOT_FOUND':
      return 'Vault nicht gefunden.'
    case 'ACCESS_DENIED':
      return 'Zugriff verweigert. Nur der Besitzer kann den Vault übertragen.'
    case 'VALIDATION_ERROR':
      if (fallbackMessage.includes('newOwnerId')) {
        return 'Benutzer nicht gefunden.'
      }
      return fallbackMessage
    case 'USER_NOT_FOUND':
      return 'Benutzer nicht gefunden.'
    default:
      return fallbackMessage || 'Fehler bei der Besitzübertragung.'
  }
}
