/**
 * Unit tests for the OutlineView component.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OutlineView } from './OutlineView'
import type { OutlineHeading } from '../../state/contextPanelState'

describe('OutlineView', () => {
  const sampleHeadings: OutlineHeading[] = [
    { text: 'Introduction', level: 1, anchor: 'introduction' },
    { text: 'Getting Started', level: 2, anchor: 'getting-started' },
    { text: 'Installation', level: 3, anchor: 'installation' },
    { text: 'Configuration', level: 2, anchor: 'configuration' },
    { text: 'Advanced Topics', level: 1, anchor: 'advanced-topics' },
  ]

  it('renders headings as a list', () => {
    render(
      <OutlineView headings={sampleHeadings} activeAnchor={null} onHeadingClick={() => {}} />
    )

    expect(screen.getByText('Introduction')).toBeInTheDocument()
    expect(screen.getByText('Getting Started')).toBeInTheDocument()
    expect(screen.getByText('Installation')).toBeInTheDocument()
    expect(screen.getByText('Configuration')).toBeInTheDocument()
    expect(screen.getByText('Advanced Topics')).toBeInTheDocument()
  })

  it('applies correct indentation per heading level', () => {
    render(
      <OutlineView headings={sampleHeadings} activeAnchor={null} onHeadingClick={() => {}} />
    )

    const items = screen.getAllByRole('listitem')
    // level 1 → (1-1)*12 = 0px
    expect(items[0]).toHaveStyle({ paddingLeft: '0px' })
    // level 2 → (2-1)*12 = 12px
    expect(items[1]).toHaveStyle({ paddingLeft: '12px' })
    // level 3 → (3-1)*12 = 24px
    expect(items[2]).toHaveStyle({ paddingLeft: '24px' })
    // level 2 → 12px
    expect(items[3]).toHaveStyle({ paddingLeft: '12px' })
    // level 1 → 0px
    expect(items[4]).toHaveStyle({ paddingLeft: '0px' })
  })

  it('highlights the active heading', () => {
    render(
      <OutlineView headings={sampleHeadings} activeAnchor="configuration" onHeadingClick={() => {}} />
    )

    const items = screen.getAllByRole('listitem')
    // Configuration is at index 3
    expect(items[3]).toHaveClass('outline-view__item--active')
    // Others should not have the active class
    expect(items[0]).not.toHaveClass('outline-view__item--active')
    expect(items[1]).not.toHaveClass('outline-view__item--active')
  })

  it('calls onHeadingClick with the anchor when a heading is clicked', () => {
    const onHeadingClick = vi.fn()
    render(
      <OutlineView headings={sampleHeadings} activeAnchor={null} onHeadingClick={onHeadingClick} />
    )

    fireEvent.click(screen.getByText('Installation'))
    expect(onHeadingClick).toHaveBeenCalledWith('installation')
  })

  it('shows placeholder when no headings found', () => {
    render(
      <OutlineView headings={[]} activeAnchor={null} onHeadingClick={() => {}} />
    )

    expect(screen.getByText('Keine Überschriften gefunden')).toBeInTheDocument()
  })

  it('shows placeholder when no document is open', () => {
    render(
      <OutlineView headings={[]} activeAnchor={null} onHeadingClick={() => {}} hasDocument={false} />
    )

    expect(screen.getByText('Kein Dokument geöffnet')).toBeInTheDocument()
  })

  it('sets aria-current on the active heading button', () => {
    render(
      <OutlineView headings={sampleHeadings} activeAnchor="introduction" onHeadingClick={() => {}} />
    )

    const activeButton = screen.getByText('Introduction')
    expect(activeButton).toHaveAttribute('aria-current', 'location')

    const inactiveButton = screen.getByText('Getting Started')
    expect(inactiveButton).not.toHaveAttribute('aria-current')
  })

  it('sets title attribute on heading buttons for tooltip', () => {
    render(
      <OutlineView headings={sampleHeadings} activeAnchor={null} onHeadingClick={() => {}} />
    )

    const button = screen.getByText('Introduction')
    expect(button).toHaveAttribute('title', 'Introduction')
  })

  it('renders a nav element with aria-label', () => {
    render(
      <OutlineView headings={sampleHeadings} activeAnchor={null} onHeadingClick={() => {}} />
    )

    const nav = screen.getByRole('navigation')
    expect(nav).toHaveAttribute('aria-label', 'Dokumentgliederung')
  })
})
