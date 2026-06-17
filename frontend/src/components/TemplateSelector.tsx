import { useState, useEffect, useRef, useCallback } from 'react'
import { FileText, Search } from 'lucide-react'
import type { IApiClient } from '../api'
import { showToast } from './ToastNotification'
import './TemplateSelector.css'

/**
 * Template entry returned by the API.
 */
interface TemplateEntry {
  /** Display name (filename without .md). */
  name: string
  /** Relative path within the template directory. */
  path: string
}

export interface TemplateSelectorProps {
  /** Whether the selector is open. */
  isOpen: boolean
  /** Called to close the selector. */
  onClose: () => void
  /** API client instance. */
  apiClient: IApiClient
  /** Vault ID to fetch templates from. */
  vaultId: string
  /** Target directory for new file (relative path, empty string for root). */
  targetDir: string
  /** Called after a file is successfully created. Receives the file path. */
  onFileCreated: (filePath: string, fileName: string) => void
}

/**
 * TemplateSelector — Two-step modal for creating a note from a template.
 *
 * Step 1: Show sorted template list for selection (with search filter).
 * Step 2: Prompt for the target filename.
 *
 * On Escape at any step, closes without side effects.
 * Shows info message if no templates are available.
 * Shows error message on filename conflict (409).
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 7.7
 */
export function TemplateSelector({
  isOpen,
  onClose,
  apiClient,
  vaultId,
  targetDir,
  onFileCreated,
}: TemplateSelectorProps) {
  const [step, setStep] = useState<'loading' | 'select' | 'filename'>('loading')
  const [templates, setTemplates] = useState<TemplateEntry[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateEntry | null>(null)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [fileName, setFileName] = useState('')
  const [fileNameError, setFileNameError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const fileNameInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Fetch templates when opened
  useEffect(() => {
    if (!isOpen) return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep('loading')
    setQuery('')
    setSelectedIndex(0)
    setSelectedTemplate(null)
    setFileName('')
    setFileNameError(null)
    setIsCreating(false)

    apiClient.listTemplates(vaultId).then(
      (result) => {
        if (result.templates.length === 0) {
          showToast('info', `Keine Vorlagen verfügbar. Erstellen Sie .md-Dateien im Verzeichnis "_templates/" Ihres Vaults.`)
          onClose()
          return
        }
        setTemplates(result.templates)
        setStep('select')
        requestAnimationFrame(() => {
          inputRef.current?.focus()
        })
      },
      (err) => {
        const message = err && typeof err === 'object' && 'message' in err
          ? (err as { message: string }).message
          : 'Vorlagen konnten nicht geladen werden'
        showToast('error', message)
        onClose()
      }
    )
  }, [isOpen, apiClient, vaultId, onClose])

  // Filter templates by query
  const filteredTemplates = filterTemplates(templates, query)

  // Clamp selectedIndex
  useEffect(() => {
    if (selectedIndex >= filteredTemplates.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIndex(Math.max(0, filteredTemplates.length - 1))
    }
  }, [filteredTemplates.length, selectedIndex])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selectedEl = listRef.current.querySelector('[aria-selected="true"]')
    if (selectedEl && typeof selectedEl.scrollIntoView === 'function') {
      selectedEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const handleSelectTemplate = useCallback((template: TemplateEntry) => {
    setSelectedTemplate(template)
    setStep('filename')
    setFileName('')
    setFileNameError(null)
    requestAnimationFrame(() => {
      fileNameInputRef.current?.focus()
    })
  }, [])

  const handleCreateFile = useCallback(async () => {
    if (!selectedTemplate || !fileName.trim()) return
    if (isCreating) return

    const trimmedName = fileName.trim()

    // Basic validation
    if (trimmedName.length > 255) {
      setFileNameError('Dateiname darf maximal 255 Zeichen lang sein')
      return
    }
    if (/[<>:"/\\|?*]/.test(trimmedName) || /[\x00-\x1f]/.test(trimmedName)) { // eslint-disable-line no-control-regex
      setFileNameError('Dateiname enthält ungültige Zeichen')
      return
    }

    setIsCreating(true)
    setFileNameError(null)

    try {
      const result = await apiClient.createFromTemplate(
        vaultId,
        selectedTemplate.name,
        targetDir,
        trimmedName
      )
      onFileCreated(result.path, trimmedName)
      onClose()
    } catch (err) {
      const error = err as { code?: string; message?: string } | undefined
      if (error?.code === 'TEMPLATE_CONFLICT') {
        setFileNameError(`Eine Datei mit dem Namen "${trimmedName}" existiert bereits`)
      } else {
        const message = error?.message ?? 'Datei konnte nicht erstellt werden'
        setFileNameError(message)
      }
    } finally {
      setIsCreating(false)
    }
  }, [selectedTemplate, fileName, isCreating, apiClient, vaultId, targetDir, onFileCreated, onClose])

  const handleKeyDownSelect = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev =>
          prev < filteredTemplates.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev))
        break
      case 'Enter':
        e.preventDefault()
        if (filteredTemplates.length > 0) {
          const selected = filteredTemplates[selectedIndex]
          if (selected) {
            handleSelectTemplate(selected)
          }
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [filteredTemplates, selectedIndex, handleSelectTemplate, onClose])

  const handleKeyDownFileName = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault()
        void handleCreateFile()
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [handleCreateFile, onClose])

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])

  if (!isOpen || step === 'loading') return null

  return (
    <div
      className="template-selector-overlay"
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        className="template-selector"
        role="dialog"
        aria-modal="true"
        aria-label="Neue Notiz aus Vorlage"
      >
        {step === 'select' && (
          <>
            <div className="template-selector-header">
              <Search size={14} className="template-selector-search-icon" />
              <input
                ref={inputRef}
                type="text"
                className="template-selector-input"
                placeholder="Vorlage suchen…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setSelectedIndex(0)
                }}
                onKeyDown={handleKeyDownSelect}
                role="combobox"
                aria-expanded="true"
                aria-controls="template-selector-list"
                aria-activedescendant={
                  filteredTemplates.length > 0
                    ? `template-item-${selectedIndex}`
                    : undefined
                }
                aria-autocomplete="list"
              />
            </div>

            <ul
              ref={listRef}
              id="template-selector-list"
              className="template-selector-list"
              role="listbox"
              aria-label="Vorlagen"
            >
              {filteredTemplates.length === 0 ? (
                <li className="template-selector-empty" role="option" aria-selected={false}>
                  Keine Vorlagen gefunden
                </li>
              ) : (
                filteredTemplates.map((tmpl, index) => (
                  <li
                    key={tmpl.path}
                    id={`template-item-${index}`}
                    className={`template-selector-item${index === selectedIndex ? ' template-selector-item--selected' : ''}`}
                    role="option"
                    aria-selected={index === selectedIndex}
                    onClick={() => handleSelectTemplate(tmpl)}
                  >
                    <FileText size={14} className="template-selector-item-icon" />
                    <span className="template-selector-item-name">{tmpl.name}</span>
                  </li>
                ))
              )}
            </ul>
          </>
        )}

        {step === 'filename' && (
          <div className="template-selector-filename">
            <label className="template-selector-filename-label">
              Dateiname für neue Notiz (Vorlage: {selectedTemplate?.name})
            </label>
            <input
              ref={fileNameInputRef}
              type="text"
              className="template-selector-filename-input"
              placeholder="Dateiname (ohne .md)"
              value={fileName}
              onChange={(e) => {
                setFileName(e.target.value)
                setFileNameError(null)
              }}
              onKeyDown={handleKeyDownFileName}
              aria-label="Dateiname"
              aria-invalid={fileNameError ? 'true' : undefined}
              disabled={isCreating}
            />
            {fileNameError && (
              <p className="template-selector-filename-error" role="alert">
                {fileNameError}
              </p>
            )}
            <div className="template-selector-filename-actions">
              <button
                type="button"
                className="template-selector-btn template-selector-btn--primary"
                onClick={() => void handleCreateFile()}
                disabled={!fileName.trim() || isCreating}
              >
                {isCreating ? 'Erstelle…' : 'Erstellen'}
              </button>
              <button
                type="button"
                className="template-selector-btn template-selector-btn--secondary"
                onClick={onClose}
                disabled={isCreating}
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Filter templates by case-insensitive substring match on name.
 */
function filterTemplates(templates: TemplateEntry[], query: string): TemplateEntry[] {
  if (!query) return templates
  const lowerQuery = query.toLowerCase()
  return templates.filter(t => t.name.toLowerCase().includes(lowerQuery))
}
