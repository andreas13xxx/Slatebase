import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PluginStoreSearch } from './PluginStoreSearch'
import type { PluginStoreSearchProps } from './PluginStoreSearch'

function createProps(overrides: Partial<PluginStoreSearchProps> = {}): PluginStoreSearchProps {
  return {
    searchQuery: '',
    onSearchChange: vi.fn(),
    showCompatibleOnly: false,
    onCompatibleChange: vi.fn(),
    showNotInstalled: false,
    onNotInstalledChange: vi.fn(),
    selectedCategory: '',
    onCategoryChange: vi.fn(),
    categories: [],
    totalCount: 10,
    filteredCount: 10,
    sortField: 'downloads',
    onSortFieldChange: vi.fn(),
    sortDirection: 'desc',
    onSortDirectionChange: vi.fn(),
    ...overrides,
  }
}

describe('PluginStoreSearch clear button', () => {
  it('is hidden while the field is empty', () => {
    render(<PluginStoreSearch {...createProps()} />)
    expect(screen.queryByRole('button', { name: 'Suche leeren' })).toBeNull()
  })

  it('clears the field and notifies the parent immediately', () => {
    const onSearchChange = vi.fn()
    render(<PluginStoreSearch {...createProps({ searchQuery: 'kanban', onSearchChange })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Suche leeren' }))
    expect(onSearchChange).toHaveBeenCalledWith('')
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('')
  })
})
