/**
 * PropertiesEditor — interactive, typed frontmatter property editor.
 * Renders type-aware controls per property key based on the type registry
 * or inference from the actual value. Mounted inline inside the document
 * editor itself (see FrontmatterWidget in editor/live-preview/widget-decorations.ts)
 * — editing a document's frontmatter happens in the document, not the sidebar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import {
  TextPropertyControl,
  NumberPropertyControl,
  DatePropertyControl,
  CheckboxPropertyControl,
  ListPropertyControl,
} from './property-controls'
import { useCommitOnUnmount } from './property-controls/useCommitOnUnmount'
import type { PropertyType, PropertyTypeEntry } from '../../state/propertyTypes'
import { useTranslation } from '../../i18n'
import './property-controls/property-controls.css'
import './PropertiesEditor.css'

// ─── Props ───────────────────────────────────────────────────────────────────

export interface PropertiesEditorProps {
  /** Parsed frontmatter data, or null if no/empty frontmatter or parse error. */
  data: Record<string, unknown> | null
  /** Error message if YAML parsing failed. */
  parseError: string | null
  /** Raw frontmatter text (without delimiters), for error display. */
  rawFrontmatter: string | null
  /** Per-vault property type registry (may be null if not loaded yet). */
  typeRegistry: PropertyTypeEntry[] | null
  /** Callback to commit a property value change. */
  onCommit: (key: string, value: unknown) => void
  /** Callback to add a new property. */
  onAddProperty: (key: string, value: unknown) => void
  /** Callback to delete a property. */
  onDeleteProperty: (key: string) => void
  /** Callback to rename a property key, preserving its value and position. */
  onRenameProperty: (oldKey: string, newKey: string) => void
  /** Callback to explicitly set a property's type in the vault's type registry. */
  onTypeChange: (key: string, type: PropertyType) => void
  /** Tag suggestions for the tags property control. */
  tagSuggestions?: string[]
  /** Property key suggestions for the add-property autocomplete. */
  propertySuggestions?: string[]
  /** Whether a document is currently open. */
  hasDocument?: boolean
  /** Whether the file is a markdown file (non-md files show placeholder). */
  isMarkdown?: boolean
}

// ─── Type Inference ──────────────────────────────────────────────────────────

/**
 * Infers the property type from a value when no registry entry exists.
 */
function inferPropertyType(value: unknown): PropertyType {
  if (typeof value === 'boolean') return 'checkbox'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return 'datetime'
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date'
  }
  if (Array.isArray(value)) return 'list'
  return 'text'
}

/** All selectable property types, in the order shown in the type dropdown. */
const ALL_PROPERTY_TYPES: PropertyType[] = [
  'text',
  'number',
  'checkbox',
  'date',
  'datetime',
  'list',
  'tags',
  'aliases',
]

/**
 * Resolves the effective property type for a key.
 * Registry takes precedence, then inference from the value.
 */
function resolvePropertyType(
  key: string,
  value: unknown,
  registry: PropertyTypeEntry[] | null,
): PropertyType {
  if (registry) {
    const entry = registry.find((e) => e.key === key)
    if (entry) return entry.type
  }
  // Well-known keys
  if (key === 'tags') return 'tags'
  if (key === 'aliases') return 'aliases'
  return inferPropertyType(value)
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PropertiesEditor({
  data,
  parseError,
  rawFrontmatter,
  typeRegistry,
  onCommit,
  onAddProperty,
  onDeleteProperty,
  onRenameProperty,
  onTypeChange,
  tagSuggestions = [],
  propertySuggestions = [],
  hasDocument = true,
  isMarkdown = true,
}: PropertiesEditorProps) {
  const { t } = useTranslation()

  // Tracks the key of a property just created via "Add property", so its row
  // can open already in rename-edit mode — the generated placeholder key
  // ("property", "property-1", …) is never what the user actually wants.
  const [justAddedKey, setJustAddedKey] = useState<string | null>(null)

  const entries = useMemo(() => {
    if (!data) return []
    return Object.entries(data).filter(([, v]) => v !== undefined)
  }, [data])

  const handleAdd = useCallback((key: string, value: unknown) => {
    onAddProperty(key, value)
    setJustAddedKey(key)
  }, [onAddProperty])

  // ─── Non-editable states ───────────────────────────────────────────────────

  if (!hasDocument) {
    return (
      <div className="properties-editor properties-editor--empty">
        <p className="properties-editor__placeholder">
          {t('contextPanel.properties.noDocument')}
        </p>
      </div>
    )
  }

  if (!isMarkdown) {
    return (
      <div className="properties-editor properties-editor--empty">
        <p className="properties-editor__placeholder">
          {t('contextPanel.properties.notMarkdown')}
        </p>
      </div>
    )
  }

  if (parseError) {
    return (
      <div className="properties-editor properties-editor--error">
        <p className="properties-editor__error-message">
          {t('contextPanel.properties.parseError')}
        </p>
        {rawFrontmatter !== null && (
          <pre className="properties-editor__raw-frontmatter">{rawFrontmatter}</pre>
        )}
      </div>
    )
  }

  // ─── Editable state ────────────────────────────────────────────────────────

  return (
    <div className="properties-editor">
      {entries.length === 0 && !parseError && (
        <p className="properties-editor__placeholder">
          {t('contextPanel.properties.empty')}
        </p>
      )}

      {entries.length > 0 && (
        <div className="properties-editor__list">
          {entries.map(([key, value]) => (
            <PropertyRow
              key={key}
              propertyKey={key}
              value={value}
              type={resolvePropertyType(key, value, typeRegistry)}
              existingKeys={entries.filter(([k]) => k !== key).map(([k]) => k)}
              startInEditMode={key === justAddedKey}
              onEditModeExited={() => setJustAddedKey((prev) => (prev === key ? null : prev))}
              tagSuggestions={tagSuggestions}
              onCommit={onCommit}
              onDelete={onDeleteProperty}
              onRename={onRenameProperty}
              onTypeChange={onTypeChange}
            />
          ))}
        </div>
      )}

      <AddPropertyRow
        existingKeys={entries.map(([k]) => k)}
        suggestions={propertySuggestions}
        onAdd={handleAdd}
      />
    </div>
  )
}

// ─── PropertyRow ─────────────────────────────────────────────────────────────

interface PropertyRowProps {
  propertyKey: string
  value: unknown
  type: PropertyType
  /** Other properties' keys, for duplicate-name rejection on rename. */
  existingKeys: string[]
  /** Whether this row should open with the key already in rename-edit mode (just added). */
  startInEditMode: boolean
  /** Called once this row leaves rename-edit mode, however it got there. */
  onEditModeExited: () => void
  tagSuggestions: string[]
  onCommit: (key: string, value: unknown) => void
  onDelete: (key: string) => void
  onRename: (oldKey: string, newKey: string) => void
  onTypeChange: (key: string, type: PropertyType) => void
}

function PropertyRow({
  propertyKey,
  value,
  type,
  existingKeys,
  startInEditMode,
  onEditModeExited,
  tagSuggestions,
  onCommit,
  onDelete,
  onRename,
  onTypeChange,
}: PropertyRowProps) {
  const { t } = useTranslation()
  const [isEditingKey, setIsEditingKey] = useState(startInEditMode)
  const [draftKey, setDraftKey] = useState(propertyKey)
  const keyInputRef = useRef<HTMLInputElement>(null)
  // Whether the open rename has been resolved. A ref for the same reason as in
  // the value controls: committing rebuilds the properties editor, so the state
  // flag may not have re-rendered by the time this row unmounts. A row that
  // opens in rename mode (just added) starts out unresolved.
  const keyEditSettledRef = useRef(!startInEditMode)

  useEffect(() => {
    if (isEditingKey) {
      keyInputRef.current?.focus()
      keyInputRef.current?.select()
    }
  }, [isEditingKey])

  const handleChange = useCallback((newValue: unknown) => {
    onCommit(propertyKey, newValue)
  }, [propertyKey, onCommit])

  const handleDelete = useCallback(() => {
    onDelete(propertyKey)
  }, [propertyKey, onDelete])

  const handleTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onTypeChange(propertyKey, e.target.value as PropertyType)
  }, [propertyKey, onTypeChange])

  const startEditingKey = useCallback(() => {
    keyEditSettledRef.current = false
    setDraftKey(propertyKey)
    setIsEditingKey(true)
  }, [propertyKey])

  const commitKeyEdit = useCallback(() => {
    keyEditSettledRef.current = true
    const trimmed = draftKey.trim()
    if (trimmed !== '' && trimmed !== propertyKey && !existingKeys.includes(trimmed)) {
      onRename(propertyKey, trimmed)
    }
    setIsEditingKey(false)
    onEditModeExited()
  }, [draftKey, propertyKey, existingKeys, onRename, onEditModeExited])

  const cancelKeyEdit = useCallback(() => {
    keyEditSettledRef.current = true
    setDraftKey(propertyKey)
    setIsEditingKey(false)
    onEditModeExited()
  }, [propertyKey, onEditModeExited])

  // The key input commits on blur, and unmounting fires no blur — so an
  // in-progress rename would be dropped when the row goes away (a change to
  // another property, a tab switch, leaving Live Preview).
  useCommitOnUnmount(() => { if (!keyEditSettledRef.current) commitKeyEdit() })

  const handleKeyInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitKeyEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelKeyEdit()
    }
  }, [commitKeyEdit, cancelKeyEdit])

  return (
    <div className="properties-editor__row">
      {isEditingKey ? (
        <input
          ref={keyInputRef}
          type="text"
          className="properties-editor__key-input"
          value={draftKey}
          onChange={(e) => setDraftKey(e.target.value)}
          onBlur={commitKeyEdit}
          onKeyDown={handleKeyInputKeyDown}
          aria-label={t('contextPanel.properties.propertyNameAriaLabel')}
        />
      ) : (
        <button
          type="button"
          className="properties-editor__key"
          title={t('contextPanel.properties.renamePropertyTitle')}
          onClick={startEditingKey}
        >
          {propertyKey}
        </button>
      )}
      <div className="properties-editor__value">
        <PropertyValueControl
          type={type}
          value={value}
          onChange={handleChange}
          tagSuggestions={tagSuggestions}
        />
      </div>
      <select
        className="properties-editor__type-select"
        value={type}
        onChange={handleTypeChange}
        aria-label={t('contextPanel.properties.typeAriaLabel')}
        title={t('contextPanel.properties.typeAriaLabel')}
      >
        {ALL_PROPERTY_TYPES.map((option) => (
          <option key={option} value={option}>
            {t(`contextPanel.properties.types.${option}`)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="properties-editor__delete-btn"
        onClick={handleDelete}
        aria-label={t('contextPanel.properties.deletePropertyAriaLabel', { key: propertyKey })}
        title={t('contextPanel.properties.deleteProperty')}
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

// ─── PropertyValueControl ────────────────────────────────────────────────────

interface PropertyValueControlProps {
  type: PropertyType
  value: unknown
  onChange: (newValue: unknown) => void
  tagSuggestions: string[]
}

function PropertyValueControl({ type, value, onChange, tagSuggestions }: PropertyValueControlProps) {
  switch (type) {
    case 'checkbox':
      return <CheckboxPropertyControl value={value as boolean | string} onChange={onChange} />

    case 'number':
      return <NumberPropertyControl value={value as number | string} onChange={onChange} />

    case 'date':
      return <DatePropertyControl value={String(value ?? '')} onChange={onChange} />

    case 'datetime':
      return <DatePropertyControl value={String(value ?? '')} onChange={onChange} includeTime />

    case 'tags':
      return (
        <ListPropertyControl
          value={Array.isArray(value) ? value.map(String) : []}
          onChange={onChange}
          suggestions={tagSuggestions}
        />
      )

    case 'aliases':
    case 'list':
      return (
        <ListPropertyControl
          value={Array.isArray(value) ? value.map(String) : []}
          onChange={onChange}
        />
      )

    case 'text':
    default:
      return <TextPropertyControl value={String(value ?? '')} onChange={onChange} />
  }
}

// ─── AddPropertyRow ──────────────────────────────────────────────────────────

interface AddPropertyRowProps {
  existingKeys: string[]
  suggestions: string[]
  onAdd: (key: string, value: unknown) => void
}

function AddPropertyRow({ existingKeys, suggestions: _suggestions, onAdd }: AddPropertyRowProps) {
  const { t } = useTranslation()

  const handleAdd = useCallback(() => {
    // Generate a unique key name
    let keyName = 'property'
    let counter = 1
    while (existingKeys.includes(keyName)) {
      keyName = `property-${counter}`
      counter++
    }
    onAdd(keyName, '')
  }, [existingKeys, onAdd])

  return (
    <button
      type="button"
      className="properties-editor__add-btn"
      onClick={handleAdd}
      title={t('contextPanel.properties.addProperty')}
    >
      <Plus size={12} />
      <span>{t('contextPanel.properties.addProperty')}</span>
    </button>
  )
}
