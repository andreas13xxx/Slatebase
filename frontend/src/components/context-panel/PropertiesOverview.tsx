/**
 * PropertiesOverview — vault-wide list of every frontmatter property key in
 * use, with its occurrence count and type. Replaces the old per-document
 * Properties tab (editing a document's own frontmatter now happens inline,
 * directly in the note — see FrontmatterWidget in editor/live-preview). This
 * view is for browsing/curating the vault's property *definitions*: which
 * keys exist, how widely used they are, and what type each should be.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useAppContext } from '../../state'
import { useTranslation } from '../../i18n'
import type { PropertyType } from '../../state/propertyTypes'
import './PropertiesOverview.css'

/** All selectable property types, in the same order as the inline editor's dropdown. */
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

export interface PropertiesOverviewProps {
  /** Currently selected vault, or null if none. */
  vaultId: string | null
  /** Whether the current user can edit this vault's property type registry. */
  hasWriteAccess: boolean
}

type SortField = 'name' | 'count' | 'type'

interface OverviewRow {
  key: string
  count: number
  type: PropertyType
}

export function PropertiesOverview({ vaultId, hasWriteAccess }: PropertiesOverviewProps) {
  const { apiClient } = useAppContext()
  const { t } = useTranslation()
  const [rows, setRows] = useState<OverviewRow[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('name')
  const [descending, setDescending] = useState(false)

  const load = useCallback(() => {
    // No vault to fetch for — leave previous state in place rather than
    // resetting synchronously; the `!vaultId` render branch below never
    // looks at `rows` anyway, so a briefly-stale value is never shown.
    if (!vaultId || !apiClient) return
    Promise.all([apiClient.getGraphMeta(vaultId), apiClient.getPropertyTypes(vaultId)])
      .then(([meta, registry]) => {
        const typeByKey = new Map(registry.entries.map((entry) => [entry.key, entry.type]))
        setRows(meta.propertyKeys.map(({ key, count }) => ({
          key,
          count,
          type: typeByKey.get(key) ?? 'text',
        })))
        setLoadError(false)
      })
      .catch(() => setLoadError(true))
  }, [vaultId, apiClient])

  useEffect(() => { load() }, [load])

  const handleTypeChange = useCallback((key: string, type: PropertyType) => {
    if (!vaultId || !apiClient) return
    const previousTypeRef = { current: undefined as PropertyType | undefined }
    setRows((prev) => {
      if (!prev) return prev
      return prev.map((row) => {
        if (row.key !== key) return row
        previousTypeRef.current = row.type
        return { ...row, type }
      })
    })
    apiClient.setPropertyType(vaultId, key, type).catch(() => {
      // Revert the optimistic update — the value still renders via type
      // inference elsewhere even though the explicit choice failed to save.
      const previousType = previousTypeRef.current
      if (previousType === undefined) return
      setRows((prev) => prev ? prev.map((row) => (row.key === key ? { ...row, type: previousType } : row)) : prev)
    })
  }, [vaultId, apiClient])

  /** Rows matching the search, ordered by the chosen field; ties fall back to the name. */
  const visibleRows = useMemo(() => {
    if (!rows) return null
    const needle = query.trim().toLowerCase()
    const filtered = needle === '' ? rows : rows.filter((row) => row.key.toLowerCase().includes(needle))
    const direction = descending ? -1 : 1
    return [...filtered].sort((a, b) => {
      let result = 0
      if (sortField === 'count') result = a.count - b.count
      else if (sortField === 'type') result = a.type.localeCompare(b.type)
      // The name tiebreak stays A to Z whichever way the chosen field runs
      return result !== 0 ? result * direction : a.key.localeCompare(b.key)
    })
  }, [rows, query, sortField, descending])

  if (!vaultId) {
    return (
      <div className="properties-overview properties-overview--empty">
        <p className="properties-overview__placeholder">{t('contextPanel.propertiesOverview.noVault')}</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="properties-overview properties-overview--empty">
        <p className="properties-overview__placeholder">{t('contextPanel.propertiesOverview.loadError')}</p>
      </div>
    )
  }

  if (rows === null) {
    return (
      <div className="properties-overview properties-overview--empty">
        <p className="properties-overview__placeholder">{t('common.loading')}</p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="properties-overview properties-overview--empty">
        <p className="properties-overview__placeholder">{t('contextPanel.propertiesOverview.empty')}</p>
      </div>
    )
  }

  return (
    <div className="properties-overview">
      <p className="properties-overview__hint">{t('contextPanel.propertiesOverview.hint')}</p>
      <div className="properties-overview__tools">
        <input
          type="search"
          className="properties-overview__search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('contextPanel.propertiesOverview.search')}
          aria-label={t('contextPanel.propertiesOverview.search')}
        />
        <select
          className="properties-overview__sort"
          value={sortField}
          onChange={(e) => setSortField(e.target.value as SortField)}
          aria-label={t('contextPanel.propertiesOverview.sortBy')}
        >
          <option value="name">{t('contextPanel.propertiesOverview.sortName')}</option>
          <option value="count">{t('contextPanel.propertiesOverview.sortCount')}</option>
          <option value="type">{t('contextPanel.propertiesOverview.sortType')}</option>
        </select>
        <button
          type="button"
          className="properties-overview__sort-direction"
          onClick={() => setDescending((prev) => !prev)}
          aria-label={descending ? t('contextPanel.propertiesOverview.sortDescending') : t('contextPanel.propertiesOverview.sortAscending')}
          title={descending ? t('contextPanel.propertiesOverview.sortDescending') : t('contextPanel.propertiesOverview.sortAscending')}
        >
          {descending ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
        </button>
      </div>
      {visibleRows !== null && visibleRows.length === 0 && (
        <p className="properties-overview__placeholder">{t('contextPanel.propertiesOverview.noMatches')}</p>
      )}
      <div className="properties-overview__list">
        {(visibleRows ?? []).map((row) => (
          <PropertiesOverviewRow
            key={row.key}
            row={row}
            hasWriteAccess={hasWriteAccess}
            onTypeChange={handleTypeChange}
          />
        ))}
      </div>
    </div>
  )
}

interface PropertiesOverviewRowProps {
  row: OverviewRow
  hasWriteAccess: boolean
  onTypeChange: (key: string, type: PropertyType) => void
}

function PropertiesOverviewRow({ row, hasWriteAccess, onTypeChange }: PropertiesOverviewRowProps) {
  const { t } = useTranslation()

  return (
    <div className="properties-overview__row">
      <span className="properties-overview__key" title={row.key}>{row.key}</span>
      <span className="properties-overview__count">{row.count}</span>
      {hasWriteAccess ? (
        <select
          className="properties-overview__type-select"
          value={row.type}
          onChange={(e) => onTypeChange(row.key, e.target.value as PropertyType)}
          aria-label={t('contextPanel.propertiesOverview.typeAriaLabel', { key: row.key })}
        >
          {ALL_PROPERTY_TYPES.map((option) => (
            <option key={option} value={option}>{t(`contextPanel.properties.types.${option}`)}</option>
          ))}
        </select>
      ) : (
        <span className="properties-overview__type-label">{t(`contextPanel.properties.types.${row.type}`)}</span>
      )}
    </div>
  )
}
