import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { MergePreview } from './MergePreview'
import { AppContext, type AppContextValue } from '../../state'
import type { IApiClient } from '../../api'

function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    resolveConflictMerge: vi.fn().mockResolvedValue(undefined),
    getToken: vi.fn().mockReturnValue('test-token'),
    setToken: vi.fn(),
    setCsrfToken: vi.fn(),
    setOnSessionExpired: vi.fn(),
    ...overrides,
  } as unknown as IApiClient
}

function renderMergePreview(
  props: Partial<React.ComponentProps<typeof MergePreview>> = {},
  apiClient?: IApiClient,
) {
  const mockApiClient = apiClient ?? createMockApiClient()

  const appContextValue: AppContextValue = {
    state: {
      vaults: [],
      selectedVaultId: null,
      directoryTree: null,
      selectedFile: null,
      loading: false,
      error: null,
    },
    dispatch: vi.fn(),
    apiClient: mockApiClient,
  }

  const defaultProps: React.ComponentProps<typeof MergePreview> = {
    initialContent: '# Hello\n\nWorld',
    documentPath: 'notes/test.md',
    vaultId: 'vault-123',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...props,
  }

  return {
    apiClient: mockApiClient,
    ...render(
      React.createElement(
        AppContext.Provider,
        { value: appContextValue },
        React.createElement(MergePreview, defaultProps),
      ),
    ),
    props: defaultProps,
  }
}

describe('MergePreview', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders with initial content in the textarea', () => {
    renderMergePreview({ initialContent: '# Test Content' })

    const textarea = screen.getByRole('textbox')
    expect(textarea).toHaveValue('# Test Content')
  })

  it('displays the document path', () => {
    renderMergePreview({ documentPath: 'docs/readme.md' })

    expect(screen.getByText('docs/readme.md')).toBeInTheDocument()
  })

  it('renders Bestätigen and Abbrechen buttons', () => {
    renderMergePreview()

    expect(screen.getByRole('button', { name: /Bestätigen/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Abbrechen/i })).toBeInTheDocument()
  })

  it('allows editing the textarea content', () => {
    renderMergePreview({ initialContent: 'original' })

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'modified content' } })

    expect(textarea).toHaveValue('modified content')
  })

  it('calls resolveConflictMerge API on confirm', async () => {
    const onConfirm = vi.fn()
    const mockApi = createMockApiClient()
    renderMergePreview(
      { initialContent: 'merged text', onConfirm, vaultId: 'v1', documentPath: 'a.md' },
      mockApi,
    )

    const confirmBtn = screen.getByRole('button', { name: /Bestätigen/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(mockApi.resolveConflictMerge).toHaveBeenCalledWith('v1', 'a.md', 'merged text')
    })
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled()
    })
  })

  it('calls onCancel when Abbrechen button is clicked', () => {
    const onCancel = vi.fn()
    renderMergePreview({ onCancel })

    fireEvent.click(screen.getByRole('button', { name: /Abbrechen/i }))

    expect(onCancel).toHaveBeenCalled()
  })

  it('shows error message when API call fails', async () => {
    const mockApi = createMockApiClient({
      resolveConflictMerge: vi.fn().mockRejectedValue(new Error('Network error')),
    })
    const onConfirm = vi.fn()
    renderMergePreview({ onConfirm }, mockApi)

    fireEvent.click(screen.getByRole('button', { name: /Bestätigen/i }))

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('disables buttons during submission', async () => {
    let resolvePromise: (() => void) | undefined
    const mockApi = createMockApiClient({
      resolveConflictMerge: vi.fn().mockImplementation(
        () => new Promise<void>((resolve) => { resolvePromise = resolve }),
      ),
    })
    renderMergePreview({}, mockApi)

    fireEvent.click(screen.getByRole('button', { name: /Bestätigen/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Bestätigen/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /Abbrechen/i })).toBeDisabled()
    })

    // Resolve the promise to clean up
    resolvePromise?.()
  })

  it('toggles between editor and preview modes', () => {
    renderMergePreview({ initialContent: '# Preview Test' })

    // Initially in editor mode
    expect(screen.getByRole('textbox')).toBeInTheDocument()

    // Switch to preview
    fireEvent.click(screen.getByRole('button', { name: /Vorschau/i }))

    // Textarea should be hidden, preview should show content
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('# Preview Test')).toBeInTheDocument()

    // Switch back to editor
    fireEvent.click(screen.getByRole('button', { name: /Editor/i }))
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('sends edited content (not initial) on confirm', async () => {
    const mockApi = createMockApiClient()
    const onConfirm = vi.fn()
    renderMergePreview(
      { initialContent: 'original', onConfirm, vaultId: 'v1', documentPath: 'b.md' },
      mockApi,
    )

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'edited' } })
    fireEvent.click(screen.getByRole('button', { name: /Bestätigen/i }))

    await waitFor(() => {
      expect(mockApi.resolveConflictMerge).toHaveBeenCalledWith('v1', 'b.md', 'edited')
    })
  })
})
