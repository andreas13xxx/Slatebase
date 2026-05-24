import { useState, useEffect, useCallback, type FormEvent } from 'react'
import type { IApiClient } from '../api'

/** A single vault share entry as returned by the backend. */
export interface VaultShareEntry {
  vaultId: string
  userId: string
  permission: 'read' | 'write'
  grantedBy: string
  grantedAt: string
}

/** Props for the VaultSharing component. */
export interface VaultSharingProps {
  /** API client instance for making share requests. */
  apiClient: IApiClient
  /** The vault ID to manage shares for. */
  vaultId: string
}

/** Maximum number of shares allowed per vault. */
const MAX_SHARES = 20

/**
 * Vault sharing management component.
 * Displays current shares for an owned vault and provides controls
 * to add, revoke, and change permissions of shares.
 * UI labels are in German.
 */
export function VaultSharing({ apiClient, vaultId }: VaultSharingProps) {
  const [shares, setShares] = useState<VaultShareEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add share form state
  const [username, setUsername] = useState('')
  const [permission, setPermission] = useState<'read' | 'write'>('read')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  /**
   * Fetches the current shares for the vault from the backend.
   */
  const loadShares = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = apiClient.getToken()
      const csrfToken = apiClient.getCsrfToken()
      const headers: Record<string, string> = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken
      }

      const response = await fetch(`/api/v1/vaults/${vaultId}/shares`, {
        method: 'GET',
        headers,
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: 'Fehler beim Laden der Freigaben' }))
        throw new Error(body.message || `HTTP ${response.status}`)
      }

      const data: VaultShareEntry[] = await response.json()
      setShares(data)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Fehler beim Laden der Freigaben'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [apiClient, vaultId])

  useEffect(() => {
    void loadShares()
  }, [loadShares])

  /**
   * Handles adding a new share via the form.
   */
  async function handleAddShare(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setAddError(null)

    const trimmedUsername = username.trim()
    if (trimmedUsername === '') {
      setAddError('Benutzername darf nicht leer sein.')
      return
    }

    setAddLoading(true)
    try {
      const token = apiClient.getToken()
      const csrfToken = apiClient.getCsrfToken()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken
      }

      const response = await fetch(`/api/v1/vaults/${vaultId}/shares`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId: trimmedUsername, permission }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: 'Fehler beim Hinzufügen' }))
        throw new Error(mapShareError(body.code, body.message))
      }

      setUsername('')
      setPermission('read')
      await loadShares()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Fehler beim Hinzufügen der Freigabe'
      setAddError(message)
    } finally {
      setAddLoading(false)
    }
  }

  /**
   * Revokes a share for a specific user.
   */
  async function handleRevoke(targetUserId: string): Promise<void> {
    setError(null)
    try {
      const token = apiClient.getToken()
      const csrfToken = apiClient.getCsrfToken()
      const headers: Record<string, string> = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken
      }

      const response = await fetch(`/api/v1/vaults/${vaultId}/shares/${targetUserId}`, {
        method: 'DELETE',
        headers,
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: 'Fehler beim Widerrufen' }))
        throw new Error(body.message || 'Fehler beim Widerrufen der Freigabe')
      }

      await loadShares()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Fehler beim Widerrufen der Freigabe'
      setError(message)
    }
  }

  /**
   * Changes the permission level of an existing share.
   */
  async function handleChangePermission(targetUserId: string, newPermission: 'read' | 'write'): Promise<void> {
    setError(null)
    try {
      const token = apiClient.getToken()
      const csrfToken = apiClient.getCsrfToken()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken
      }

      const response = await fetch(`/api/v1/vaults/${vaultId}/shares/${targetUserId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ permission: newPermission }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: 'Fehler beim Ändern der Berechtigung' }))
        throw new Error(body.message || 'Fehler beim Ändern der Berechtigung')
      }

      await loadShares()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Fehler beim Ändern der Berechtigung'
      setError(message)
    }
  }

  const limitReached = shares.length >= MAX_SHARES

  if (loading) {
    return <div className="vault-sharing"><p>Laden…</p></div>
  }

  return (
    <div className="vault-sharing">
      <h2 className="vault-sharing-title">Freigaben</h2>

      {error && (
        <p className="vault-sharing-error" role="alert">{error}</p>
      )}

      {limitReached && (
        <p className="vault-sharing-limit" role="status">
          Maximale Anzahl erreicht (20)
        </p>
      )}

      {/* Share list */}
      {shares.length === 0 ? (
        <p className="vault-sharing-empty">Keine Freigaben vorhanden.</p>
      ) : (
        <ul className="vault-sharing-list" aria-label="Aktuelle Freigaben">
          {shares.map((share) => (
            <li key={share.userId} className="vault-sharing-item">
              <span className="vault-sharing-item-user">{share.userId}</span>
              <select
                className="vault-sharing-item-permission"
                value={share.permission}
                onChange={(e) => {
                  const newPerm = e.target.value as 'read' | 'write'
                  if (newPerm !== share.permission) {
                    void handleChangePermission(share.userId, newPerm)
                  }
                }}
                aria-label={`Berechtigung für ${share.userId}`}
              >
                <option value="read">Lesen</option>
                <option value="write">Schreiben</option>
              </select>
              <button
                className="vault-sharing-item-revoke"
                type="button"
                onClick={() => void handleRevoke(share.userId)}
                aria-label={`Freigabe für ${share.userId} widerrufen`}
              >
                Widerrufen
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add share form */}
      {!limitReached && (
        <form className="vault-sharing-form" onSubmit={handleAddShare} noValidate>
          <h3 className="vault-sharing-form-title">Freigabe hinzufügen</h3>

          <div className="vault-sharing-form-fields">
            <div className="vault-sharing-form-field">
              <label htmlFor="vault-sharing-username">Benutzername</label>
              <input
                id="vault-sharing-username"
                className="vault-sharing-input"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  if (addError) setAddError(null)
                }}
                placeholder="Benutzername"
                aria-invalid={addError !== null}
                aria-describedby={addError ? 'vault-sharing-add-error' : undefined}
              />
            </div>

            <div className="vault-sharing-form-field">
              <label htmlFor="vault-sharing-permission">Berechtigung</label>
              <select
                id="vault-sharing-permission"
                className="vault-sharing-select"
                value={permission}
                onChange={(e) => setPermission(e.target.value as 'read' | 'write')}
              >
                <option value="read">Lesen</option>
                <option value="write">Schreiben</option>
              </select>
            </div>

            <button
              type="submit"
              className="vault-sharing-add-btn"
              disabled={addLoading}
            >
              {addLoading ? 'Hinzufügen…' : 'Hinzufügen'}
            </button>
          </div>

          {addError && (
            <p id="vault-sharing-add-error" className="vault-sharing-error" role="alert">
              {addError}
            </p>
          )}
        </form>
      )}
    </div>
  )
}

/**
 * Maps backend error codes to user-friendly German messages.
 */
function mapShareError(code: string | undefined, fallbackMessage: string): string {
  switch (code) {
    case 'INVALID_SHARE_TARGET':
      if (fallbackMessage.includes('self')) {
        return 'Sie können einen Vault nicht mit sich selbst teilen.'
      }
      if (fallbackMessage.includes('not found') || fallbackMessage.includes('does not exist')) {
        return 'Benutzer nicht gefunden.'
      }
      return fallbackMessage
    case 'SHARE_LIMIT_REACHED':
      return 'Maximale Anzahl an Freigaben erreicht (20).'
    case 'VALIDATION_ERROR':
      return fallbackMessage
    default:
      return fallbackMessage || 'Fehler beim Hinzufügen der Freigabe.'
  }
}
