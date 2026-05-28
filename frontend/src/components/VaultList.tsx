import { useState, useRef, useEffect } from 'react'
import { useAppContext, createVault, deleteVault, loadVaults } from '../state'
import { useTranslation } from '../i18n'
import { ChevronDown, ChevronUp, Plus, Trash2, Database, Eye, Pencil, RefreshCw, Users } from 'lucide-react'
import { ConfirmModal } from './ConfirmModal'
import { VaultDeletionWorkflow } from './VaultDeletionWorkflow'

/**
 * Maximum vault name length as defined in the spec.
 */
const MAX_VAULT_NAME_LENGTH = 128

/**
 * Renders a dropdown menu for vault selection, creation, and deletion.
 * The dropdown shows the currently selected vault name (or a placeholder).
 * Clicking opens a list of vaults with delete buttons and a create option.
 */
export function VaultList() {
  const { state, dispatch, apiClient } = useAppContext()
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newVaultName, setNewVaultName] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; vaultId: string; vaultName: string }>({
    open: false, vaultId: '', vaultName: '',
  })
  const [deletionWorkflow, setDeletionWorkflow] = useState<{ open: boolean; vaultId: string } | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedVault = state.vaults.find((v) => v.id === state.selectedVaultId)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setShowCreateForm(false)
        setValidationError(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSelect(vaultId: string) {
    dispatch({ type: 'VAULT_SELECTED', payload: vaultId })
    setIsOpen(false)
  }

  function handleShowCreateForm() {
    setShowCreateForm(true)
    setValidationError(null)
  }

  function handleCancelCreate() {
    setShowCreateForm(false)
    setNewVaultName('')
    setValidationError(null)
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault()

    const trimmed = newVaultName
    if (trimmed.length === 0 || trimmed.trim().length === 0) {
      setValidationError(t('vault.nameEmpty'))
      return
    }
    if (trimmed.length > MAX_VAULT_NAME_LENGTH) {
      setValidationError(t('vault.nameTooLong', { max: MAX_VAULT_NAME_LENGTH }))
      return
    }
    if (state.vaults.some((v) => v.name === trimmed)) {
      setValidationError(t('vault.nameExists', { name: trimmed }))
      return
    }

    if (!apiClient) return

    setValidationError(null)
    await createVault(dispatch, apiClient, trimmed)

    setNewVaultName('')
    setShowCreateForm(false)
  }

  async function handleDelete(e: React.MouseEvent, vaultId: string, vaultName: string) {
    e.stopPropagation()
    setDeleteConfirm({ open: true, vaultId, vaultName })
  }

  async function handleDeleteConfirmed() {
    const { vaultId } = deleteConfirm
    setDeleteConfirm({ open: false, vaultId: '', vaultName: '' })
    if (!apiClient) return

    try {
      await apiClient.deleteVault(vaultId)
      dispatch({ type: 'VAULT_DELETED', payload: vaultId })
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string }
      if (error.code === 'VAULT_HAS_ACTIVE_SHARES') {
        // Vault has active shares — open the guided deletion workflow
        setDeletionWorkflow({ open: true, vaultId })
      } else {
        // Fallback: use the standard error dispatch
        await deleteVault(dispatch, apiClient, vaultId)
      }
    }
  }

  function handleDeletionWorkflowComplete() {
    setDeletionWorkflow(null)
    if (apiClient) {
      void loadVaults(dispatch, apiClient)
    }
  }

  return (
    <div className="vault-dropdown" ref={dropdownRef}>
      {/* Dropdown trigger */}
      <button
        type="button"
        className="vault-dropdown-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={t('vault.selectAriaLabel')}
      >
        <span className="vault-dropdown-label">
          {selectedVault
            ? <>
                <Database size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />
                {selectedVault.name}
                {selectedVault.permission === 'read' && (
                  <span className="vault-status-icon vault-status-icon--read" title={t('vault.permissionRead')}>
                    <Eye size={12} />
                  </span>
                )}
                {(selectedVault.shareCount ?? 0) > 0 && (
                  <span className="vault-status-icon vault-status-icon--shared" title={t('vault.shared', { count: selectedVault.shareCount ?? 0 })}>
                    <Users size={12} />
                  </span>
                )}
                {selectedVault.syncEnabled && (
                  <span className="vault-status-icon vault-status-icon--sync" title={t('vault.syncActive')}>
                    <RefreshCw size={12} />
                  </span>
                )}
              </>
            : t('vault.select')}
        </span>
        <span className="vault-dropdown-chevron" aria-hidden="true">
          {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="vault-dropdown-menu" role="listbox">
          {state.vaults.length === 0 ? (
            <p className="vault-dropdown-empty">{t('vault.noVaults')}</p>
          ) : (
            <ul className="vault-dropdown-list">
              {state.vaults.map((vault) => (
                <li
                  key={vault.id}
                  className={`vault-dropdown-item${state.selectedVaultId === vault.id ? ' vault-dropdown-item--selected' : ''}`}
                  role="option"
                  aria-selected={state.selectedVaultId === vault.id}
                >
                  <button
                    type="button"
                    className="vault-dropdown-item-btn"
                    aria-label={`Vault: ${vault.name}`}
                    onClick={() => handleSelect(vault.id)}
                  >
                    {vault.name}
                    {vault.permission === 'read' && (
                      <span className="vault-permission-badge vault-permission-badge--read" title={t('vault.permissionRead')}>
                        <Eye size={11} />
                      </span>
                    )}
                    {vault.permission === 'write' && (
                      <span className="vault-permission-badge vault-permission-badge--write" title={t('vault.permissionWrite')}>
                        <Pencil size={11} />
                      </span>
                    )}
                    {vault.syncEnabled && (
                      <span className="vault-permission-badge vault-permission-badge--sync" title={t('vault.syncActive')}>
                        <RefreshCw size={11} />
                      </span>
                    )}
                    {(vault.shareCount ?? 0) > 0 && (
                      <span className="vault-permission-badge vault-permission-badge--shared" title={t('vault.shared', { count: vault.shareCount ?? 0 })}>
                        <Users size={11} />
                      </span>
                    )}
                  </button>
                  {(vault.permission === 'owner' || vault.permission === undefined) && (
                    <button
                      type="button"
                      className="vault-dropdown-item-delete"
                      aria-label={t('vault.deleteVaultAriaLabel', { name: vault.name })}
                      title={t('files.deleteTitle', { name: vault.name })}
                      onClick={(e) => handleDelete(e, vault.id, vault.name)}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Create vault section */}
          <div className="vault-dropdown-create">
            {!showCreateForm ? (
              <button
                type="button"
                className="vault-dropdown-create-btn"
                onClick={handleShowCreateForm}
              >
                <Plus size={13} /> {t('vault.newVault')}
              </button>
            ) : (
              <form className="vault-dropdown-create-form" onSubmit={handleCreateSubmit}>
                <input
                  type="text"
                  className="vault-dropdown-create-input"
                  placeholder={t('vault.vaultNamePlaceholder')}
                  value={newVaultName}
                  onChange={(e) => setNewVaultName(e.target.value)}
                  maxLength={MAX_VAULT_NAME_LENGTH}
                  aria-label={t('vault.vaultNameLabel')}
                  autoFocus
                />
                <div className="vault-dropdown-create-actions">
                  <button type="submit" className="vault-dropdown-create-submit">
                    OK
                  </button>
                  <button type="button" className="vault-dropdown-create-cancel" onClick={handleCancelCreate}>
                    ×
                  </button>
                </div>
                {validationError && (
                  <p className="vault-dropdown-create-error" role="alert">
                    {validationError}
                  </p>
                )}
              </form>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={deleteConfirm.open}
        title={t('vault.deleteVault')}
        message={t('vault.deleteConfirm', { name: deleteConfirm.vaultName })}
        confirmLabel={t('common.delete')}
        variant="danger"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteConfirm({ open: false, vaultId: '', vaultName: '' })}
      />

      {/* Vault Deletion Workflow (shown when vault has active shares) */}
      {deletionWorkflow?.open && apiClient && (
        <div className="vault-deletion-workflow-overlay">
          <div className="vault-deletion-workflow-modal">
            <VaultDeletionWorkflow
              apiClient={apiClient}
              vaultId={deletionWorkflow.vaultId}
              onComplete={handleDeletionWorkflowComplete}
            />
          </div>
        </div>
      )}
    </div>
  )
}
