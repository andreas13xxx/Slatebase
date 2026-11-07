import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SearchEmbed } from './SearchEmbed'

const response = {
  results: [{
    filePath: 'Notes/a.md', fileName: 'a.md', hitCount: 1,
    hits: [{ line: 3, matchText: 'x', contextBefore: [], contextAfter: [], matchLine: '<img src=x onerror=alert(1)> todo' }],
  }],
  totalHits: 1,
}

describe('SearchEmbed', () => {
  it('runs the query, lists matches and opens a note', async () => {
    const searchVault = vi.fn().mockResolvedValue(response)
    const onOpenNote = vi.fn()
    render(<SearchEmbed vaultId="v1" query={'  task-todo:todo \n'} onOpenNote={onOpenNote} apiClient={{ searchVault }} />)
    await waitFor(() => expect(screen.getByText('a.md')).toBeTruthy())
    expect(searchVault).toHaveBeenCalledWith('v1', expect.objectContaining({ query: 'task-todo:todo', regex: 'false' }))
    fireEvent.click(screen.getByText('a.md'))
    expect(onOpenNote).toHaveBeenCalledWith('Notes/a.md')
  })

  it('renders vault text as text, never as HTML', async () => {
    const { container } = render(
      <SearchEmbed vaultId="v1" query="todo" onOpenNote={vi.fn()} apiClient={{ searchVault: vi.fn().mockResolvedValue(response) }} />,
    )
    await waitFor(() => expect(container.querySelector('.search-embed__text')).not.toBeNull())
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.search-embed__text')?.textContent).toContain('<img src=x')
  })

  it('shows a message for an empty query without searching, and for no results', async () => {
    const searchVault = vi.fn().mockResolvedValue({ results: [], totalHits: 0 })
    const { rerender } = render(<SearchEmbed vaultId="v1" query="  " onOpenNote={vi.fn()} apiClient={{ searchVault }} />)
    expect(searchVault).not.toHaveBeenCalled()
    rerender(<SearchEmbed vaultId="v1" query="nothing" onOpenNote={vi.fn()} apiClient={{ searchVault }} />)
    await waitFor(() => expect(screen.getByText('Keine Treffer')).toBeTruthy())
  })

  it('shows an error when the search fails', async () => {
    render(<SearchEmbed vaultId="v1" query="x" onOpenNote={vi.fn()} apiClient={{ searchVault: vi.fn().mockRejectedValue(new Error('boom')) }} />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  })
})
