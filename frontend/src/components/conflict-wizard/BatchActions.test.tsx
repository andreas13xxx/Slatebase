import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BatchActions } from './BatchActions'
import type { BatchResolveResult } from './types'

describe('BatchActions', () => {
  const defaultProps = {
    selectedCount: 5,
    strategy: 'Neuere Version',
    isProcessing: false,
    result: null,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onDismissResult: vi.fn(),
  }

  describe('Confirmation dialog', () => {
    it('renders confirmation with count and strategy', () => {
      render(<BatchActions {...defaultProps} />)

      expect(screen.getByText(/5/)).toBeInTheDocument()
      expect(screen.getByText(/Neuere Version/)).toBeInTheDocument()
    })

    it('shows confirm and cancel buttons', () => {
      render(<BatchActions {...defaultProps} />)

      const confirmBtn = screen.getByRole('button', { name: /Bestätigen/i })
      const cancelBtn = screen.getByRole('button', { name: /Abbrechen/i })

      expect(confirmBtn).toBeInTheDocument()
      expect(cancelBtn).toBeInTheDocument()
    })

    it('calls onConfirm when confirm button is clicked', () => {
      const onConfirm = vi.fn()
      render(<BatchActions {...defaultProps} onConfirm={onConfirm} />)

      fireEvent.click(screen.getByRole('button', { name: /Bestätigen/i }))

      expect(onConfirm).toHaveBeenCalledTimes(1)
    })

    it('calls onCancel when cancel button is clicked', () => {
      const onCancel = vi.fn()
      render(<BatchActions {...defaultProps} onCancel={onCancel} />)

      fireEvent.click(screen.getByRole('button', { name: /Abbrechen/i }))

      expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('disables confirm button when isProcessing is true', () => {
      render(<BatchActions {...defaultProps} isProcessing={true} />)

      const confirmBtn = screen.getByRole('button', { name: /verarbeitet/i })
      expect(confirmBtn).toBeDisabled()
    })

    it('disables confirm button when selectedCount is 0', () => {
      render(<BatchActions {...defaultProps} selectedCount={0} />)

      const confirmBtn = screen.getByRole('button', { name: /Bestätigen/i })
      expect(confirmBtn).toBeDisabled()
    })
  })

  describe('Batch limit enforcement', () => {
    it('shows warning when selectedCount exceeds 100', () => {
      render(<BatchActions {...defaultProps} selectedCount={101} />)

      expect(screen.getByText(/Maximal 100 Konflikte/)).toBeInTheDocument()
    })

    it('disables confirm button when limit exceeded', () => {
      render(<BatchActions {...defaultProps} selectedCount={150} />)

      const confirmBtn = screen.getByRole('button', { name: /Bestätigen/i })
      expect(confirmBtn).toBeDisabled()
    })

    it('does not show warning at exactly 100', () => {
      render(<BatchActions {...defaultProps} selectedCount={100} />)

      expect(screen.queryByText(/Maximal 100 Konflikte/)).not.toBeInTheDocument()
    })
  })

  describe('Result summary', () => {
    const successResult: BatchResolveResult = {
      total: 5,
      succeeded: 5,
      failed: 0,
      errors: [],
    }

    it('shows result summary when result is provided', () => {
      render(<BatchActions {...defaultProps} result={successResult} />)

      expect(screen.getByText(/5 erfolgreich/)).toBeInTheDocument()
      expect(screen.getByText(/0 fehlgeschlagen/)).toBeInTheDocument()
    })

    it('calls onDismissResult when dismiss button is clicked', () => {
      const onDismissResult = vi.fn()
      render(
        <BatchActions
          {...defaultProps}
          result={successResult}
          onDismissResult={onDismissResult}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /Bestätigen/i }))

      expect(onDismissResult).toHaveBeenCalledTimes(1)
    })

    it('shows error details when there are failures', () => {
      const failResult: BatchResolveResult = {
        total: 5,
        succeeded: 3,
        failed: 2,
        errors: [
          { documentPath: 'notes/file1.md', error: 'CouchDB push failed' },
          { documentPath: 'notes/file2.md', error: 'File not found' },
        ],
      }

      render(<BatchActions {...defaultProps} result={failResult} />)

      expect(screen.getByText(/3 erfolgreich/)).toBeInTheDocument()
      expect(screen.getByText(/2 fehlgeschlagen/)).toBeInTheDocument()
      // Error toggle should be present
      expect(screen.getByText(/2 Fehler anzeigen/)).toBeInTheDocument()
    })

    it('expands error list when toggle is clicked', () => {
      const failResult: BatchResolveResult = {
        total: 2,
        succeeded: 0,
        failed: 2,
        errors: [
          { documentPath: 'notes/file1.md', error: 'CouchDB push failed' },
          { documentPath: 'notes/file2.md', error: 'File not found' },
        ],
      }

      render(<BatchActions {...defaultProps} result={failResult} />)

      // Initially errors are not visible
      expect(screen.queryByText('CouchDB push failed')).not.toBeInTheDocument()

      // Click toggle
      fireEvent.click(screen.getByText(/Fehler anzeigen/))

      // Errors are now visible
      expect(screen.getByText('notes/file1.md')).toBeInTheDocument()
      expect(screen.getByText('CouchDB push failed')).toBeInTheDocument()
      expect(screen.getByText('notes/file2.md')).toBeInTheDocument()
      expect(screen.getByText('File not found')).toBeInTheDocument()
    })
  })
})
