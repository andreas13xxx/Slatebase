import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SnippetEditorModal } from './SnippetEditorModal'
import type { IApiClient } from '../../api'

function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    loadSnippetContent: vi.fn().mockResolvedValue('body { color: red; }'),
    saveSnippetContent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as IApiClient
}

describe('SnippetEditorModal', () => {
  it('loads and displays existing content', async () => {
    const apiClient = createMockApiClient()
    render(
      <SnippetEditorModal
        apiClient={apiClient}
        vaultId="vault1"
        snippetId="dark-accent"
        filename="dark-accent.css"
        onSaved={() => {}}
        onCancel={() => {}}
      />
    )

    await waitFor(() => {
      expect(screen.getByLabelText('CSS-Inhalt')).toHaveValue('body { color: red; }')
    })
  })

  it('skips the load round-trip when initialContent is provided', () => {
    const apiClient = createMockApiClient()
    render(
      <SnippetEditorModal
        apiClient={apiClient}
        vaultId="vault1"
        snippetId="new-snippet"
        filename="new-snippet.css"
        initialContent=""
        onSaved={() => {}}
        onCancel={() => {}}
      />
    )

    expect(apiClient.loadSnippetContent).not.toHaveBeenCalled()
    expect(screen.getByLabelText('CSS-Inhalt')).toHaveValue('')
  })

  it('saves edited content and calls onSaved', async () => {
    const apiClient = createMockApiClient()
    const onSaved = vi.fn()
    render(
      <SnippetEditorModal
        apiClient={apiClient}
        vaultId="vault1"
        snippetId="dark-accent"
        filename="dark-accent.css"
        initialContent="body {}"
        onSaved={onSaved}
        onCancel={() => {}}
      />
    )

    fireEvent.change(screen.getByLabelText('CSS-Inhalt'), { target: { value: 'body { color: blue; }' } })
    fireEvent.click(screen.getByText('Speichern'))

    await waitFor(() => {
      expect(apiClient.saveSnippetContent).toHaveBeenCalledWith('vault1', 'dark-accent', 'body { color: blue; }')
    })
    expect(onSaved).toHaveBeenCalledWith('body { color: blue; }')
  })

  it('shows an error message when saving fails', async () => {
    const apiClient = createMockApiClient({
      saveSnippetContent: vi.fn().mockRejectedValue(new Error('Netzwerkfehler')),
    })
    render(
      <SnippetEditorModal
        apiClient={apiClient}
        vaultId="vault1"
        snippetId="dark-accent"
        filename="dark-accent.css"
        initialContent="body {}"
        onSaved={() => {}}
        onCancel={() => {}}
      />
    )

    fireEvent.click(screen.getByText('Speichern'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Netzwerkfehler')
  })

  it('calls onCancel without saving', () => {
    const apiClient = createMockApiClient()
    const onCancel = vi.fn()
    render(
      <SnippetEditorModal
        apiClient={apiClient}
        vaultId="vault1"
        snippetId="dark-accent"
        filename="dark-accent.css"
        initialContent="body {}"
        onSaved={() => {}}
        onCancel={onCancel}
      />
    )

    fireEvent.click(screen.getByText('Abbrechen'))

    expect(onCancel).toHaveBeenCalled()
    expect(apiClient.saveSnippetContent).not.toHaveBeenCalled()
  })
})
