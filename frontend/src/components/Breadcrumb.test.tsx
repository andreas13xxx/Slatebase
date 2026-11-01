import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Breadcrumb } from './Breadcrumb'

describe('Breadcrumb', () => {
  it('renders nothing when filePath is null', () => {
    const { container } = render(
      <Breadcrumb vaultName="MyVault" filePath={null} onSegmentClick={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows only vault name + filename for a root-level file (Requirement 7.2)', () => {
    render(<Breadcrumb vaultName="MyVault" filePath="README.md" onSegmentClick={() => {}} />)
    expect(screen.getByText('MyVault')).toBeInTheDocument()
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'README.md' })).not.toBeInTheDocument()
  })

  it('renders a clickable segment per folder plus the filename', () => {
    render(<Breadcrumb vaultName="MyVault" filePath="Projects/Alpha/notes.md" onSegmentClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'MyVault' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Projects' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument()
    expect(screen.getByText('notes.md')).toBeInTheDocument()
  })

  it('calls onSegmentClick with the folder path when a segment is clicked', () => {
    const onSegmentClick = vi.fn()
    render(<Breadcrumb vaultName="MyVault" filePath="Projects/Alpha/notes.md" onSegmentClick={onSegmentClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }))
    expect(onSegmentClick).toHaveBeenCalledWith('Projects/Alpha')
  })

  it('calls onSegmentClick with an empty string for the vault-name segment (Requirement 7.4)', () => {
    const onSegmentClick = vi.fn()
    render(<Breadcrumb vaultName="MyVault" filePath="Projects/notes.md" onSegmentClick={onSegmentClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'MyVault' }))
    expect(onSegmentClick).toHaveBeenCalledWith('')
  })

  it('collapses middle segments behind a dropdown for deeply nested paths (Requirement 7.6)', () => {
    render(
      <Breadcrumb
        vaultName="MyVault"
        filePath="A/B/C/D/notes.md"
        onSegmentClick={() => {}}
      />,
    )
    // Only the last two folders (C, D) stay visible as direct segments; A and B collapse.
    expect(screen.getByRole('button', { name: 'C' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'D' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'A' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'B' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Weitere Ordner anzeigen' }))
    expect(screen.getByRole('menuitem', { name: 'A' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'B' })).toBeInTheDocument()
  })

  it('shows no mode switcher when mode/onModeChange are not given', () => {
    render(<Breadcrumb vaultName="MyVault" filePath="notes.md" onSegmentClick={() => {}} />)
    expect(screen.queryByRole('radiogroup', { name: 'Editor-Modus' })).not.toBeInTheDocument()
  })

  it('renders the three-mode switcher with the current mode checked', () => {
    render(
      <Breadcrumb
        vaultName="MyVault"
        filePath="notes.md"
        onSegmentClick={() => {}}
        mode="reading"
        onModeChange={() => {}}
      />,
    )
    expect(screen.getByRole('radiogroup', { name: 'Editor-Modus' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Quelltext' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Live-Vorschau' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Lesemodus' })).toHaveAttribute('aria-checked', 'true')
  })

  it('calls onModeChange with the clicked mode', () => {
    const onModeChange = vi.fn()
    render(
      <Breadcrumb
        vaultName="MyVault"
        filePath="notes.md"
        onSegmentClick={() => {}}
        mode="reading"
        onModeChange={onModeChange}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Quelltext' }))
    expect(onModeChange).toHaveBeenCalledWith('source')
  })
})
