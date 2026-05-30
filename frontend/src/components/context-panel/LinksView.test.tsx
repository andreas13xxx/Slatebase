import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LinksView } from './LinksView'
import type { LinkEntry } from '../../state/contextPanelState'

describe('LinksView', () => {
  const mockOnLinkClick = vi.fn()

  const resolvedLink: LinkEntry = {
    target: 'notes/hello.md',
    displayName: 'hello',
    resolved: true,
  }

  const unresolvedLink: LinkEntry = {
    target: 'missing-note',
    displayName: 'missing-note',
    resolved: false,
  }

  beforeEach(() => {
    mockOnLinkClick.mockClear()
  })

  it('renders two sections with correct headers', () => {
    render(
      <LinksView
        forwardLinks={[]}
        backlinks={[]}
        backlinksLoading={false}
        backlinksError={null}
        onLinkClick={mockOnLinkClick}
      />,
    )

    expect(screen.getByText('Ausgehende Links')).toBeInTheDocument()
    expect(screen.getByText('Eingehende Links')).toBeInTheDocument()
  })

  it('shows placeholder when no forward links exist', () => {
    render(
      <LinksView
        forwardLinks={[]}
        backlinks={[resolvedLink]}
        backlinksLoading={false}
        backlinksError={null}
        onLinkClick={mockOnLinkClick}
      />,
    )

    expect(screen.getByText('Keine ausgehenden Links.')).toBeInTheDocument()
  })

  it('shows placeholder when no backlinks exist', () => {
    render(
      <LinksView
        forwardLinks={[resolvedLink]}
        backlinks={[]}
        backlinksLoading={false}
        backlinksError={null}
        onLinkClick={mockOnLinkClick}
      />,
    )

    expect(screen.getByText('Keine eingehenden Links.')).toBeInTheDocument()
  })

  it('shows placeholders in both sections when no links exist', () => {
    render(
      <LinksView
        forwardLinks={[]}
        backlinks={[]}
        backlinksLoading={false}
        backlinksError={null}
        onLinkClick={mockOnLinkClick}
      />,
    )

    expect(screen.getByText('Keine ausgehenden Links.')).toBeInTheDocument()
    expect(screen.getByText('Keine eingehenden Links.')).toBeInTheDocument()
  })

  it('renders forward links with display names', () => {
    render(
      <LinksView
        forwardLinks={[resolvedLink, unresolvedLink]}
        backlinks={[]}
        backlinksLoading={false}
        backlinksError={null}
        onLinkClick={mockOnLinkClick}
      />,
    )

    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(screen.getByText('missing-note')).toBeInTheDocument()
  })

  it('renders resolved links as clickable buttons', () => {
    render(
      <LinksView
        forwardLinks={[resolvedLink]}
        backlinks={[]}
        backlinksLoading={false}
        backlinksError={null}
        onLinkClick={mockOnLinkClick}
      />,
    )

    const linkButton = screen.getByText('hello')
    expect(linkButton.tagName).toBe('BUTTON')
    expect(linkButton).toHaveAttribute('title', 'notes/hello.md')
    expect(linkButton.closest('li')).toHaveClass('context-panel-link-resolved')
  })

  it('renders unresolved links as non-interactive spans', () => {
    render(
      <LinksView
        forwardLinks={[unresolvedLink]}
        backlinks={[]}
        backlinksLoading={false}
        backlinksError={null}
        onLinkClick={mockOnLinkClick}
      />,
    )

    const linkItem = screen.getByText('missing-note')
    expect(linkItem.tagName).toBe('SPAN')
    expect(linkItem.closest('li')).toHaveClass('context-panel-link-unresolved')
  })

  it('calls onLinkClick when resolved link is clicked', () => {
    render(
      <LinksView
        forwardLinks={[resolvedLink]}
        backlinks={[]}
        backlinksLoading={false}
        backlinksError={null}
        onLinkClick={mockOnLinkClick}
      />,
    )

    fireEvent.click(screen.getByText('hello'))
    expect(mockOnLinkClick).toHaveBeenCalledWith('notes/hello.md', true)
  })

  it('does not call onLinkClick when unresolved link is clicked', () => {
    render(
      <LinksView
        forwardLinks={[unresolvedLink]}
        backlinks={[]}
        backlinksLoading={false}
        backlinksError={null}
        onLinkClick={mockOnLinkClick}
      />,
    )

    fireEvent.click(screen.getByText('missing-note'))
    expect(mockOnLinkClick).not.toHaveBeenCalled()
  })

  it('shows loading state for backlinks', () => {
    render(
      <LinksView
        forwardLinks={[resolvedLink]}
        backlinks={[]}
        backlinksLoading={true}
        backlinksError={null}
        onLinkClick={mockOnLinkClick}
      />,
    )

    expect(screen.getByText('Laden…')).toBeInTheDocument()
    // Forward links should still be visible
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('shows error message when backlinks API fails', () => {
    render(
      <LinksView
        forwardLinks={[resolvedLink]}
        backlinks={[]}
        backlinksLoading={false}
        backlinksError="Eingehende Links konnten nicht geladen werden."
        onLinkClick={mockOnLinkClick}
      />,
    )

    expect(screen.getByText('Eingehende Links konnten nicht geladen werden.')).toBeInTheDocument()
    // Forward links should still be visible
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('renders backlinks when loaded successfully', () => {
    const backlink: LinkEntry = {
      target: 'other/page.md',
      displayName: 'other/page',
      resolved: true,
    }

    render(
      <LinksView
        forwardLinks={[]}
        backlinks={[backlink]}
        backlinksLoading={false}
        backlinksError={null}
        onLinkClick={mockOnLinkClick}
      />,
    )

    expect(screen.getByText('other/page')).toBeInTheDocument()
  })

  it('shows full target path as tooltip (title attribute)', () => {
    render(
      <LinksView
        forwardLinks={[resolvedLink]}
        backlinks={[]}
        backlinksLoading={false}
        backlinksError={null}
        onLinkClick={mockOnLinkClick}
      />,
    )

    const linkButton = screen.getByText('hello')
    expect(linkButton).toHaveAttribute('title', 'notes/hello.md')
  })

  it('handles keyboard navigation on resolved links via button', () => {
    render(
      <LinksView
        forwardLinks={[resolvedLink]}
        backlinks={[]}
        backlinksLoading={false}
        backlinksError={null}
        onLinkClick={mockOnLinkClick}
      />,
    )

    // Buttons handle Enter/Space natively, so we simulate a click
    const linkButton = screen.getByText('hello')
    fireEvent.click(linkButton)
    expect(mockOnLinkClick).toHaveBeenCalledWith('notes/hello.md', true)
  })
})
