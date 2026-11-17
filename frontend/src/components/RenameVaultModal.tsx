import { useState, type FormEvent } from 'react'
import { useTranslation } from '../i18n'
import { useFocusTrap } from '../hooks/useFocusTrap'

export interface RenameVaultModalProps {
  /** Whether the dialog is visible. */
  open: boolean
  /** Current vault name, used as the initial value. */
  currentName: string
  /** Error message from the last attempt (e.g. name conflict). */
  error?: string | null
  /** Called with the trimmed new name. */
  onSubmit: (name: string) => void
  /** Called on cancel or Escape. */
  onCancel: () => void
}

/** Small dialog to rename a vault. Reuses the confirm-modal chrome. */
export function RenameVaultModal({ open, currentName, error, onSubmit, onCancel }: RenameVaultModalProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState(currentName)
  const containerRef = useFocusTrap<HTMLFormElement>({
    isActive: open,
    onEscape: onCancel,
    returnFocusOnDeactivate: true,
  })

  if (!open) return null

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (trimmed === '' || trimmed === currentName) {
      onCancel()
      return
    }
    onSubmit(trimmed)
  }

  return (
    <div className="confirm-modal-overlay" onClick={onCancel} role="presentation">
      <form
        ref={containerRef}
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-vault-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="confirm-modal-header">
          <h2 id="rename-vault-title" className="confirm-modal-title">{t('vault.renameVault')}</h2>
        </div>
        <input
          type="text"
          className="file-explorer-create-vault-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={128}
          aria-label={t('vault.vaultNameLabel')}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
        />
        {error && <p className="file-explorer-create-vault-error" role="alert">{error}</p>}
        <div className="confirm-modal-actions">
          <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="confirm-modal-btn confirm-modal-btn--primary">
            {t('common.save')}
          </button>
        </div>
      </form>
    </div>
  )
}
