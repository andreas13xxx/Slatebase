/**
 * PropertiesView component for the Context Panel.
 *
 * Displays YAML frontmatter properties of the active document as a
 * two-column table (key | value). Supports nested objects with indentation
 * (up to 5 levels), arrays as comma-separated text, and graceful error handling.
 */

import { useTranslation } from '../../i18n'

// ─── Props ───────────────────────────────────────────────────────────────────

export interface PropertiesViewProps {
  /** Parsed frontmatter data, or null if no/empty frontmatter or parse error */
  data: Record<string, unknown> | null
  /** Error message if YAML parsing failed, or null on success */
  parseError: string | null
  /** Raw frontmatter text (without delimiters), or null if no frontmatter found */
  rawFrontmatter: string | null
  /** Whether a document is currently open */
  hasDocument?: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_NESTING_DEPTH = 5
/** En-dash used as placeholder for null/undefined values */
const NULL_PLACEHOLDER = '\u2013'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Formats a primitive value for display in the properties table.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return NULL_PLACEHOLDER
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  if (typeof value === 'number') {
    return String(value)
  }
  if (typeof value === 'string') {
    return value
  }
  return JSON.stringify(value)
}

/**
 * Formats an array value as comma-separated inline text.
 */
function formatArray(arr: unknown[]): string {
  return arr.map(item => formatValue(item)).join(', ')
}

// ─── Recursive Row Renderer ──────────────────────────────────────────────────

interface PropertyRowProps {
  keyName: string
  value: unknown
  depth: number
}

/**
 * Renders a single property row, recursing into nested objects up to MAX_NESTING_DEPTH.
 */
function PropertyRows({ keyName, value, depth }: PropertyRowProps): React.ReactElement {
  const indentation = depth * 1 // 1rem per level

  // Beyond max depth: render as inline JSON
  if (depth >= MAX_NESTING_DEPTH && value !== null && typeof value === 'object') {
    const jsonText = JSON.stringify(value)
    return (
      <tr className="properties-view__row">
        <td
          className="properties-view__key"
          style={{ paddingLeft: `${indentation}rem` }}
          title={keyName}
        >
          {keyName}
        </td>
        <td className="properties-view__value" title={jsonText}>
          {jsonText}
        </td>
      </tr>
    )
  }

  // Array values: render as comma-separated text
  if (Array.isArray(value)) {
    const formatted = formatArray(value)
    return (
      <tr className="properties-view__row">
        <td
          className="properties-view__key"
          style={{ paddingLeft: `${indentation}rem` }}
          title={keyName}
        >
          {keyName}
        </td>
        <td className="properties-view__value" title={formatted}>
          {formatted}
        </td>
      </tr>
    )
  }

  // Nested object: render key row + recurse into children
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    return (
      <>
        <tr className="properties-view__row properties-view__row--group">
          <td
            className="properties-view__key"
            style={{ paddingLeft: `${indentation}rem` }}
            title={keyName}
          >
            {keyName}
          </td>
          <td className="properties-view__value" title="">
          </td>
        </tr>
        {entries.map(([childKey, childValue]) => (
          <PropertyRows
            key={`${keyName}.${childKey}`}
            keyName={childKey}
            value={childValue}
            depth={depth + 1}
          />
        ))}
      </>
    )
  }

  // Primitive values (string, number, boolean, null)
  const formatted = formatValue(value)
  return (
    <tr className="properties-view__row">
      <td
        className="properties-view__key"
        style={{ paddingLeft: `${indentation}rem` }}
        title={keyName}
      >
        {keyName}
      </td>
      <td className="properties-view__value" title={formatted}>
        {formatted}
      </td>
    </tr>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PropertiesView({ data, parseError, rawFrontmatter, hasDocument = true }: PropertiesViewProps) {
  const { t } = useTranslation()

  // No document open
  if (!hasDocument) {
    return (
      <div className="properties-view properties-view--empty">
        <p className="properties-view__placeholder">
          {t('contextPanel.properties.noDocument')}
        </p>
      </div>
    )
  }

  // Parse error: show error message + raw frontmatter
  if (parseError) {
    return (
      <div className="properties-view properties-view--error">
        <p className="properties-view__error-message">
          {t('contextPanel.properties.parseError')}
        </p>
        {rawFrontmatter !== null && (
          <pre className="properties-view__raw-frontmatter">{rawFrontmatter}</pre>
        )}
      </div>
    )
  }

  // No frontmatter found or empty frontmatter
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="properties-view properties-view--empty">
        <p className="properties-view__placeholder">
          {t('contextPanel.properties.empty')}
        </p>
      </div>
    )
  }

  // Render frontmatter as two-column table
  const entries = Object.entries(data)

  return (
    <div className="properties-view">
      <table className="properties-view__table">
        <tbody>
          {entries.map(([key, value]) => (
            <PropertyRows
              key={key}
              keyName={key}
              value={value}
              depth={0}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
