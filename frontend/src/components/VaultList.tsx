import { useState, useRef, useEffect } from 'react'
import { useAppContext, createVault, deleteVault } from '../state'

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
  const [isOpen, setIsOpen] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newVaultName, setNewVaultName] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
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
      setValidationError('Vault-Name darf nicht leer sein')
      return
    }
    if (trimmed.length > MAX_VAULT_NAME_LENGTH) {
      setValidationError(`Vault-Name darf maximal ${MAX_VAULT_NAME_LENGTH} Zeichen lang sein`)
      return
    }
    if (state.vaults.some((v) => v.name === trimmed)) {
      setValidationError(`Ein Vault mit dem Namen "${trimmed}" existiert bereits`)
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
    const confirmed = window.confirm(
      `Vault "${vaultName}" wirklich löschen? Alle Dateien werden unwiderruflich entfernt.`,
    )
    if (!confirmed) return
    if (!apiClient) return

    await deleteVault(dispatch, apiClient, vaultId)
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
        aria-label="Vault auswählen"
      >
        <span className="vault-dropdown-label">
          {selectedVault ? selectedVault.name : 'Vault auswählen…'}
        </span>
        <span className="vault-dropdown-chevron" aria-hidden="true">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="vault-dropdown-menu" role="listbox">
          {state.vaults.length === 0 ? (
            <p className="vault-dropdown-empty">Keine Vaults vorhanden</p>
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
                  </button>
                  <button
                    type="button"
                    className="vault-dropdown-item-delete"
                    aria-label={`Vault "${vault.name}" löschen`}
                    onClick={(e) => handleDelete(e, vault.id, vault.name)}
                  >
                    ×
                  </button>
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
                + Neuer Vault
              </button>
            ) : (
              <form className="vault-dropdown-create-form" onSubmit={handleCreateSubmit}>
                <input
                  type="text"
                  className="vault-dropdown-create-input"
                  placeholder="Vault-Name…"
                  value={newVaultName}
                  onChange={(e) => setNewVaultName(e.target.value)}
                  maxLength={MAX_VAULT_NAME_LENGTH}
                  aria-label="Vault-Name"
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
    </div>
  )
}
