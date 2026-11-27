/**
 * PropertiesEditor — interactive, typed frontmatter property editor.
 * Renders type-aware controls per property key based on the type registry
 * or inference from the actual value. Mounted inline inside the document
 * editor itself (see FrontmatterWidget in editor/live-preview/widget-decorations.ts)
 * — editing a document's frontmatter happens in the document, not the sidebar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { getMetadataTypeManager, fromWidgetType, toWidgetType, type MetadataTypeManager } from '../../plugins/compat/metadata-type-manager'
import { registerRenderedProperty } from '../../plugins/compat/metadata-editor-bridge'
import { renderComponentIcon } from '../../plugins/compat/obsidian-api-extensions'
import { warnOnce } from '../../plugins/compat/log'
import type { PropertyWidget } from '../../plugins/compat/property-widgets'
import { ContextMenu, type ContextMenuItem } from '../ContextMenu'
import { PluginPropertyWidget } from './PluginPropertyWidget'
import {
  TextPropertyControl,
  NumberPropertyControl,
  DatePropertyControl,
  CheckboxPropertyControl,
  ListPropertyControl,
  StructuredPropertyControl,
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
  /** Path of the note the properties belong to; handed to plugin property widgets as `ctx.sourcePath`. */
  sourcePath?: string
  /**
   * Display only: no adding, renaming, deleting or type change, and no editable values,
   * not even in the rows a plugin widget draws itself. Reading view, and previews without write access.
   */
  readOnly?: boolean
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
 * Registry takes precedence, then a plugin-assigned type, then inference from the value.
 */
function resolvePropertyType(
  key: string,
  value: unknown,
  registry: PropertyTypeEntry[] | null,
  manager: MetadataTypeManager,
): PropertyType {
  if (registry) {
    const entry = registry.find((e) => e.key === key)
    if (entry) return entry.type
  }
  // A type a plugin assigned through metadataTypeManager.setType()
  const assigned = fromWidgetType(manager.getAssignedWidget(key) ?? '')
  if ((ALL_PROPERTY_TYPES as string[]).includes(assigned)) return assigned as PropertyType
  // Well-known keys
  if (key === 'tags') return 'tags'
  if (key === 'aliases') return 'aliases'
  return inferPropertyType(value)
}

/** What draws a row's value: a built-in control, the YAML editor for nested data, or a widget from a plugin. */
type RowKind =
  | { kind: 'builtin'; type: PropertyType }
  | { kind: 'structured' }
  | { kind: 'widget'; widget: PropertyWidget; pluginId: string | null }

/** A nested object, or a list holding anything but strings: the built-in text/list controls would flatten it. */
function isStructuredValue(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || value instanceof Date) return false
  return !Array.isArray(value) || value.some((item) => item !== null && typeof item !== 'string')
}

/** The widget a plugin put in charge of this value (registered, or wrapped around a built-in), if any. */
function pluginWidgetFor(manager: MetadataTypeManager, key: string, value: unknown): PropertyWidget | null {
  try {
    const expected = manager.getTypeInfo(key, value).expected
    if (expected && !manager.isBuiltinWidget(expected) && typeof expected.render === 'function') return expected
  } catch (err) {
    warnOnce('property-type-info', '[PluginCompat] metadataTypeManager.getTypeInfo threw; the built-in control is used instead:', err)
  }
  return null
}

/** The user's registry choice wins; otherwise a plugin widget; nested data stays structured; else a built-in control. */
function resolveRowKind(key: string, value: unknown, registry: PropertyTypeEntry[] | null, manager: MetadataTypeManager): RowKind {
  const chosen = registry?.some((entry) => entry.key === key) === true
  if (!chosen) {
    const widget = pluginWidgetFor(manager, key, value)
    if (widget) return { kind: 'widget', widget, pluginId: manager.getWidgetOwner(widget) }
  }
  if (isStructuredValue(value)) return { kind: 'structured' }
  return { kind: 'builtin', type: resolvePropertyType(key, value, registry, manager) }
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
  sourcePath = '',
  readOnly = false,
}: PropertiesEditorProps) {
  const { t } = useTranslation()
  const manager = getMetadataTypeManager()
  // Re-resolve every row when a plugin registers a widget or assigns a type.
  const [, setTypesVersion] = useState(0)
  useEffect(() => manager.onChange(() => { setTypesVersion((v) => v + 1) }), [manager])
  useEffect(() => { manager.setVaultTypes(typeRegistry ?? []) }, [manager, typeRegistry])

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
    <div className={`properties-editor metadata-container${readOnly ? ' properties-editor--readonly' : ''}`}>
      {entries.length === 0 && !parseError && (
        <p className="properties-editor__placeholder">
          {t('contextPanel.properties.empty')}
        </p>
      )}

      {entries.length > 0 && (
        <fieldset className="properties-editor-fieldset properties-editor__list metadata-properties" disabled={readOnly}>
          {entries.map(([key, value]) => (
            <PropertyRow
              key={key}
              propertyKey={key}
              value={value}
              kind={resolveRowKind(key, value, typeRegistry, manager)}
              sourcePath={sourcePath}
              existingKeys={entries.filter(([k]) => k !== key).map(([k]) => k)}
              startInEditMode={key === justAddedKey}
              onEditModeExited={() => setJustAddedKey((prev) => (prev === key ? null : prev))}
              tagSuggestions={tagSuggestions}
              onCommit={onCommit}
              onDelete={onDeleteProperty}
              onRename={onRenameProperty}
              onTypeChange={onTypeChange}
              readOnly={readOnly}
            />
          ))}
        </fieldset>
      )}

      {!readOnly && (
        <AddPropertyRow
          existingKeys={entries.map(([k]) => k)}
          suggestions={propertySuggestions}
          onAdd={handleAdd}
        />
      )}
    </div>
  )
}

// ─── PropertyRow ─────────────────────────────────────────────────────────────

interface PropertyRowProps {
  propertyKey: string
  value: unknown
  kind: RowKind
  sourcePath: string
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
  readOnly: boolean
}

function PropertyRow({
  propertyKey,
  value,
  kind,
  sourcePath,
  existingKeys,
  startInEditMode,
  onEditModeExited,
  tagSuggestions,
  onCommit,
  onDelete,
  onRename,
  onTypeChange,
  readOnly,
}: PropertyRowProps) {
  const { t } = useTranslation()
  const rowRef = useRef<HTMLDivElement>(null)
  const iconRef = useRef<HTMLSpanElement>(null)
  const [isEditingKey, setIsEditingKey] = useState(startInEditMode)
  const [draftKey, setDraftKey] = useState(propertyKey)
  const keyInputRef = useRef<HTMLInputElement>(null)
  // Whether the open rename has been resolved. A ref for the same reason as in
  // the value controls: committing rebuilds the properties editor, so the state
  // flag may not have re-rendered by the time this row unmounts. A row that
  // opens in rename mode (just added) starts out unresolved.
  const keyEditSettledRef = useRef(!startInEditMode)

  // A plugin can set `entry.value` and force the row to draw again (metadataEditor.rendered[].renderProperty).
  const [forced, setForced] = useState<{ from: unknown; value: unknown; nonce: number } | null>(null)
  const shownValue = forced !== null && forced.from === value ? forced.value : value
  const entryRef = useRef<{ key: string; value: unknown }>({ key: '', value: undefined })
  const valueRef = useRef(value)
  useEffect(() => {
    entryRef.current.key = propertyKey
    entryRef.current.value = value
    valueRef.current = value
  })
  useEffect(() => {
    const containerEl = rowRef.current
    if (!containerEl) return undefined
    return registerRenderedProperty({
      containerEl,
      entry: entryRef.current,
      sourcePath,
      renderProperty: (entry) => {
        setForced((previous) => ({ from: valueRef.current, value: entry.value, nonce: (previous?.nonce ?? 0) + 1 }))
      },
    })
  }, [sourcePath])

  const widgetType = kind.kind === 'builtin' ? toWidgetType(kind.type) : kind.kind === 'widget' ? kind.widget.type : 'unknown'
  const iconId = kind.kind === 'widget' ? kind.widget.icon : kind.kind === 'structured' ? 'lucide-braces' : getMetadataTypeManager().getWidget(widgetType)?.icon
  useEffect(() => {
    const iconEl = iconRef.current
    // A plugin widget may already have drawn its own icon into the span (setIcon); keep that.
    if (iconEl && iconId && !(kind.kind === 'widget' && iconEl.childElementCount > 0)) renderComponentIcon(iconEl, iconId)
  }, [iconId, kind.kind])

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

  // Like Obsidian, the type menu opens from the property's icon, not from a control beside the value.
  const [typeMenu, setTypeMenu] = useState<{ x: number; y: number } | null>(null)
  const currentType = kind.kind === 'builtin' ? kind.type : null
  const typeMenuItems = useMemo<ContextMenuItem[]>(() => ALL_PROPERTY_TYPES.map((option) => ({
    id: `type-${option}`,
    label: t(`contextPanel.properties.types.${option}`),
    checked: option === currentType,
    run: () => { onTypeChange(propertyKey, option) },
  })), [t, currentType, propertyKey, onTypeChange])
  const openTypeMenu = useCallback((e: React.SyntheticEvent<HTMLElement>) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setTypeMenu({ x: rect.left, y: rect.bottom + 2 })
  }, [])

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
    <div
      ref={rowRef}
      className="properties-editor__row metadata-property"
      data-property-key={propertyKey}
      data-property-type={widgetType}
      data-plugin-id={kind.kind === 'widget' ? kind.pluginId ?? undefined : undefined}
      tabIndex={kind.kind === 'widget' ? -1 : undefined}
    >
      <div className="properties-editor__key-cell metadata-property-key">
        {readOnly ? (
          <span ref={iconRef} className="metadata-property-icon" aria-hidden="true" />
        ) : (
          <span
            ref={iconRef}
            className="metadata-property-icon properties-editor__type-icon"
            role="button"
            tabIndex={0}
            aria-haspopup="menu"
            aria-label={t('contextPanel.properties.typeAriaLabel')}
            title={t('contextPanel.properties.typeAriaLabel')}
            onClick={openTypeMenu}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTypeMenu(e) } }}
          />
        )}
        {readOnly ? (
          <span className="properties-editor__key properties-editor__key--readonly">{propertyKey}</span>
        ) : isEditingKey ? (
          <input
            ref={keyInputRef}
            type="text"
            className="properties-editor__key-input metadata-property-key-input"
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
      </div>
      {kind.kind === 'widget' ? (
        <PluginPropertyWidget
          key={forced?.nonce ?? 0}
          widget={kind.widget}
          pluginId={kind.pluginId}
          propertyKey={propertyKey}
          sourcePath={sourcePath}
          value={shownValue}
          onChange={handleChange}
          readOnly={readOnly}
        />
      ) : (
        <div className="properties-editor__value metadata-property-value" data-property-type={widgetType}>
          <PropertyValueControl
            key={forced?.nonce ?? 0}
            kind={kind}
            value={shownValue}
            onChange={handleChange}
            tagSuggestions={tagSuggestions}
          />
        </div>
      )}
      {!readOnly && (
        <button
          type="button"
          className="properties-editor__delete-btn"
          onClick={handleDelete}
          aria-label={t('contextPanel.properties.deletePropertyAriaLabel', { key: propertyKey })}
          title={t('contextPanel.properties.deleteProperty')}
        >
          <Trash2 size={12} />
        </button>
      )}
      {typeMenu && (
        <ContextMenu x={typeMenu.x} y={typeMenu.y} items={typeMenuItems} onClose={() => setTypeMenu(null)} onSelect={() => {}} />
      )}
    </div>
  )
}

// ─── PropertyValueControl ────────────────────────────────────────────────────

interface PropertyValueControlProps {
  kind: RowKind
  value: unknown
  onChange: (newValue: unknown) => void
  tagSuggestions: string[]
}

function PropertyValueControl({ kind, tagSuggestions, value, onChange }: PropertyValueControlProps) {
  if (kind.kind === 'widget') return null
  if (kind.kind === 'structured') {
    return <StructuredPropertyControl value={value} onChange={onChange} />
  }
  switch (kind.type) {
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
