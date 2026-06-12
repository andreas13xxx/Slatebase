import { useState, useEffect, useCallback } from 'react'
import type { IApiClient } from '../api'
import { useTranslation, type TranslateFn } from '../i18n'

/** A single vault share entry as returned by the backend. */
export interface VaultShareEntry {
  vaultId: string
  userId: string
  username?: string
  displayName?: string
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
 */
export function VaultDeletionWorkflow({ apiClient, vaultId, onComplete }: VaultDeletionWorkflowProps) {
  const { t } = useTranslation()

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
        const body = await response.json().catch(() => ({ message: t('vaultDeletion.loadError') }))
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
      const message = err instanceof Error ? err.message : t('vaultDeletion.loadError')
      setError(message)
      setStep('error')
    }
  }, [vaultId, buildHeaders])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      const message = err instanceof Error ? err.message : (err as { message?: string })?.message ?? t('vaultDeletion.deleteError')
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
          const body = await response.json().catch(() => ({ message: t('vaultDeletion.revokeError') }))
          throw new Error(body.message || t('vaultDeletion.revokeShareError', { userId: share.userId }))
        }
      }

      // Now delete the vault
      await apiClient.deleteVault(vaultId)
      setStep('done')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : (err as { message?: string })?.message ?? t('vaultDeletion.deleteError')
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
      setTransferError(t('vaultDeletion.usernameRequired'))
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
          const body = await response.json().catch(() => ({ message: t('vaultDeletion.revokeError') }))
          throw new Error(body.message || t('vaultDeletion.revokeShareError', { userId: share.userId }))
        }
      }

      // Transfer ownership
      const transferResponse = await fetch(`/api/v1/vaults/${vaultId}/transfer`, {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({ newOwnerId: trimmedUser }),
      })

      if (!transferResponse.ok) {
        const body = await transferResponse.json().catch(() => ({ message: t('vaultDeletion.transferError') }))
        throw new Error(mapTransferError(body.code, body.message, t))
      }

      setStep('done')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('vaultDeletion.transferError')
      setTransferError(message)
    } finally {
      setActionLoading(false)
    }
  }

  // --- Render ---

  if (step === 'loading') {
    return (
      <div className="vault-deletion-workflow" role="status" aria-live="polite">
        <p>{t('vaultDeletion.loading')}</p>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="vault-deletion-workflow" role="status" aria-live="polite">
        <p className="vault-deletion-success">{t('vaultDeletion.done')}</p>
        <button
          type="button"
          className="vault-deletion-btn vault-deletion-btn--primary"
          onClick={onComplete}
        >
          {t('vaultDeletion.close')}
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
            {t('vaultDeletion.retry')}
          </button>
          <button
            type="button"
            className="vault-deletion-btn"
            onClick={onComplete}
          >
            {t('vaultDeletion.cancel')}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'no-shares') {
    return (
      <div className="vault-deletion-workflow">
        <h3 className="vault-deletion-title">{t('vaultDeletion.title')}</h3>
        <p>{t('vaultDeletion.noSharesInfo')}</p>
        <p className="vault-deletion-warning" role="alert">
          {t('vaultDeletion.noSharesWarning')}
        </p>
        <div className="vault-deletion-actions">
          <button
            type="button"
            className="vault-deletion-btn vault-deletion-btn--danger"
            onClick={() => void handleSimpleDelete()}
            disabled={actionLoading}
          >
            {actionLoading ? t('vaultDeletion.deleting') : t('vaultDeletion.deleteVault')}
          </button>
          <button
            type="button"
            className="vault-deletion-btn"
            onClick={onComplete}
            disabled={actionLoading}
          >
            {t('vaultDeletion.cancel')}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'choose-action') {
    return (
      <div className="vault-deletion-workflow">
        <h3 className="vault-deletion-title">{t('vaultDeletion.title')}</h3>

        {hasWriteShares && (
          <p className="vault-deletion-warning" role="alert">
            {t('vaultDeletion.writeSharesWarning')}
          </p>
        )}

        <div className="vault-deletion-shares">
          <h4>{t('vaultDeletion.activeShares', { count: String(shares.length) })}</h4>
          <ul className="vault-deletion-share-list" aria-label={t('vaultDeletion.activeSharesAriaLabel')}>
            {shares.map((share) => (
              <li key={share.userId} className="vault-deletion-share-item">
                <span className="vault-deletion-share-user">{share.username ?? share.userId}</span>
                <span className="vault-deletion-share-permission">
                  {share.permission === 'write' ? t('vaultDeletion.permissionWrite') : t('vaultDeletion.permissionRead')}
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
            {t('vaultDeletion.forceDeleteBtn')}
          </button>
          <button
            type="button"
            className="vault-deletion-btn vault-deletion-btn--secondary"
            onClick={() => setStep('transfer')}
          >
            {t('vaultDeletion.transferBtn')}
          </button>
        </div>

        <button
          type="button"
          className="vault-deletion-btn vault-deletion-btn--cancel"
          onClick={onComplete}
        >
          {t('vaultDeletion.cancel')}
        </button>
      </div>
    )
  }

  if (step === 'confirm-force') {
    return (
      <div className="vault-deletion-workflow">
        <h3 className="vault-deletion-title">{t('vaultDeletion.confirmTitle')}</h3>

        {hasWriteShares && (
          <p className="vault-deletion-warning" role="alert">
            {t('vaultDeletion.confirmWriteWarning')}
          </p>
        )}

        <p>
          {t('vaultDeletion.confirmInfo', { count: String(shares.length) })}
        </p>

        <div className="vault-deletion-actions">
          <button
            type="button"
            className="vault-deletion-btn vault-deletion-btn--danger"
            onClick={() => void handleForceDelete()}
            disabled={actionLoading}
          >
            {actionLoading ? t('vaultDeletion.deleting') : t('vaultDeletion.confirmDelete')}
          </button>
          <button
            type="button"
            className="vault-deletion-btn"
            onClick={() => setStep('choose-action')}
            disabled={actionLoading}
          >
            {t('vaultDeletion.back')}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'transfer') {
    return (
      <div className="vault-deletion-workflow">
        <h3 className="vault-deletion-title">{t('vaultDeletion.transferTitle')}</h3>

        <p>
          {t('vaultDeletion.transferInfo')}
        </p>

        <div className="vault-deletion-transfer-form">
          <label htmlFor="vault-deletion-target-user">{t('vaultDeletion.newOwnerLabel')}</label>
          <input
            id="vault-deletion-target-user"
            className="vault-deletion-input"
            type="text"
            value={targetUser}
            onChange={(e) => {
              setTargetUser(e.target.value)
              if (transferError) setTransferError(null)
            }}
            placeholder={t('vaultDeletion.newOwnerPlaceholder')}
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
            {actionLoading ? t('vaultDeletion.transferring') : t('vaultDeletion.transfer')}
          </button>
          <button
            type="button"
            className="vault-deletion-btn"
            onClick={() => setStep('choose-action')}
            disabled={actionLoading}
          >
            {t('vaultDeletion.back')}
          </button>
        </div>
      </div>
    )
  }

  // Fallback (should not be reached)
  return null
}

/**
 * Maps backend error codes from the transfer endpoint to user-friendly messages via i18n.
 */
function mapTransferError(code: string | undefined, fallbackMessage: string, t: TranslateFn): string {
  switch (code) {
    case 'SHARES_NOT_REVOKED':
      return t('vaultDeletion.errorSharesNotRevoked')
    case 'VAULT_NOT_FOUND':
      return t('vaultDeletion.errorVaultNotFound')
    case 'ACCESS_DENIED':
      return t('vaultDeletion.errorAccessDenied')
    case 'VALIDATION_ERROR':
      if (fallbackMessage.includes('newOwnerId')) {
        return t('vaultDeletion.errorUserNotFound')
      }
      return fallbackMessage
    case 'USER_NOT_FOUND':
      return t('vaultDeletion.errorUserNotFound')
    default:
      return fallbackMessage || t('vaultDeletion.transferError')
  }
}
