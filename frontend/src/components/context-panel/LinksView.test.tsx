import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LinksView } from './LinksView'
import type { LinksViewProps } from './LinksView'
import type { LinkEntry, UnlinkedMentionEntry } from '../../state/documentPanelData'

describe('LinksView', () => {
  const mockOnLinkClick = vi.fn()
  const mockOnUnlinkedMentionClick = vi.fn()
  const mockOnLinkMention = vi.fn().mockResolvedValue(undefined)

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

  const mention: UnlinkedMentionEntry = {
    filePath: 'other/mentions-me.md',
    snippet: 'This note mentions Hello in passing.',
    lineNumber: 3,
  }

  beforeEach(() => {
    mockOnLinkClick.mockClear()
    mockOnUnlinkedMentionClick.mockClear()
    mockOnLinkMention.mockClear()
  })

  function renderLinksView(overrides: Partial<LinksViewProps> = {}) {
    const props: LinksViewProps = {
      forwardLinks: [],
      backlinks: [],
      backlinksLoading: false,
      backlinksError: null,
      unlinkedMentions: [],
      unlinkedMentionsLoading: false,
      unlinkedMentionsError: null,
      onLinkClick: mockOnLinkClick,
      onUnlinkedMentionClick: mockOnUnlinkedMentionClick,
      onLinkMention: mockOnLinkMention,
      ...overrides,
    }
    return render(<LinksView {...props} />)
  }

  it('renders three sections with correct headers', () => {
    renderLinksView()

    expect(screen.getByText('Ausgehende Links')).toBeInTheDocument()
    expect(screen.getByText('Eingehende Links')).toBeInTheDocument()
    expect(screen.getByText('Ungelinkte Erwähnungen')).toBeInTheDocument()
  })

  it('shows placeholder when no forward links exist', () => {
    renderLinksView({ backlinks: [resolvedLink] })

    expect(screen.getByText('Keine ausgehenden Links.')).toBeInTheDocument()
  })

  it('shows placeholder when no backlinks exist', () => {
    renderLinksView({ forwardLinks: [resolvedLink] })

    expect(screen.getByText('Keine eingehenden Links.')).toBeInTheDocument()
  })

  it('shows placeholders in all sections when nothing exists', () => {
    renderLinksView()

    expect(screen.getByText('Keine ausgehenden Links.')).toBeInTheDocument()
    expect(screen.getByText('Keine eingehenden Links.')).toBeInTheDocument()
    expect(screen.getByText('Keine ungelinkten Erwähnungen gefunden.')).toBeInTheDocument()
  })

  it('renders forward links with display names', () => {
    renderLinksView({ forwardLinks: [resolvedLink, unresolvedLink] })

    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(screen.getByText('missing-note')).toBeInTheDocument()
  })

  it('renders resolved links as clickable buttons', () => {
    renderLinksView({ forwardLinks: [resolvedLink] })

    const linkButton = screen.getByText('hello')
    expect(linkButton.tagName).toBe('BUTTON')
    expect(linkButton).toHaveAttribute('title', 'notes/hello.md')
    expect(linkButton.closest('li')).toHaveClass('context-panel-link-resolved')
  })

  it('renders unresolved links as non-interactive spans', () => {
    renderLinksView({ forwardLinks: [unresolvedLink] })

    const linkItem = screen.getByText('missing-note')
    expect(linkItem.tagName).toBe('SPAN')
    expect(linkItem.closest('li')).toHaveClass('context-panel-link-unresolved')
  })

  it('calls onLinkClick when resolved link is clicked', () => {
    renderLinksView({ forwardLinks: [resolvedLink] })

    fireEvent.click(screen.getByText('hello'))
    expect(mockOnLinkClick).toHaveBeenCalledWith('notes/hello.md', true)
  })

  it('does not call onLinkClick when unresolved link is clicked', () => {
    renderLinksView({ forwardLinks: [unresolvedLink] })

    fireEvent.click(screen.getByText('missing-note'))
    expect(mockOnLinkClick).not.toHaveBeenCalled()
  })

  it('shows loading state for backlinks', () => {
    renderLinksView({ forwardLinks: [resolvedLink], backlinksLoading: true })

    expect(screen.getByText('Laden…')).toBeInTheDocument()
    // Forward links should still be visible
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('shows error message when backlinks API fails', () => {
    renderLinksView({
      forwardLinks: [resolvedLink],
      backlinksError: 'Eingehende Links konnten nicht geladen werden.',
    })

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

    renderLinksView({ backlinks: [backlink] })

    expect(screen.getByText('other/page')).toBeInTheDocument()
  })

  it('shows full target path as tooltip (title attribute)', () => {
    renderLinksView({ forwardLinks: [resolvedLink] })

    const linkButton = screen.getByText('hello')
    expect(linkButton).toHaveAttribute('title', 'notes/hello.md')
  })

  it('handles keyboard navigation on resolved links via button', () => {
    renderLinksView({ forwardLinks: [resolvedLink] })

    // Buttons handle Enter/Space natively, so we simulate a click
    const linkButton = screen.getByText('hello')
    fireEvent.click(linkButton)
    expect(mockOnLinkClick).toHaveBeenCalledWith('notes/hello.md', true)
  })

  // ─── Unlinked Mentions ───────────────────────────────────────────────────

  it('shows loading state for unlinked mentions', () => {
    renderLinksView({ unlinkedMentionsLoading: true })

    expect(screen.getByText('Wird durchsucht…')).toBeInTheDocument()
  })

  it('shows error message when the unlinked-mentions search fails', () => {
    renderLinksView({ unlinkedMentionsError: 'Ungelinkte Erwähnungen konnten nicht geladen werden.' })

    expect(screen.getByText('Ungelinkte Erwähnungen konnten nicht geladen werden.')).toBeInTheDocument()
  })

  it('renders unlinked mentions with file path and snippet', () => {
    renderLinksView({ unlinkedMentions: [mention] })

    expect(screen.getByText('other/mentions-me.md')).toBeInTheDocument()
    expect(screen.getByText('This note mentions Hello in passing.')).toBeInTheDocument()
  })

  it('calls onUnlinkedMentionClick when a mention is clicked', () => {
    renderLinksView({ unlinkedMentions: [mention] })

    fireEvent.click(screen.getByText('other/mentions-me.md'))
    expect(mockOnUnlinkedMentionClick).toHaveBeenCalledWith('other/mentions-me.md')
  })

  it('calls onLinkMention when the "Verlinken" action is triggered', async () => {
    renderLinksView({ unlinkedMentions: [mention] })

    fireEvent.click(screen.getByText('Verlinken'))
    expect(mockOnLinkMention).toHaveBeenCalledWith(mention)
    // Does not also navigate/open the file.
    expect(mockOnUnlinkedMentionClick).not.toHaveBeenCalled()
  })
})
