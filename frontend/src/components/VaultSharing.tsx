import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react'
import type { IApiClient, UserSearchResult } from '../api'
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

/** Props for the VaultSharing component. */
export interface VaultSharingProps {
  /** API client instance for making share requests. */
  apiClient: IApiClient
  /** The vault ID to manage shares for. */
  vaultId: string
}

/** Maximum number of shares allowed per vault. */
const MAX_SHARES = 20

/** Debounce delay for user search in milliseconds. */
const SEARCH_DEBOUNCE_MS = 300

/**
 * Vault sharing management component.
 * Displays current shares for an owned vault and provides controls
 * to add, revoke, and change permissions of shares.
 * Includes username autocomplete when adding new shares.
 */
export function VaultSharing({ apiClient, vaultId }: VaultSharingProps) {
  const { t } = useTranslation()

  const [shares, setShares] = useState<VaultShareEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add share form state
  const [username, setUsername] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [permission, setPermission] = useState<'read' | 'write'>('read')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<UserSearchResult[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLUListElement>(null)

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
        const body = await response.json().catch(() => ({ message: t('sharing.loadError') }))
        throw new Error(body.message || `HTTP ${response.status}`)
      }

      const data: VaultShareEntry[] = await response.json()
      setShares(data)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('sharing.loadError')
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [apiClient, vaultId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadShares()
  }, [loadShares])

  /**
   * Searches for users matching the input prefix with debouncing.
   */
  const searchUsers = useCallback(async (query: string) => {
    if (query.trim().length === 0) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    try {
      const results = await apiClient.searchUsers(query.trim())
      setSuggestions(results)
      setShowSuggestions(results.length > 0)
      setActiveSuggestionIndex(-1)
    } catch {
      // Silently fail — autocomplete is a convenience feature
      setSuggestions([])
      setShowSuggestions(false)
    }
  }, [apiClient])

  /**
   * Handles username input changes with debounced search.
   */
  function handleUsernameChange(value: string): void {
    setUsername(value)
    setSelectedUserId(null)
    if (addError) setAddError(null)

    // Debounce the search
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      void searchUsers(value)
    }, SEARCH_DEBOUNCE_MS)
  }

  /**
   * Selects a user from the suggestions list.
   */
  function selectSuggestion(user: UserSearchResult): void {
    setUsername(user.username)
    setSelectedUserId(user.userId)
    setSuggestions([])
    setShowSuggestions(false)
    setActiveSuggestionIndex(-1)
  }

  /**
   * Handles keyboard navigation in the suggestions list.
   */
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (!showSuggestions || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveSuggestionIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveSuggestionIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      )
    } else if (e.key === 'Enter' && activeSuggestionIndex >= 0) {
      e.preventDefault()
      const selected = suggestions[activeSuggestionIndex]
      if (selected) {
        selectSuggestion(selected)
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setActiveSuggestionIndex(-1)
    }
  }

  /**
   * Closes suggestions when clicking outside.
   */
  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  /**
   * Cleanup debounce timer on unmount.
   */
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  /**
   * Handles adding a new share via the form.
   */
  async function handleAddShare(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setAddError(null)
    setShowSuggestions(false)

    const trimmedUsername = username.trim()
    if (trimmedUsername === '') {
      setAddError(t('sharing.usernameRequired'))
      return
    }

    // Use the selected userId if available, otherwise send the username
    const targetId = selectedUserId ?? trimmedUsername

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
        body: JSON.stringify({ userId: targetId, permission }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: t('sharing.addError') }))
        throw new Error(mapShareError(body.code, body.message, t))
      }

      setUsername('')
      setSelectedUserId(null)
      setPermission('read')
      await loadShares()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('sharing.addError')
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
        const body = await response.json().catch(() => ({ message: t('sharing.revokeError') }))
        throw new Error(body.message || t('sharing.revokeError'))
      }

      await loadShares()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('sharing.revokeError')
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
        const body = await response.json().catch(() => ({ message: t('sharing.changePermissionError') }))
        throw new Error(body.message || t('sharing.changePermissionError'))
      }

      await loadShares()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('sharing.changePermissionError')
      setError(message)
    }
  }

  const limitReached = shares.length >= MAX_SHARES

  if (loading) {
    return <div className="vault-sharing"><p>{t('sharing.loading')}</p></div>
  }

  return (
    <div className="vault-sharing">
      <h2 className="vault-sharing-title">{t('sharing.title')}</h2>

      {error && (
        <p className="vault-sharing-error" role="alert">{error}</p>
      )}

      {limitReached && (
        <p className="vault-sharing-limit" role="status">
          {t('sharing.limitReached')}
        </p>
      )}

      {/* Share list */}
      {shares.length === 0 ? (
        <p className="vault-sharing-empty">{t('sharing.empty')}</p>
      ) : (
        <ul className="vault-sharing-list" aria-label={t('sharing.listAriaLabel')}>
          {shares.map((share) => (
            <li key={share.userId} className="vault-sharing-item">
              <span className="vault-sharing-item-user">{share.username ?? share.userId}</span>
              <select
                className="vault-sharing-item-permission"
                value={share.permission}
                onChange={(e) => {
                  const newPerm = e.target.value as 'read' | 'write'
                  if (newPerm !== share.permission) {
                    void handleChangePermission(share.userId, newPerm)
                  }
                }}
                aria-label={t('sharing.permissionAriaLabel', { username: share.username ?? share.userId })}
              >
                <option value="read">{t('sharing.permissionRead')}</option>
                <option value="write">{t('sharing.permissionWrite')}</option>
              </select>
              <button
                className="vault-sharing-item-revoke"
                type="button"
                onClick={() => void handleRevoke(share.userId)}
                aria-label={t('sharing.revokeAriaLabel', { username: share.username ?? share.userId })}
              >
                {t('sharing.revoke')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add share form */}
      {!limitReached && (
        <form className="vault-sharing-form" onSubmit={handleAddShare} noValidate>
          <h3 className="vault-sharing-form-title">{t('sharing.addTitle')}</h3>

          <div className="vault-sharing-form-fields">
            <div className="vault-sharing-form-field vault-sharing-autocomplete">
              <label htmlFor="vault-sharing-username">{t('sharing.usernameLabel')}</label>
              <input
                ref={inputRef}
                id="vault-sharing-username"
                className="vault-sharing-input"
                type="text"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (suggestions.length > 0 && !selectedUserId) {
                    setShowSuggestions(true)
                  }
                }}
                placeholder={t('sharing.usernamePlaceholder')}
                autoComplete="off"
                role="combobox"
                aria-expanded={showSuggestions}
                aria-controls="vault-sharing-suggestions"
                aria-activedescendant={
                  activeSuggestionIndex >= 0
                    ? `vault-sharing-suggestion-${activeSuggestionIndex}`
                    : undefined
                }
                aria-invalid={addError !== null}
                aria-describedby={addError ? 'vault-sharing-add-error' : undefined}
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul
                  ref={suggestionsRef}
                  id="vault-sharing-suggestions"
                  className="vault-sharing-suggestions"
                  role="listbox"
                  aria-label={t('sharing.suggestionsAriaLabel')}
                >
                  {suggestions.map((user, index) => (
                    <li
                      key={user.userId}
                      id={`vault-sharing-suggestion-${index}`}
                      className={`vault-sharing-suggestion-item${index === activeSuggestionIndex ? ' active' : ''}`}
                      role="option"
                      aria-selected={index === activeSuggestionIndex}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        selectSuggestion(user)
                      }}
                    >
                      <span className="vault-sharing-suggestion-username">{user.username}</span>
                      {user.displayName && user.displayName !== user.username && (
                        <span className="vault-sharing-suggestion-display">{user.displayName}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="vault-sharing-form-field">
              <label htmlFor="vault-sharing-permission">{t('sharing.permissionLabel')}</label>
              <select
                id="vault-sharing-permission"
                className="vault-sharing-select"
                value={permission}
                onChange={(e) => setPermission(e.target.value as 'read' | 'write')}
              >
                <option value="read">{t('sharing.permissionRead')}</option>
                <option value="write">{t('sharing.permissionWrite')}</option>
              </select>
            </div>

            <button
              type="submit"
              className="vault-sharing-add-btn"
              disabled={addLoading}
            >
              {addLoading ? t('sharing.adding') : t('sharing.add')}
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
 * Maps backend error codes to user-friendly messages via i18n.
 */
function mapShareError(code: string | undefined, fallbackMessage: string, t: TranslateFn): string {
  switch (code) {
    case 'INVALID_SHARE_TARGET':
      if (fallbackMessage.includes('self')) {
        return t('sharing.errorSelfShare')
      }
      if (fallbackMessage.includes('not found') || fallbackMessage.includes('does not exist')) {
        return t('sharing.errorUserNotFound')
      }
      return fallbackMessage
    case 'SHARE_LIMIT_REACHED':
      return t('sharing.errorLimitReached')
    case 'VALIDATION_ERROR':
      return fallbackMessage
    default:
      return fallbackMessage || t('sharing.addError')
  }
}
