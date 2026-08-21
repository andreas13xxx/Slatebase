/**
 * PropertiesEditor — interactive, typed frontmatter property editor.
 * Replaces the read-only PropertiesView when the active file is editable.
 * Renders type-aware controls per property key based on the type registry
 * or inference from the actual value.
 */

import { useCallback, useMemo } from 'react'
import { Trash2, Plus } from 'lucide-react'
import {
  TextPropertyControl,
  NumberPropertyControl,
  DatePropertyControl,
  CheckboxPropertyControl,
  ListPropertyControl,
} from './property-controls'
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
  tagSuggestions = [],
  propertySuggestions = [],
  hasDocument = true,
  isMarkdown = true,
}: PropertiesEditorProps) {
  const { t } = useTranslation()

  const entries = useMemo(() => {
    if (!data) return []
    return Object.entries(data).filter(([, v]) => v !== undefined)
  }, [data])

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
          Keine Eigenschaften für diesen Dateityp
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
              tagSuggestions={tagSuggestions}
              onCommit={onCommit}
              onDelete={onDeleteProperty}
            />
          ))}
        </div>
      )}

      <AddPropertyRow
        existingKeys={entries.map(([k]) => k)}
        suggestions={propertySuggestions}
        onAdd={onAddProperty}
      />
    </div>
  )
}

// ─── PropertyRow ─────────────────────────────────────────────────────────────

interface PropertyRowProps {
  propertyKey: string
  value: unknown
  type: PropertyType
  tagSuggestions: string[]
  onCommit: (key: string, value: unknown) => void
  onDelete: (key: string) => void
}

function PropertyRow({ propertyKey, value, type, tagSuggestions, onCommit, onDelete }: PropertyRowProps) {
  const handleChange = useCallback((newValue: unknown) => {
    onCommit(propertyKey, newValue)
  }, [propertyKey, onCommit])

  const handleDelete = useCallback(() => {
    onDelete(propertyKey)
  }, [propertyKey, onDelete])

  return (
    <div className="properties-editor__row">
      <span className="properties-editor__key" title={propertyKey}>{propertyKey}</span>
      <div className="properties-editor__value">
        <PropertyValueControl
          type={type}
          value={value}
          onChange={handleChange}
          tagSuggestions={tagSuggestions}
        />
      </div>
      <button
        type="button"
        className="properties-editor__delete-btn"
        onClick={handleDelete}
        aria-label={`${propertyKey} entfernen`}
        title="Eigenschaft entfernen"
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
      title="Eigenschaft hinzufügen"
    >
      <Plus size={12} />
      <span>Eigenschaft hinzufügen</span>
    </button>
  )
}
