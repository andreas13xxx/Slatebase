import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiffView } from './DiffView'

describe('DiffView', () => {
  const defaultProps = {
    localContent: 'line1\nline2\nline3',
    remoteContent: 'line1\nmodified\nline3',
    filePath: 'notes/test.md',
    mode: 'side-by-side' as const,
    onUseLocal: vi.fn(),
    onUseRemote: vi.fn(),
    onManualMerge: vi.fn(),
  }

  // ─── Binary File Fallback ────────────────────────────────────────────────

  describe('binary file fallback', () => {
    it('shows binary notice for non-text files', () => {
      render(
        <DiffView
          {...defaultProps}
          filePath="images/photo.png"
        />,
      )

      expect(screen.getByText('Binärdatei — kein Text-Diff verfügbar')).toBeInTheDocument()
    })

    it('shows binary notice when localContent is null', () => {
      render(
        <DiffView
          {...defaultProps}
          localContent={null}
        />,
      )

      expect(screen.getByText('Binärdatei — kein Text-Diff verfügbar')).toBeInTheDocument()
    })

    it('shows binary notice when remoteContent is null', () => {
      render(
        <DiffView
          {...defaultProps}
          remoteContent={null}
        />,
      )

      expect(screen.getByText('Binärdatei — kein Text-Diff verfügbar')).toBeInTheDocument()
    })

    it('does not show manual merge button for binary files', () => {
      render(
        <DiffView
          {...defaultProps}
          filePath="images/photo.png"
        />,
      )

      expect(screen.queryByText('Manuell mergen')).not.toBeInTheDocument()
    })

    it('shows use local and use remote buttons for binary files', () => {
      render(
        <DiffView
          {...defaultProps}
          filePath="data/file.bin"
        />,
      )

      expect(screen.getByText('Lokale Version')).toBeInTheDocument()
      expect(screen.getByText('Remote-Version')).toBeInTheDocument()
    })
  })

  // ─── Side-by-Side Mode ─────────────────────────────────────────────────

  describe('side-by-side mode', () => {
    it('renders the side-by-side container', () => {
      const { container } = render(<DiffView {...defaultProps} />)

      expect(container.querySelector('.diff-view__side-by-side')).toBeInTheDocument()
    })

    it('renders column headers for local and remote', () => {
      render(<DiffView {...defaultProps} />)

      const labels = screen.getAllByText(/^(Lokal|Remote)$/)
      expect(labels.length).toBe(2)
    })

    it('shows removed lines with correct CSS class', () => {
      const { container } = render(<DiffView {...defaultProps} />)

      const removedLines = container.querySelectorAll('.diff-view__line--removed')
      expect(removedLines.length).toBeGreaterThan(0)
    })

    it('shows added lines with correct CSS class', () => {
      const { container } = render(<DiffView {...defaultProps} />)

      const addedLines = container.querySelectorAll('.diff-view__line--added')
      expect(addedLines.length).toBeGreaterThan(0)
    })

    it('shows equal lines with correct CSS class', () => {
      const { container } = render(<DiffView {...defaultProps} />)

      const equalLines = container.querySelectorAll('.diff-view__line--equal')
      expect(equalLines.length).toBeGreaterThan(0)
    })

    it('displays line numbers', () => {
      const { container } = render(<DiffView {...defaultProps} />)

      const lineNumbers = container.querySelectorAll('.diff-view__line-number')
      expect(lineNumbers.length).toBeGreaterThan(0)
    })
  })

  // ─── Unified Mode ──────────────────────────────────────────────────────

  describe('unified mode', () => {
    it('renders the unified container', () => {
      const { container } = render(
        <DiffView {...defaultProps} mode="unified" />,
      )

      expect(container.querySelector('.diff-view__unified')).toBeInTheDocument()
      expect(container.querySelector('.diff-view__side-by-side')).not.toBeInTheDocument()
    })

    it('shows + prefix for added lines', () => {
      const { container } = render(
        <DiffView {...defaultProps} mode="unified" />,
      )

      const prefixes = container.querySelectorAll('.diff-view__prefix')
      const texts = Array.from(prefixes).map((p) => p.textContent)
      expect(texts).toContain('+')
    })

    it('shows - prefix for removed lines', () => {
      const { container } = render(
        <DiffView {...defaultProps} mode="unified" />,
      )

      const prefixes = container.querySelectorAll('.diff-view__prefix')
      const texts = Array.from(prefixes).map((p) => p.textContent)
      expect(texts).toContain('-')
    })
  })

  // ─── Collapsible Sections ──────────────────────────────────────────────

  describe('collapsible identical sections', () => {
    it('shows collapsed section for large equal blocks', () => {
      // Create content with a large identical block in the middle
      const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`)
      const local = lines.join('\n')
      const remote = ['CHANGED', ...lines.slice(1, 19), 'ALSO_CHANGED'].join('\n')

      render(
        <DiffView
          {...defaultProps}
          localContent={local}
          remoteContent={remote}
        />,
      )

      // Should have at least one collapsed button with "identische Zeilen" text
      const collapsed = screen.queryAllByRole('button', { name: /identische Zeilen/i })
      expect(collapsed.length).toBeGreaterThanOrEqual(1)
    })

    it('does not collapse small equal blocks', () => {
      // Only 2 equal lines between changes — should not be collapsed
      const local = 'a\nb\nc'
      const remote = 'x\nb\ny'

      render(
        <DiffView
          {...defaultProps}
          localContent={local}
          remoteContent={remote}
        />,
      )

      const collapsed = screen.queryAllByRole('button', { name: /identische Zeilen/i })
      expect(collapsed.length).toBe(0)
    })
  })

  // ─── Action Buttons ────────────────────────────────────────────────────

  describe('action buttons', () => {
    it('renders all three action buttons for text files', () => {
      render(<DiffView {...defaultProps} />)

      expect(screen.getByText('Lokale Version')).toBeInTheDocument()
      expect(screen.getByText('Remote-Version')).toBeInTheDocument()
      expect(screen.getByText('Manuell mergen')).toBeInTheDocument()
    })

    it('calls onUseLocal when local button is clicked', () => {
      const onUseLocal = vi.fn()
      render(<DiffView {...defaultProps} onUseLocal={onUseLocal} />)

      fireEvent.click(screen.getByText('Lokale Version'))
      expect(onUseLocal).toHaveBeenCalledOnce()
    })

    it('calls onUseRemote when remote button is clicked', () => {
      const onUseRemote = vi.fn()
      render(<DiffView {...defaultProps} onUseRemote={onUseRemote} />)

      fireEvent.click(screen.getByText('Remote-Version'))
      expect(onUseRemote).toHaveBeenCalledOnce()
    })

    it('calls onManualMerge when merge button is clicked', () => {
      const onManualMerge = vi.fn()
      render(<DiffView {...defaultProps} onManualMerge={onManualMerge} />)

      fireEvent.click(screen.getByText('Manuell mergen'))
      expect(onManualMerge).toHaveBeenCalledOnce()
    })
  })

  // ─── Identical Files ───────────────────────────────────────────────────

  describe('identical files', () => {
    it('renders without errors when both contents are the same', () => {
      const content = 'same\ncontent\nhere'
      const { container } = render(
        <DiffView
          {...defaultProps}
          localContent={content}
          remoteContent={content}
        />,
      )

      expect(container.querySelector('.diff-view')).toBeInTheDocument()
      // No added or removed lines
      expect(container.querySelectorAll('.diff-view__line--added').length).toBe(0)
      expect(container.querySelectorAll('.diff-view__line--removed').length).toBe(0)
    })
  })

  // ─── Empty Content ─────────────────────────────────────────────────────

  describe('empty content', () => {
    it('handles empty localContent (empty string, not null)', () => {
      const { container } = render(
        <DiffView
          {...defaultProps}
          localContent=""
          remoteContent="new content"
        />,
      )

      expect(container.querySelector('.diff-view')).toBeInTheDocument()
    })

    it('handles both empty strings', () => {
      const { container } = render(
        <DiffView
          {...defaultProps}
          localContent=""
          remoteContent=""
        />,
      )

      expect(container.querySelector('.diff-view')).toBeInTheDocument()
    })
  })
})
