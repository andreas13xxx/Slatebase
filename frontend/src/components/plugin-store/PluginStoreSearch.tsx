/**
 * PluginStoreSearch — Search field with debounced input (200ms),
 * filter pills, category dropdown, and result counter.
 *
 * Two-row layout:
 * Row 1: Search input + result counter
 * Row 2: Filter pills + Category dropdown
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, ArrowUpDown } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { PluginStoreSortField, PluginStoreSortDirection } from './types'
import './PluginStoreSearch.css'

/** Debounce delay in milliseconds. */
const DEBOUNCE_MS = 300

/** Props for the PluginStoreSearch component. */
export interface PluginStoreSearchProps {
  /** Current search query from parent state. */
  searchQuery: string
  /** Called after debounce with the new query string. */
  onSearchChange: (query: string) => void
  /** Whether to show only compatible (non-desktop-only) plugins. */
  showCompatibleOnly: boolean
  /** Called when the "Compatible" checkbox changes. */
  onCompatibleChange: (value: boolean) => void
  /** Whether to show only plugins that are not yet installed. */
  showNotInstalled: boolean
  /** Called when the "Not Installed" checkbox changes. */
  onNotInstalledChange: (value: boolean) => void
  /** Currently selected category (empty = all). */
  selectedCategory: string
  /** Called when the user selects a category. */
  onCategoryChange: (category: string) => void
  /** Available categories to display in dropdown. */
  categories: string[]
  /** Total number of plugins available (before filtering). */
  totalCount: number
  /** Number of plugins matching current filters. */
  filteredCount: number
  /** Current sort field. */
  sortField: PluginStoreSortField
  /** Called when the sort field changes. */
  onSortFieldChange: (field: PluginStoreSortField) => void
  /** Current sort direction. */
  sortDirection: PluginStoreSortDirection
  /** Called when the sort direction toggles. */
  onSortDirectionChange: (direction: PluginStoreSortDirection) => void
}

/**
 * Search and filter controls for the Plugin Store Browser.
 */
export function PluginStoreSearch({
  searchQuery,
  onSearchChange,
  showCompatibleOnly,
  onCompatibleChange,
  showNotInstalled,
  onNotInstalledChange,
  selectedCategory,
  onCategoryChange,
  categories,
  totalCount,
  filteredCount,
  sortField,
  onSortFieldChange,
  sortDirection,
  onSortDirectionChange,
}: PluginStoreSearchProps) {
  const { t } = useTranslation()
  const [localValue, setLocalValue] = useState(searchQuery)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync local value when parent resets the query externally
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional sync of controlled prop to local state
    setLocalValue(searchQuery)
  }, [searchQuery])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLocalValue(value)

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    timerRef.current = setTimeout(() => {
      onSearchChange(value)
      timerRef.current = null
    }, DEBOUNCE_MS)
  }, [onSearchChange])

  return (
    <div className="plugin-store-search">
      {/* Row 1: Search + Counter */}
      <div className="plugin-store-search__row">
        <div className="plugin-store-search__input-wrapper">
          <Search size={15} className="plugin-store-search__icon" aria-hidden="true" />
          <input
            type="text"
            className="plugin-store-search__input"
            placeholder={t('pluginStore.searchPlaceholder')}
            aria-label={t('pluginStore.searchAriaLabel')}
            value={localValue}
            onChange={handleInputChange}
          />
        </div>
        <span className="plugin-store-search__counter">
          {t('pluginStore.resultCounter', {
            filteredCount: String(filteredCount),
            totalCount: String(totalCount),
          })}
        </span>
      </div>

      {/* Row 2: Filters + Category */}
      <div className="plugin-store-search__filters">
        <label className="plugin-store-search__filter-label">
          <input
            type="checkbox"
            checked={showCompatibleOnly}
            onChange={(e) => onCompatibleChange(e.target.checked)}
          />
          {t('pluginStore.filterCompatible')}
        </label>

        <label className="plugin-store-search__filter-label">
          <input
            type="checkbox"
            checked={showNotInstalled}
            onChange={(e) => onNotInstalledChange(e.target.checked)}
          />
          {t('pluginStore.filterNotInstalled')}
        </label>

        {categories.length > 0 && (
          <select
            className="plugin-store-search__category-select"
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            aria-label={t('pluginStore.categoryLabel')}
          >
            <option value="">{t('pluginStore.categoryAll')}</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        )}

        <div className="plugin-store-search__sort">
          <select
            className="plugin-store-search__sort-select"
            value={sortField}
            onChange={(e) => onSortFieldChange(e.target.value as PluginStoreSortField)}
            aria-label={t('pluginStore.sortLabel')}
          >
            <option value="downloads">{t('pluginStore.sortDownloads')}</option>
            <option value="name">{t('pluginStore.sortName')}</option>
            <option value="updatedAt">{t('pluginStore.sortUpdatedAt')}</option>
            <option value="author">{t('pluginStore.sortAuthor')}</option>
          </select>
          <button
            type="button"
            className="plugin-store-search__sort-direction"
            onClick={() => onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc')}
            aria-label={t('pluginStore.sortDirectionLabel')}
            title={sortDirection === 'asc' ? t('pluginStore.sortAsc') : t('pluginStore.sortDesc')}
          >
            <ArrowUpDown size={14} aria-hidden="true" />
            <span className="plugin-store-search__sort-direction-text">
              {sortDirection === 'asc' ? '↑' : '↓'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
