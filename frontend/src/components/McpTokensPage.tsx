import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '../i18n'
import type { IApiClient, McpTokenInfo, McpTokenCreateResult } from '../api'
import { Key, Plus, Trash2, Copy, AlertTriangle } from 'lucide-react'
import { ConfirmModal } from './ConfirmModal'

/** Props for the McpTokensPage component. */
export interface McpTokensPageProps {
  /** API client instance for making token requests. */
  apiClient: IApiClient
}

/**
 * MCP API Token management page.
 * Allows users to create, list, and revoke API tokens for MCP access.
 */
export function McpTokensPage({ apiClient }: McpTokensPageProps) {
  const { t } = useTranslation()

  // State
  const [tokens, setTokens] = useState<McpTokenInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create form state
  const [name, setName] = useState('')
  const [expiryDays, setExpiryDays] = useState(90)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Newly created token (shown once)
  const [newToken, setNewToken] = useState<McpTokenCreateResult | null>(null)
  const [copied, setCopied] = useState(false)

  // Revoke confirmation
  const [revokeTarget, setRevokeTarget] = useState<McpTokenInfo | null>(null)
  const [revoking, setRevoking] = useState(false)

  // Load tokens
  const loadTokens = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiClient.listMcpTokens()
      setTokens(result)
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? (err as { message: string }).message : t('mcpTokens.loadError')
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [apiClient, t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTokens()
  }, [loadTokens])

  // Create token
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)

    // Validate
    const trimmedName = name.trim()
    if (!trimmedName) {
      setCreateError(t('mcpTokens.nameRequired'))
      return
    }
    if (trimmedName.length > 64) {
      setCreateError(t('mcpTokens.nameTooLong'))
      return
    }
    if (!Number.isInteger(expiryDays) || expiryDays < 7 || expiryDays > 365) {
      setCreateError(t('mcpTokens.expiryInvalid'))
      return
    }

    setCreating(true)
    try {
      const result = await apiClient.createMcpToken(trimmedName, expiryDays)
      setNewToken(result)
      setName('')
      setExpiryDays(90)
      await loadTokens()
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? (err as { message: string }).message : t('mcpTokens.createError')
      setCreateError(message)
    } finally {
      setCreating(false)
    }
  }

  // Copy token to clipboard
  const handleCopy = async () => {
    if (!newToken) return
    try {
      await navigator.clipboard.writeText(newToken.token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select text in the input
    }
  }

  // Close token dialog
  const handleCloseTokenDialog = () => {
    setNewToken(null)
    setCopied(false)
  }

  // Revoke token
  const handleRevoke = async () => {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      await apiClient.revokeMcpToken(revokeTarget.tokenId)
      setRevokeTarget(null)
      await loadTokens()
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? (err as { message: string }).message : t('mcpTokens.revokeError')
      setError(message)
      setRevokeTarget(null)
    } finally {
      setRevoking(false)
    }
  }

  // Format date for display
  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const activeTokenCount = tokens.filter(t => t.status === 'active').length
  const limitReached = activeTokenCount >= 10

  return (
    <div className="mcp-tokens-page">
      <div className="admin-config-card">
        <h2><Key size={18} /> {t('mcpTokens.title')}</h2>
        <p className="mcp-tokens-description">{t('mcpTokens.description')}</p>
      </div>

      {/* Create Token Form */}
      <div className="admin-config-card">
        <h3>{t('mcpTokens.createTitle')}</h3>
        {limitReached && (
          <p className="mcp-tokens-limit-warning">
            <AlertTriangle size={14} /> {t('mcpTokens.limitReached')}
          </p>
        )}
        <form onSubmit={handleCreate} className="mcp-tokens-form">
          <div className="mcp-tokens-form-row">
            <label htmlFor="token-name">{t('mcpTokens.nameLabel')}</label>
            <input
              id="token-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('mcpTokens.namePlaceholder')}
              maxLength={64}
              disabled={creating || limitReached}
            />
          </div>
          <div className="mcp-tokens-form-row">
            <label htmlFor="token-expiry">{t('mcpTokens.expiryLabel')}</label>
            <input
              id="token-expiry"
              type="number"
              value={expiryDays}
              onChange={e => setExpiryDays(Number(e.target.value))}
              min={7}
              max={365}
              disabled={creating || limitReached}
            />
            <span className="mcp-tokens-hint">{t('mcpTokens.expiryHint')}</span>
          </div>
          {createError && <p className="mcp-tokens-error">{createError}</p>}
          <button type="submit" className="btn-primary" disabled={creating || limitReached}>
            <Plus size={14} />
            {creating ? t('mcpTokens.creating') : t('mcpTokens.create')}
          </button>
        </form>
      </div>

      {/* New Token Display (shown once after creation) */}
      {newToken && (
        <div className="admin-config-card mcp-tokens-new-token">
          <h3>{t('mcpTokens.createSuccess')}</h3>
          <p className="mcp-tokens-token-warning">
            <AlertTriangle size={14} /> {t('mcpTokens.tokenWarning')}
          </p>
          <div className="mcp-tokens-token-display">
            <code className="mcp-tokens-token-value">{newToken.token}</code>
            <button onClick={handleCopy} className="btn-secondary" title={t('mcpTokens.copyToken')}>
              <Copy size={14} />
              {copied ? t('mcpTokens.tokenCopied') : t('mcpTokens.copyToken')}
            </button>
          </div>
          <button onClick={handleCloseTokenDialog} className="btn-secondary mcp-tokens-close-btn">
            {t('mcpTokens.closeTokenDialog')}
          </button>
        </div>
      )}

      {/* Token List */}
      <div className="admin-config-card">
        <h3>{t('mcpTokens.title')}</h3>
        {loading && <p>{t('mcpTokens.loading')}</p>}
        {error && <p className="mcp-tokens-error">{error}</p>}
        {!loading && !error && tokens.length === 0 && (
          <p className="mcp-tokens-empty">{t('mcpTokens.empty')}</p>
        )}
        {!loading && tokens.length > 0 && (
          <div className="mcp-tokens-table-wrapper">
            <table className="mcp-tokens-table">
              <thead>
                <tr>
                  <th>{t('mcpTokens.tableNameHeader')}</th>
                  <th>{t('mcpTokens.tableStatusHeader')}</th>
                  <th>{t('mcpTokens.tableCreatedHeader')}</th>
                  <th>{t('mcpTokens.tableExpiresHeader')}</th>
                  <th>{t('mcpTokens.tableLastUsedHeader')}</th>
                  <th>{t('mcpTokens.tableActionsHeader')}</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map(token => (
                  <tr key={token.tokenId} className={token.status !== 'active' ? 'mcp-tokens-inactive' : ''}>
                    <td className="mcp-tokens-name-cell">
                      <Key size={12} />
                      <span>{token.name}</span>
                      <code className="mcp-tokens-masked">{token.maskedToken}</code>
                    </td>
                    <td>
                      <span className={`mcp-tokens-status mcp-tokens-status-${token.status}`}>
                        {t(`mcpTokens.status${token.status.charAt(0).toUpperCase() + token.status.slice(1)}` as 'mcpTokens.statusActive')}
                      </span>
                    </td>
                    <td>{formatDate(token.createdAt)}</td>
                    <td>{formatDate(token.expiresAt)}</td>
                    <td>{token.lastUsedAt ? formatDate(token.lastUsedAt) : t('mcpTokens.neverUsed')}</td>
                    <td>
                      {token.status === 'active' && (
                        <button
                          onClick={() => setRevokeTarget(token)}
                          className="btn-danger-small"
                          title={t('mcpTokens.revoke')}
                        >
                          <Trash2 size={12} />
                          {t('mcpTokens.revoke')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Revoke Confirmation Modal */}
      {revokeTarget && (
        <ConfirmModal
          open={true}
          title={t('mcpTokens.revokeConfirmTitle')}
          message={t('mcpTokens.revokeConfirmMessage', { name: revokeTarget.name })}
          confirmLabel={revoking ? t('mcpTokens.revoking') : t('mcpTokens.revoke')}
          cancelLabel={t('common.cancel')}
          variant="danger"
          onConfirm={handleRevoke}
          onCancel={() => setRevokeTarget(null)}
        />
      )}
    </div>
  )
}
